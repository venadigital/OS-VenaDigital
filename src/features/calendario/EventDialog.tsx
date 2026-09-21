import { useEffect, useMemo, useState, type KeyboardEvent } from 'react';
import { addDays, addMinutes, differenceInCalendarDays, format, isSameDay, startOfDay } from 'date-fns';
import { Check, CircleHelp, Copy, ExternalLink, Repeat, Trash2, Video, X } from 'lucide-react';
import { Button, cx, Dialog, Dot, Field, IconButton, Input, Select, Textarea } from '@/components/ui';
import { useToast } from '@/components/Toast';
import { useApiMutation } from '@/data/hooks';
import type { AttendeeStatus, CalendarAttendee, CalendarEvent, CalendarEventInput, CalendarInfo, SeriesScope } from '@/data/types';
import { isEmail } from '@/lib/googleCalendar';
import { fromDayKey } from '@/lib/time';

export type EventDraft = { event?: CalendarEvent; start?: Date; allDay?: boolean };

const EVENT_KEYS = [['calendar', 'events']];
const STATUS_LABEL: Record<AttendeeStatus, string> = { accepted: 'Asiste', declined: 'No asiste', tentative: 'Quizás', needsAction: 'Sin responder' };

const dateValue = (d: Date) => format(d, 'yyyy-MM-dd');
const timeValue = (d: Date) => format(d, 'HH:mm');
const withTime = (date: string, time: string) => {
  const [h, m] = time.split(':').map(Number);
  return addMinutes(fromDayKey(date), (h || 0) * 60 + (m || 0));
};

type Form = {
  title: string;
  allDay: boolean;
  startDate: string;
  startTime: string;
  /** For all-day events this is the LAST day (inclusive), the way people think about it. */
  endDate: string;
  endTime: string;
  calendarId: string;
  location: string;
  description: string;
  guests: { email: string; name: string | null; status?: AttendeeStatus }[];
  meet: boolean;
  notify: boolean;
};

function initialForm(draft: EventDraft, calendars: CalendarInfo[]): Form {
  const e = draft.event;
  const start = e ? new Date(e.start) : (draft.start ?? new Date());
  const allDay = e ? e.allDay : Boolean(draft.allDay);
  const end = e ? new Date(e.end) : allDay ? addDays(startOfDay(start), 1) : addMinutes(start, 60);
  const base = allDay && !e ? addMinutes(startOfDay(start), 9 * 60) : start;
  return {
    title: e && e.title !== '(Sin título)' ? e.title : '',
    allDay,
    startDate: dateValue(start),
    startTime: timeValue(e && !allDay ? start : base),
    endDate: dateValue(allDay ? addDays(end, -1) : end),
    endTime: timeValue(e && !allDay ? end : addMinutes(base, 60)),
    calendarId: e?.calendarId ?? (calendars.find((c) => c.primary && c.writable) ?? calendars.find((c) => c.writable))?.id ?? '',
    location: e?.location ?? '',
    description: e?.description ?? '',
    guests: (e?.attendees ?? []).filter((a) => !a.self).map((a) => ({ email: a.email, name: a.name, status: a.status })),
    meet: Boolean(e?.meetUrl),
    notify: true,
  };
}

function formRange(f: Form): { start: Date; end: Date } {
  if (f.allDay) return { start: fromDayKey(f.startDate), end: addDays(fromDayKey(f.endDate), 1) };
  return { start: withTime(f.startDate, f.startTime), end: withTime(f.endDate, f.endTime) };
}

