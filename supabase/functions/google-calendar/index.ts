// Vena OS · Calendario
// Puente entre la app y Google Calendar. La app nunca ve los tokens de Google:
// esta función guarda el refresh token (tabla google_connections, solo service role),
// lo renueva y reenvía cada operación a la API de Google en nombre de la usuaria.
//
// Secretos necesarios (Supabase → Edge Functions → Secrets):
//   GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET
//
// Todas las llamadas son POST con JSON { action, ... } y el JWT de la sesión.
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';

const SCOPES = [
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/calendar.calendarlist.readonly',
];
const EVENTS_SCOPE = SCOPES[0];
const GOOGLE_API = 'https://www.googleapis.com/calendar/v3';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';

const EVENT_FIELDS =
  'id,status,summary,description,location,htmlLink,start,end,recurringEventId,colorId,eventType,guestsCanModify,hangoutLink,' +
  'attendees(email,displayName,responseStatus,self,organizer),organizer(email,displayName,self),' +
  'conferenceData(entryPoints(entryPointType,uri))';
// Lo único que la app puede escribir en un evento.
const WRITABLE = ['summary', 'description', 'location', 'start', 'end', 'attendees'] as const;

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

type Connection = {
  user_id: string;
  email: string;
  refresh_token: string;
  access_token: string | null;
  access_expires_at: string | null;
};
type GDate = { date?: string; dateTime?: string; timeZone?: string };
type Dict = Record<string, unknown>;

function env(name: string): string {
  return Deno.env.get(name)?.trim() ?? '';
}

function adminClient(): SupabaseClient {
  let key = env('SUPABASE_SERVICE_ROLE_KEY');
  if (!key) {
    try {
      key = JSON.parse(env('SUPABASE_SECRET_KEYS') || '{}').default ?? '';
    } catch {
      key = '';
    }
  }
  return createClient(env('SUPABASE_URL'), key, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function requireUser(req: Request, admin: SupabaseClient): Promise<string> {
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!token) throw new ApiError(401, 'unauthorized', 'Falta la sesión');
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) throw new ApiError(401, 'unauthorized', 'Sesión inválida o expirada');
  return data.user.id;
}

function googleCreds() {
  const id = env('GOOGLE_CLIENT_ID');
  const secret = env('GOOGLE_CLIENT_SECRET');
  if (!id || !secret) throw new ApiError(503, 'not_configured', 'Faltan GOOGLE_CLIENT_ID y GOOGLE_CLIENT_SECRET en los secretos de Supabase');
  return { id, secret };
}

async function tokenRequest(params: Record<string, string>): Promise<Dict> {
  const { id, secret } = googleCreds();
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: id, client_secret: secret, ...params }),
  });
  const body = (await res.json().catch(() => ({}))) as Dict;
  if (!res.ok) {
    const code = String(body.error ?? 'token_error');
    throw new ApiError(code === 'invalid_grant' ? 409 : 502, code === 'invalid_grant' ? 'invalid_grant' : 'google_token', String(body.error_description ?? code));
  }
  return body;
}

async function getConnection(admin: SupabaseClient, userId: string): Promise<Connection | null> {
  const { data, error } = await admin.from('google_connections').select('*').eq('user_id', userId).maybeSingle();
  if (error) throw new ApiError(500, 'db', error.message);
  return data as Connection | null;
}

/** A valid access token, renewed with the stored refresh token when needed. */
async function accessToken(admin: SupabaseClient, userId: string): Promise<string> {
  const conn = await getConnection(admin, userId);
  if (!conn) throw new ApiError(409, 'not_connected', 'Google Calendar no está conectado');
  if (conn.access_token && conn.access_expires_at && new Date(conn.access_expires_at).getTime() > Date.now() + 60_000) {
    return conn.access_token;
  }
  try {
    const t = await tokenRequest({ grant_type: 'refresh_token', refresh_token: conn.refresh_token });
    const token = String(t.access_token);
    const expires = new Date(Date.now() + Number(t.expires_in ?? 3600) * 1000).toISOString();
    await admin.from('google_connections').update({ access_token: token, access_expires_at: expires }).eq('user_id', userId);
    return token;
  } catch (err) {
    // Google revocó el permiso (o caducó): hay que volver a conectar.
    if (err instanceof ApiError && err.code === 'invalid_grant') {
      await admin.from('google_connections').delete().eq('user_id', userId);
      throw new ApiError(409, 'not_connected', 'Google retiró el permiso. Vuelve a conectar tu calendario.');
    }
    throw err;
  }
}

