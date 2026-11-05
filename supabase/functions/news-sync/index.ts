// Vena OS · Noticias
// Cada hora, pg_cron llama a esta función (ver la migración news_schedule). Revisa las
// fuentes, completa imagen y descripción desde la página del artículo cuando el feed no
// las trae, y guarda solo lo nuevo en news_items. La app únicamente lee esa tabla.
//
// Se autentica con el secreto news_cron_secret de Vault (cabecera x-cron-secret), por eso
// se despliega con verify_jwt desactivado.
import { createClient } from 'npm:@supabase/supabase-js@2';
import {
  dayStaysPut,
  normalizeUrl,
  parseFeed,
  parsePage,
  parseSitemap,
  sameTitleKey,
  stripSourceSuffix,
  type Candidate,
} from './parse.ts';
import { SOURCES, type Source } from './sources.ts';

const USER_AGENT = 'Mozilla/5.0 (compatible; VenaOS-Noticias/1.0; +https://os.venadigital.com.co)';
const ITEMS_PER_SOURCE = 12;
const MAX_AGE_DAYS = 30;
const KEEP_DAYS = 60;
const FEED_BYTES = 600_000;
const PAGE_BYTES = 400_000;
const REQUEST_MS = 12_000;
const MAX_PARALLEL = 8;
// Supabase corta la respuesta a los 150 s: lo que falte queda para la hora siguiente.
const STOP_ENRICHING_AFTER_MS = 100_000;
const SHORT_SUMMARY = 60;

const DAY = 86_400_000;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

let active = 0;
const waiting: (() => void)[] = [];
async function limited<T>(run: () => Promise<T>): Promise<T> {
  if (active >= MAX_PARALLEL) await new Promise<void>((resolve) => waiting.push(resolve));
  active++;
  try {
    return await run();
  } finally {
    active--;
    waiting.shift()?.();
  }
}