export function EventDialog({ draft, onClose, calendars }: { draft: EventDraft | null; onClose: () => void; calendars: CalendarInfo[] }) {
  const toast = useToast();
  const event = draft?.event;
  const [form, setForm] = useState<Form>(() => initialForm({}, calendars));
  const [guestText, setGuestText] = useState('');
  const [scopeFor, setScopeFor] = useState<'save' | 'delete' | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  // Shown inside the dialog: toasts sit behind the modal backdrop.
  const [problem, setProblem] = useState('');

  useEffect(() => {
    if (!draft) return;
    setForm(initialForm(draft, calendars));
    setGuestText('');
    setScopeFor(null);
    setConfirmDelete(false);
    setProblem('');
  }, [draft]);

  const calendar = calendars.find((c) => c.id === form.calendarId);
  const writable = calendars.filter((c) => c.writable);
  const readOnly = Boolean(event) && !event!.canEdit;
  const canDelete = Boolean(event) && Boolean(calendar?.writable);
  const self = event?.attendees.find((a) => a.self);
  const invited = Boolean(self && !self.organizer);
  const set = <K extends keyof Form>(key: K, value: Form[K]) => setForm((f) => ({ ...f, [key]: value }));

  const { start, end } = useMemo(() => formRange(form), [form]);
  const validRange = !Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime()) && end > start;
  const pendingGuest = guestText.trim();
  const validGuestText = !pendingGuest || isEmail(pendingGuest);

  /** Moving the start drags the end along, keeping the duration. */
  const moveStart = (patch: Partial<Pick<Form, 'startDate' | 'startTime'>>) =>
    setForm((f) => {
      const before = formRange(f);
      const next = { ...f, ...patch };
      const after = formRange(next);
      if (Number.isNaN(after.start.getTime()) || Number.isNaN(before.start.getTime())) return next;
      const newEnd = new Date(after.start.getTime() + (before.end.getTime() - before.start.getTime()));
      return { ...next, endDate: dateValue(f.allDay ? addDays(newEnd, -1) : newEnd), endTime: f.allDay ? f.endTime : timeValue(newEnd) };
    });

  const addGuest = () => {
    const emails = guestText.split(/[\s,;]+/).map((s) => s.trim().toLowerCase()).filter(Boolean);
    if (emails.length === 0) return true;
    if (!emails.every(isEmail)) {
      setProblem('Revisa el correo del invitado.');
      return false;
    }
    setForm((f) => ({ ...f, guests: [...f.guests, ...emails.filter((m) => !f.guests.some((g) => g.email.toLowerCase() === m)).map((email) => ({ email, name: null }))] }));
    setGuestText('');
    setProblem('');
    return true;
  };
  const onGuestKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',' || e.key === ';') {
      e.preventDefault();
      addGuest();
    } else if (e.key === 'Backspace' && !guestText && form.guests.length) {
      set('guests', form.guests.slice(0, -1));
    }
  };

  const buildInput = (): CalendarEventInput => {
    const typed: Form['guests'] = pendingGuest && isEmail(pendingGuest) ? [{ email: pendingGuest.toLowerCase(), name: null }] : [];
    const guests = [...form.guests, ...typed.filter((t) => !form.guests.some((g) => g.email.toLowerCase() === t.email))];
    // Keep myself on the list once there are guests, so my own answer is not lost.
    const me = self ? [{ email: self.email, status: self.status }] : [];
    return {
      calendarId: form.calendarId,
      title: form.title,
      description: form.description,
      location: form.location,
      allDay: form.allDay,
      start: start.toISOString(),
      end: end.toISOString(),
      attendees: guests.length ? [...me, ...guests.map((g) => ({ email: g.email, status: g.status }))] : [],
      meet: form.meet,
    };
  };

  const save = useApiMutation(
    async (api, scope: SeriesScope) => {
      const input = buildInput();
      if (event) await api.updateCalendarEvent(event, input, { scope, notify: form.notify && input.attendees.length > 0 });
      else await api.createCalendarEvent(input, { notify: form.notify && input.attendees.length > 0 });
    },
    EVENT_KEYS,
    'No se pudo guardar el evento',
  );
  const remove = useApiMutation(
    (api, scope: SeriesScope) => api.deleteCalendarEvent(event!, { scope, notify: form.notify && event!.attendees.length > 0 && !invited }),
    EVENT_KEYS,
    'No se pudo eliminar el evento',
  );
  const respond = useApiMutation(
    (api, response: Exclude<AttendeeStatus, 'needsAction'>) => api.respondCalendarEvent(event!, response),
    EVENT_KEYS,
    'No se pudo responder',
  );
  const busy = save.isPending || remove.isPending || respond.isPending;

  const run = (action: 'save' | 'delete', scope: SeriesScope) => {
    if (action === 'save' && scope === 'all' && event) {
      if (form.allDay !== event.allDay || !isSameDay(start, new Date(event.start)) || differenceInCalendarDays(end, start) !== differenceInCalendarDays(new Date(event.end), new Date(event.start))) {
        setProblem('Para mover toda la serie a otro día, hazlo en Google Calendar. Aquí puedes cambiarle la hora a la serie o mover solo este evento.');
        return;
      }
    }
    const done = {
      onSuccess: () => {
        toast(action === 'delete' ? 'Evento eliminado' : event ? 'Evento actualizado' : 'Evento creado');
        onClose();
      },
      onError: (err: unknown) => setProblem(err instanceof Error ? err.message : 'No se pudo completar la acción.'),
    };
    if (action === 'save') save.mutate(scope, done);
    else remove.mutate(scope, done);
  };
  const request = (action: 'save' | 'delete') => {
    setProblem('');
    if (action === 'save' && !validGuestText) {
      setProblem('Revisa el correo del invitado.');
      return;
    }
    if (event?.seriesId) setScopeFor(action);
    else if (action === 'delete' && !confirmDelete) setConfirmDelete(true);
    else run(action, 'this');
  };

  const copyMeet = async () => {
    try {
      await navigator.clipboard.writeText(event?.meetUrl ?? '');
      toast('Enlace copiado');
    } catch {
      toast('No se pudo copiar', 'error');
    }
  };

  const guestCount = form.guests.length + (pendingGuest && isEmail(pendingGuest) ? 1 : 0);

  return (
    <>
      <Dialog
        open={Boolean(draft)}
        onClose={onClose}
        width={540}
        title={event ? (readOnly ? 'Evento' : 'Editar evento') : 'Nuevo evento'}
        footer={
          <>
            {canDelete && (
              <Button variant="danger" icon={<Trash2 size={15} />} className="mr-auto" disabled={busy} onClick={() => request('delete')}>
                {confirmDelete ? '¿Eliminar?' : 'Eliminar'}
              </Button>
            )}
            <Button onClick={onClose}>{readOnly ? 'Cerrar' : 'Cancelar'}</Button>
            {!readOnly && (
              <Button variant="primary" disabled={busy || !validRange || !form.calendarId} onClick={() => request('save')}>
                {save.isPending ? 'Guardando…' : 'Guardar'}
              </Button>
            )}
          </>
        }
      >
        <fieldset disabled={readOnly} className="contents">
          <Field label="Título">
            <Input value={form.title} maxLength={300} placeholder="Ej. Reunión con cliente" onChange={(e) => set('title', e.target.value)} />
          </Field>

          <div className="flex flex-col gap-2.5">
            <label className="flex items-center gap-2 text-[14px] text-ink-2">
              <input type="checkbox" className="h-4 w-4 accent-[var(--accent)]" checked={form.allDay} onChange={(e) => set('allDay', e.target.checked)} />
              Todo el día
            </label>
            <div className="cal-when">
              <Field label="Empieza">
                <div className="flex gap-2">
                  <Input type="date" required value={form.startDate} onChange={(e) => moveStart({ startDate: e.target.value })} />
                  {!form.allDay && <Input type="time" required step={300} className="cal-time" value={form.startTime} onChange={(e) => moveStart({ startTime: e.target.value })} />}
                </div>
              </Field>
              <Field label="Termina">
                <div className="flex gap-2">
                  <Input type="date" required min={form.startDate} value={form.endDate} onChange={(e) => set('endDate', e.target.value)} />
                  {!form.allDay && <Input type="time" required step={300} className="cal-time" value={form.endTime} onChange={(e) => set('endTime', e.target.value)} />}
                </div>
              </Field>
            </div>
            {!validRange && <span className="text-xs text-crit">El final debe ser después del inicio.</span>}
            {event?.seriesId && (
              <span className="flex items-center gap-1.5 text-xs text-ink-3">
                <Repeat size={13} /> Este evento se repite. Al guardar eliges si el cambio es solo para este o para toda la serie.
              </span>
            )}
          </div>

          <Field label="Calendario">
            {event ? (
              <div className="flex h-10 items-center gap-2 text-[14px] text-ink-2">
                <Dot color={calendar?.color ?? '#999'} /> {calendar?.name ?? event.calendarId}
              </div>
            ) : (
              <Select value={form.calendarId} onChange={(e) => set('calendarId', e.target.value)}>
                {writable.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>

          <Field label="Invitados" hint={readOnly ? undefined : 'Escribe un correo y pulsa Enter. Google les envía la invitación.'}>
            <div className="cal-guests">
              {event?.attendees.filter((a) => a.self).map((a) => <Guest key={a.email} name="Tú" attendee={a} />)}
              {form.guests.map((g) => (
                <Guest key={g.email} name={g.name ?? g.email} attendee={g} onRemove={readOnly ? undefined : () => set('guests', form.guests.filter((x) => x.email !== g.email))} />
              ))}
              {!readOnly && (
                <input
                  type="email"
                  inputMode="email"
                  autoCapitalize="none"
                  value={guestText}
                  placeholder={form.guests.length ? 'Agregar otro…' : 'correo@ejemplo.com'}
                  onChange={(e) => setGuestText(e.target.value)}
                  onKeyDown={onGuestKey}
                  onBlur={() => pendingGuest && isEmail(pendingGuest) && addGuest()}
                />
              )}
              {readOnly && form.guests.length === 0 && !self && <span className="text-[13px] text-ink-3">Sin invitados</span>}
            </div>
          </Field>

          {event?.meetUrl && form.meet ? (
            <div className="cal-meet">
              <Video size={17} />
              <a href={event.meetUrl} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate font-medium text-ink underline-offset-4 hover:underline">
                Unirse con Google Meet
              </a>
              {!readOnly && (
                <IconButton label="Copiar enlace" size={30} onClick={() => void copyMeet()}>
                  <Copy size={15} />
                </IconButton>
              )}
              {!readOnly && (
                <IconButton label="Quitar videollamada" size={30} onClick={() => set('meet', false)}>
                  <X size={15} />
                </IconButton>
              )}
            </div>
          ) : (
            !readOnly && (
              <label className="flex items-center gap-2 text-[14px] text-ink-2">
                <input type="checkbox" className="h-4 w-4 accent-[var(--accent)]" checked={form.meet} onChange={(e) => set('meet', e.target.checked)} />
                <Video size={16} /> Agregar videollamada de Google Meet
              </label>
            )
          )}

          <Field label="Ubicación">
            <Input value={form.location} maxLength={500} placeholder="Lugar o dirección" onChange={(e) => set('location', e.target.value)} />
          </Field>
          <Field label="Descripción">
            <Textarea value={form.description} maxLength={8000} onChange={(e) => set('description', e.target.value)} />
          </Field>

          {!readOnly && guestCount > 0 && (
            <label className="flex items-center gap-2 text-[13.5px] text-ink-2">
              <input type="checkbox" className="h-4 w-4 accent-[var(--accent)]" checked={form.notify} onChange={(e) => set('notify', e.target.checked)} />
              Avisar a los invitados por correo
            </label>
          )}
        </fieldset>

        {invited && (
          <div className="cal-rsvp">
            <span>¿Vas a asistir?</span>
            <div className="flex gap-1.5">
              {(['accepted', 'tentative', 'declined'] as const).map((r) => (
                <button key={r} type="button" aria-pressed={self?.status === r} disabled={busy} onClick={() => respond.mutate(r, { onSuccess: onClose })}>
                  {r === 'accepted' ? 'Sí' : r === 'tentative' ? 'Quizás' : 'No'}
                </button>
              ))}
            </div>
          </div>
        )}

        {problem && <p role="alert" className="rounded-[10px] bg-crit-soft px-3 py-2 text-[13px] leading-5 text-crit">{problem}</p>}

        {event?.htmlLink && (
          <a href={event.htmlLink} target="_blank" rel="noreferrer" className="text-link self-start text-[13px]">
            <ExternalLink size={14} /> Abrir en Google Calendar
          </a>
        )}
      </Dialog>

      <Dialog open={scopeFor !== null} onClose={() => setScopeFor(null)} title={scopeFor === 'delete' ? 'Eliminar evento recurrente' : 'Guardar evento recurrente'} width={380}>
        <p className="text-[14px] leading-6 text-ink-2">Este evento forma parte de una serie. ¿A qué aplica {scopeFor === 'delete' ? 'la eliminación' : 'el cambio'}?</p>
        <div className="flex flex-col gap-2">
          {(['this', 'all'] as const).map((scope) => (
            <Button
              key={scope}
              size="lg"
              variant={scopeFor === 'delete' && scope === 'all' ? 'danger' : 'secondary'}
              disabled={busy}
              onClick={() => {
                const action = scopeFor!;
                setScopeFor(null);
                run(action, scope);
              }}
            >
              {scope === 'this' ? 'Solo este evento' : 'Toda la serie'}
            </Button>
          ))}
        </div>
      </Dialog>
    </>
  );
}

function Guest({ name, attendee, onRemove }: { name: string; attendee: Pick<CalendarAttendee, 'email'> & { status?: AttendeeStatus }; onRemove?: () => void }) {
  const status = attendee.status;
  return (
    <span className={cx('cal-guest', status === 'declined' && 'is-declined')} title={`${attendee.email}${status ? ` · ${STATUS_LABEL[status]}` : ''}`}>
      {status === 'accepted' && <Check size={13} className="text-good" />}
      {status === 'declined' && <X size={13} className="text-crit" />}
      {status === 'tentative' && <CircleHelp size={13} className="text-ink-3" />}
      <span className="truncate">{name}</span>
      {onRemove && (
        <button type="button" aria-label={`Quitar a ${name}`} onClick={onRemove}>
          <X size={13} />
        </button>
      )}
    </span>
  );
}