async function google<T = Dict>(token: string, method: string, path: string, query: Record<string, string | undefined> = {}, body?: unknown): Promise<T> {
  const url = new URL(GOOGLE_API + path);
  for (const [k, v] of Object.entries(query)) if (v !== undefined) url.searchParams.set(k, v);
  const res = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${token}`, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (res.status === 204) return {} as T;
  const data = (await res.json().catch(() => ({}))) as Dict;
  if (!res.ok) {
    const message = String((data.error as Dict | undefined)?.message ?? `Google respondió ${res.status}`);
    throw new ApiError(res.status === 404 || res.status === 410 ? 404 : res.status === 403 ? 403 : 502, `google_${res.status}`, message);
  }
  return data as T;
}

const enc = encodeURIComponent;
const str = (v: unknown, max = 8192) => (typeof v === 'string' ? v.slice(0, max) : '');

function cleanResource(input: unknown): Dict {
  const src = (input && typeof input === 'object' ? input : {}) as Dict;
  const out: Dict = {};
  for (const k of WRITABLE) if (k in src) out[k] = src[k];
  return out;
}

function withMeet(resource: Dict, meet: unknown): Dict {
  if (meet === 'add') {
    resource.conferenceData = { createRequest: { requestId: crypto.randomUUID(), conferenceSolutionKey: { type: 'hangoutsMeet' } } };
  } else if (meet === 'remove') {
    resource.conferenceData = null;
  }
  return resource;
}

const DAY = 86_400_000;
const addDays = (date: string, days: number) => new Date(Date.parse(date) + days * DAY).toISOString().slice(0, 10);

/** New start/end for the whole series, moved as much as the edited occurrence was. */
function shiftSeries(master: { start: GDate; end: GDate }, instanceStart: GDate, start: GDate, end: GDate): { start: GDate; end: GDate } {
  if (start.date && end.date) {
    if (!master.start.date || !instanceStart.date) throw new ApiError(400, 'series_type_change', 'No se puede cambiar toda la serie entre «todo el día» y con hora');
    const s = addDays(master.start.date, Math.round((Date.parse(start.date) - Date.parse(instanceStart.date)) / DAY));
    return { start: { date: s }, end: { date: addDays(s, Math.round((Date.parse(end.date) - Date.parse(start.date)) / DAY)) } };
  }
  if (!start.dateTime || !end.dateTime || !master.start.dateTime || !instanceStart.dateTime) {
    throw new ApiError(400, 'series_type_change', 'No se puede cambiar toda la serie entre «todo el día» y con hora');
  }
  const s = Date.parse(master.start.dateTime) + (Date.parse(start.dateTime) - Date.parse(instanceStart.dateTime));
  const length = Date.parse(end.dateTime) - Date.parse(start.dateTime);
  return {
    start: { dateTime: new Date(s).toISOString(), timeZone: master.start.timeZone ?? start.timeZone },
    end: { dateTime: new Date(s + length).toISOString(), timeZone: master.end.timeZone ?? end.timeZone },
  };
}

// ---------------------------------------------------------------- actions
type Ctx = { admin: SupabaseClient; userId: string; body: Dict };

const actions: Record<string, (ctx: Ctx) => Promise<unknown>> = {
  async status({ admin, userId }) {
    const configured = Boolean(env('GOOGLE_CLIENT_ID') && env('GOOGLE_CLIENT_SECRET'));
    const conn = await getConnection(admin, userId);
    return { configured, connected: Boolean(conn), email: conn?.email ?? null };
  },

  async auth_url({ body }) {
    const { id } = googleCreds();
    const redirect = str(body.redirect_uri, 300);
    const state = str(body.state, 200);
    if (!/^https?:\/\//.test(redirect) || !state) throw new ApiError(400, 'bad_request', 'redirect_uri y state son obligatorios');
    const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    url.search = new URLSearchParams({
      client_id: id,
      redirect_uri: redirect,
      response_type: 'code',
      scope: SCOPES.join(' '),
      access_type: 'offline',
      prompt: 'consent',
      state,
    }).toString();
    return { url: url.toString() };
  },

  async connect({ admin, userId, body }) {
    const t = await tokenRequest({ grant_type: 'authorization_code', code: str(body.code, 1000), redirect_uri: str(body.redirect_uri, 300) });
    const granted = String(t.scope ?? '');
    if (!granted.split(' ').includes(EVENTS_SCOPE)) {
      throw new ApiError(400, 'missing_scope', 'Falta el permiso para ver y editar eventos. Vuelve a conectar y marca todas las casillas.');
    }
    if (!t.refresh_token) throw new ApiError(400, 'no_refresh_token', 'Google no entregó un permiso permanente. Intenta conectar de nuevo.');
    const token = String(t.access_token);
    let email = '';
    try {
      const list = await google<{ items?: { id: string; primary?: boolean }[] }>(token, 'GET', '/users/me/calendarList', { fields: 'items(id,primary)', maxResults: '250' });
      email = list.items?.find((c) => c.primary)?.id ?? '';
    } catch {
      // Sin el permiso de lista de calendarios seguimos con el principal.
    }
    const { error } = await admin.from('google_connections').upsert({
      user_id: userId,
      email,
      refresh_token: String(t.refresh_token),
      scopes: granted,
      access_token: token,
      access_expires_at: new Date(Date.now() + Number(t.expires_in ?? 3600) * 1000).toISOString(),
      connected_at: new Date().toISOString(),
    });
    if (error) throw new ApiError(500, 'db', error.message);
    return { connected: true, email };
  },

  async disconnect({ admin, userId }) {
    const conn = await getConnection(admin, userId);
    if (conn) {
      await fetch(`https://oauth2.googleapis.com/revoke?token=${enc(conn.refresh_token)}`, { method: 'POST' }).catch(() => undefined);
      await admin.from('google_connections').delete().eq('user_id', userId);
    }
    return { connected: false };
  },

  async calendars({ admin, userId }) {
    const token = await accessToken(admin, userId);
    try {
      const list = await google<{ items?: Dict[] }>(token, 'GET', '/users/me/calendarList', {
        maxResults: '250',
        fields: 'items(id,summary,summaryOverride,backgroundColor,primary,accessRole,selected,hidden)',
      });
      return { calendars: list.items ?? [] };
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) {
        return { calendars: [{ id: 'primary', summary: 'Mi calendario', primary: true, accessRole: 'owner', selected: true }] };
      }
      throw err;
    }
  },

  async events({ admin, userId, body }) {
    const token = await accessToken(admin, userId);
    const timeMin = str(body.timeMin, 40);
    const timeMax = str(body.timeMax, 40);
    const ids = Array.isArray(body.calendarIds) ? body.calendarIds.map((c) => str(c, 300)).filter(Boolean).slice(0, 40) : [];
    if (!timeMin || !timeMax || ids.length === 0) throw new ApiError(400, 'bad_request', 'timeMin, timeMax y calendarIds son obligatorios');
    const failed: string[] = [];
    const perCalendar = await Promise.all(
      ids.map(async (calendarId) => {
        const items: Dict[] = [];
        let pageToken: string | undefined;
        try {
          for (let page = 0; page < 4; page++) {
            const res = await google<{ items?: Dict[]; nextPageToken?: string }>(token, 'GET', `/calendars/${enc(calendarId)}/events`, {
              singleEvents: 'true',
              orderBy: 'startTime',
              timeMin,
              timeMax,
              maxResults: '1000',
              pageToken,
              fields: `nextPageToken,items(${EVENT_FIELDS})`,
            });
            for (const it of res.items ?? []) items.push({ ...it, calendarId });
            pageToken = res.nextPageToken;
            if (!pageToken) break;
          }
        } catch {
          failed.push(calendarId);
        }
        return items;
      }),
    );
    return { events: perCalendar.flat(), failed };
  },

  async create({ admin, userId, body }) {
    const token = await accessToken(admin, userId);
    const resource = withMeet(cleanResource(body.event), body.meet);
    const event = await google(token, 'POST', `/calendars/${enc(str(body.calendarId, 300) || 'primary')}/events`, {
      sendUpdates: body.notify ? 'all' : 'none',
      conferenceDataVersion: '1',
      fields: EVENT_FIELDS,
    }, resource);
    return { event };
  },

  async update({ admin, userId, body }) {
    const token = await accessToken(admin, userId);
    const calendarId = str(body.calendarId, 300);
    let eventId = str(body.eventId, 1100);
    const resource = withMeet(cleanResource(body.event), body.meet);
    if (body.scope === 'all' && body.seriesId) {
      eventId = str(body.seriesId, 1100);
      if (resource.start && resource.end) {
        const master = await google<{ start: GDate; end: GDate }>(token, 'GET', `/calendars/${enc(calendarId)}/events/${enc(eventId)}`, { fields: 'start,end' });
        Object.assign(resource, shiftSeries(master, (body.instanceStart ?? {}) as GDate, resource.start as GDate, resource.end as GDate));
      }
    }
    const event = await google(token, 'PATCH', `/calendars/${enc(calendarId)}/events/${enc(eventId)}`, {
      sendUpdates: body.notify ? 'all' : 'none',
      conferenceDataVersion: '1',
      fields: EVENT_FIELDS,
    }, resource);
    return { event };
  },

  async delete({ admin, userId, body }) {
    const token = await accessToken(admin, userId);
    const id = body.scope === 'all' && body.seriesId ? str(body.seriesId, 1100) : str(body.eventId, 1100);
    try {
      await google(token, 'DELETE', `/calendars/${enc(str(body.calendarId, 300))}/events/${enc(id)}`, { sendUpdates: body.notify ? 'all' : 'none' });
    } catch (err) {
      if (!(err instanceof ApiError && err.status === 404)) throw err; // ya estaba borrado
    }
    return { deleted: true };
  },

  /** RSVP: sí / no / quizás a una invitación. */
  async respond({ admin, userId, body }) {
    const token = await accessToken(admin, userId);
    const response = str(body.response, 20);
    if (!['accepted', 'declined', 'tentative'].includes(response)) throw new ApiError(400, 'bad_request', 'Respuesta inválida');
    const path = `/calendars/${enc(str(body.calendarId, 300))}/events/${enc(str(body.eventId, 1100))}`;
    const current = await google<{ attendees?: Dict[] }>(token, 'GET', path, { fields: 'attendees' });
    const attendees = (current.attendees ?? []).map((a) => (a.self ? { ...a, responseStatus: response } : a));
    if (!attendees.some((a) => a.self)) throw new ApiError(400, 'not_invited', 'No estás en la lista de invitados');
    const event = await google(token, 'PATCH', path, { sendUpdates: 'all', fields: EVENT_FIELDS }, { attendees });
    return { event };
  },
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    if (req.method !== 'POST') throw new ApiError(405, 'method', 'Usa POST');
    const admin = adminClient();
    const userId = await requireUser(req, admin);
    const body = ((await req.json().catch(() => ({}))) ?? {}) as Dict;
    const name = str(body.action, 40);
    const action = Object.hasOwn(actions, name) ? actions[name] : undefined;
    if (!action) throw new ApiError(400, 'bad_request', 'Acción desconocida');
    return json(await action({ admin, userId, body }));
  } catch (err) {
    if (err instanceof ApiError) return json({ error: { code: err.code, message: err.message } }, err.status);
    console.error(err);
    return json({ error: { code: 'internal', message: 'Error interno' } }, 500);
  }
});