/** Reads at most `maxBytes`, and stops as soon as `until` appears. */
function fetchText(url: string, maxBytes: number, until?: string): Promise<string> {
  return limited(async () => {
    const res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/rss+xml, application/xml, text/xml, text/html, */*' },
      redirect: 'follow',
      signal: AbortSignal.timeout(REQUEST_MS),
    });
    if (!res.ok || !res.body) {
      await res.body?.cancel();
      throw new Error(`HTTP ${res.status}`);
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let text = '';
    let bytes = 0;
    while (bytes < maxBytes) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.length;
      text += decoder.decode(value, { stream: true });
      if (until && text.includes(until)) break;
    }
    await reader.cancel().catch(() => undefined);
    return text;
  });
}

type Read = { candidates: Candidate[]; canEnrich: boolean; via: string };

async function readFeed(source: Source): Promise<Read> {
  try {
    const candidates = parseFeed(await fetchText(source.feed as string, FEED_BYTES), ITEMS_PER_SOURCE);
    if (candidates.length) return { candidates, canEnrich: !source.noPages, via: 'rss' };
    throw new Error('el feed no trae artículos');
  } catch (err) {
    if (!source.fallbackNews) throw err;
  }
  const newest = parseFeed(await fetchText(source.fallbackNews, FEED_BYTES), 40)
    .sort((a, b) => (b.published?.getTime() ?? 0) - (a.published?.getTime() ?? 0))
    .slice(0, ITEMS_PER_SOURCE);
  return {
    // Google News solo da el título y un enlace de redirección: no hay página que leer.
    candidates: newest.map((c) => ({ ...c, title: stripSourceSuffix(c.title, source.name), summary: null, image: null })),
    canEnrich: false,
    via: 'google-news',
  };
}

async function readSitemap(source: Source): Promise<Read> {
  const rows = parseSitemap(await fetchText(source.sitemap as string, 2_000_000), source.path as string, ITEMS_PER_SOURCE);
  return {
    candidates: rows.map((r) => ({ url: r.url, title: '', summary: null, image: null, published: r.lastmod })),
    canEnrich: true,
    via: 'sitemap',
  };
}

async function syncSource(sb: ReturnType<typeof createClient>, source: Source, startedAt: number) {
  const started = Date.now();
  const read = source.sitemap ? await readSitemap(source) : await readFeed(source);
  if (!read.candidates.length) throw new Error('no se encontraron artículos');

  const since = new Date(Date.now() - KEEP_DAYS * DAY).toISOString();
  const { data: known, error: knownError } = await sb.from('news_items').select('url, title').eq('source', source.slug).gte('published_at', since);
  if (knownError) throw new Error(knownError.message);
  const knownUrls = new Set((known ?? []).map((r) => r.url as string));
  const knownTitles = new Set((known ?? []).map((r) => sameTitleKey(r.title as string)));

  const oldest = Date.now() - MAX_AGE_DAYS * DAY;
  const fresh = read.candidates
    .map((c) => ({ ...c, url: normalizeUrl(c.url) ?? '' }))
    .filter((c) => c.url && !knownUrls.has(c.url) && (!c.title || !knownTitles.has(sameTitleKey(c.title))))
    .filter((c) => !c.published || c.published.getTime() >= oldest);

  let pagesFailed = 0;
  const rows = await Promise.all(
    fresh.map(async (c) => {
      const needsPage = read.canEnrich && (!c.title || !c.image || !c.summary || c.summary.length < SHORT_SUMMARY || source.bodySummary);
      if (needsPage && Date.now() - startedAt < STOP_ENRICHING_AFTER_MS) {
        try {
          const html = await fetchText(c.url, PAGE_BYTES, source.bodySummary ? undefined : '</head>');
          const page = parsePage(html, c.url, { bodySummary: source.bodySummary });
          c.title ||= page.title ?? '';
          c.image ||= page.image;
          if (source.bodySummary || !c.summary || (page.summary?.length ?? 0) > c.summary.length) c.summary = page.summary ?? c.summary;
          // El sitemap dice cuándo cambió; la página, cuándo se publicó.
          if (page.published) c.published = page.published;
        } catch {
          pagesFailed++;
        }
      }
      return c;
    }),
  );

  const now = Date.now();
  const toSave = rows
    .filter((c) => c.title && (!c.published || c.published.getTime() >= oldest) && !knownTitles.has(sameTitleKey(c.title)))
    .map((c) => ({
      source: source.slug,
      url: c.url,
      title: c.title.slice(0, 400),
      summary: c.summary,
      image_url: c.image,
      published_at: new Date(Math.min(dayStaysPut(c.published)?.getTime() ?? now, now)).toISOString(),
    }));
  if (toSave.length) {
    const { error } = await sb.from('news_items').upsert(toSave, { onConflict: 'url', ignoreDuplicates: true });
    if (error) throw new Error(error.message);
  }
  return {
    source: source.slug,
    via: read.via,
    read: read.candidates.length,
    saved: toSave.length,
    withImage: toSave.filter((r) => r.image_url).length,
    withSummary: toSave.filter((r) => r.summary).length,
    pagesFailed,
    ms: Date.now() - started,
  };
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);

  const sb = createClient(Deno.env.get('SUPABASE_URL') as string, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') as string, {
    auth: { persistSession: false },
  });
  const { data: authorized, error: authError } = await sb.rpc('news_sync_authorized', { p_secret: req.headers.get('x-cron-secret') ?? '' });
  if (authError) return json({ error: authError.message }, 500);
  if (authorized !== true) return json({ error: 'unauthorized' }, 401);

  const { error: sourcesError } = await sb
    .from('news_sources')
    .upsert(SOURCES.map(({ slug, name, site }) => ({ slug, name, site })), { onConflict: 'slug' });
  if (sourcesError) return json({ error: sourcesError.message }, 500);

  const startedAt = Date.now();
  const reports = await Promise.all(
    SOURCES.map(async (source) => {
      const checkedAt = new Date().toISOString();
      try {
        const report = await syncSource(sb, source, startedAt);
        await sb.from('news_sources').update({ last_checked_at: checkedAt, last_ok_at: checkedAt, last_error: null }).eq('slug', source.slug);
        return report;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        await sb.from('news_sources').update({ last_checked_at: checkedAt, last_error: message.slice(0, 300) }).eq('slug', source.slug);
        return { source: source.slug, error: message };
      }
    }),
  );

  await sb.from('news_items').delete().lt('published_at', new Date(Date.now() - KEEP_DAYS * DAY).toISOString());

  return json({ ms: Date.now() - startedAt, reports });
});
