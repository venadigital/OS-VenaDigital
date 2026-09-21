import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { addMinutes, startOfDay } from 'date-fns';
import { CalendarDays, ChevronLeft, ChevronRight, Plus, RefreshCw } from 'lucide-react';
import { Page, PageHeader } from '@/components/Shell';
import { Button, cx, Dot, Empty, IconButton, Segmented, Skeleton } from '@/components/ui';
import { useToast } from '@/components/Toast';
import { useAccount, useApi } from '@/data/ApiContext';
import { CalendarError } from '@/data/api';
import { qk, useCalendarEvents, useCalendars, useCalendarStatus, useNow } from '@/data/hooks';
import type { CalendarEvent } from '@/data/types';
import { eventColor } from '@/lib/googleCalendar';
import { daysIn } from '@/lib/time';
import { finishGoogleConnect, startGoogleConnect } from './connect';
import { EventDialog, type EventDraft } from './EventDialog';
import { isCurrentView, isVisible, readPrefs, shiftView, VIEW_LABELS, viewLabel, viewRange, writePrefs, type CalView } from './model';
import { Agenda, MonthGrid, TimeGrid } from './views';

const isPhone = () => window.matchMedia('(max-width: 767px)').matches;
const VIEWS: CalView[] = ['day', 'week', 'month', 'agenda'];

export function CalendarioPage() {
  const api = useApi();
  const qc = useQueryClient();
  const toast = useToast();
  const { user, mode } = useAccount();
  const [params, setParams] = useSearchParams();
  const scope = `${mode}:${user.id}`;

  const [prefs, setPrefs] = useState(() => readPrefs(scope));
  const [view, setView] = useState<CalView>(() => prefs.view ?? (isPhone() ? 'agenda' : 'week'));
  const [anchor, setAnchor] = useState(() => new Date());
  const [draft, setDraft] = useState<EventDraft | null>(null);
  const [connecting, setConnecting] = useState(() => params.has('code'));
  const now = useNow(60_000);

  const statusQ = useCalendarStatus();
  const connected = Boolean(statusQ.data?.connected);
  const calendarsQ = useCalendars(connected);
  const calendars = useMemo(() => calendarsQ.data ?? [], [calendarsQ.data]);
  const shown = useMemo(() => calendars.filter((c) => isVisible(c, prefs.visible)), [calendars, prefs.visible]);
  const { from, to } = useMemo(() => viewRange(view, anchor), [view, anchor]);
  const eventsQ = useCalendarEvents(from, to, connected ? shown : undefined);
  const events = shown.length ? (eventsQ.data ?? []) : [];

  const colorById = useMemo(() => new Map(calendars.map((c) => [c.id, c])), [calendars]);
  const colorOf = (e: CalendarEvent) => eventColor(e, colorById.get(e.calendarId));

  // Back from Google's consent page: exchange the code, then clean the URL.
  useEffect(() => {
    if (!params.has('code') && !params.has('error')) return;
    finishGoogleConnect(api, params)
      .then((ok) => {
        if (!ok) return;
        toast('Google Calendar conectado');
        return qc.invalidateQueries({ queryKey: ['calendar'] });
      })
      .catch((err) => toast(err instanceof Error ? err.message : String(err), 'error'))
      .finally(() => {
        setConnecting(false);
        setParams({}, { replace: true });
      });
  }, [api, params, qc, setParams, toast]);

  // "Nuevo evento" from the command palette.
  useEffect(() => {
    if (!params.has('nuevo') || !connected) return;
    setDraft({ start: nextHalfHour(new Date()) });
    setParams({}, { replace: true });
  }, [params, connected, setParams]);

  // An event chosen on Inicio ("Agenda de hoy"): open it once today's events are here.
  const wanted = params.get('evento');
  useEffect(() => {
    if (!wanted || !eventsQ.data) return;
    const event = eventsQ.data.find((e) => e.id === wanted);
    if (event) setDraft({ event });
    setParams({}, { replace: true });
  }, [wanted, eventsQ.data, setParams]);

  // Google withdrew the permission: fall back to the connect screen.
  const lost = [calendarsQ.error, eventsQ.error].some((e) => e instanceof CalendarError && e.code === 'not_connected');
  useEffect(() => {
    if (lost) void qc.invalidateQueries({ queryKey: qk.calendarStatus });
  }, [lost, qc]);

  const savePrefs = (next: typeof prefs) => {
    setPrefs(next);
    if (mode !== 'demo') writePrefs(scope, next);
  };
  const changeView = (v: CalView) => {
    setView(v);
    savePrefs({ ...prefs, view: v });
  };
  const openDay = (d: Date) => {
    setAnchor(d);
    changeView('day');
  };
  const newAt = (start: Date, allDay: boolean) => setDraft({ start, allDay });

  const connect = async () => {
    setConnecting(true);
    try {
      await startGoogleConnect(api);
      if (mode === 'demo') await qc.invalidateQueries({ queryKey: ['calendar'] });
    } catch (err) {
      toast(err instanceof Error ? err.message : String(err), 'error');
    }
    if (mode === 'demo') setConnecting(false);
  };

  const viewProps = { events, colorOf, now, onEvent: (event: CalendarEvent) => setDraft({ event }), onSlot: newAt, onDay: openDay };
  const canCreate = calendars.some((c) => c.writable);
  const loadError = calendarsQ.error ?? eventsQ.error;

  return (
    <Page>
      <PageHeader
        eyebrow={connected ? viewLabel(view, anchor) : 'Google Calendar'}
        title="Calendario"
        right={
          connected && (
            <>
              <Segmented options={VIEWS.map((v) => ({ value: v, label: VIEW_LABELS[v] }))} value={view} onChange={changeView} />
              <div className="cal-nav">
                <IconButton label="Anterior" size={30} onClick={() => setAnchor((a) => shiftView(view, a, -1))}>
                  <ChevronLeft size={17} />
                </IconButton>
                <button type="button" disabled={isCurrentView(view, anchor, now)} onClick={() => setAnchor(new Date())}>
                  Hoy
                </button>
                <IconButton label="Siguiente" size={30} onClick={() => setAnchor((a) => shiftView(view, a, 1))}>
                  <ChevronRight size={17} />
                </IconButton>
              </div>
              <IconButton label="Actualizar" variant="bordered" size={40} className="!rounded-full" onClick={() => void qc.invalidateQueries({ queryKey: ['calendar'] })}>
                <RefreshCw size={16} className={cx(eventsQ.isFetching && 'animate-spin')} />
              </IconButton>
              <Button variant="primary" icon={<Plus size={16} />} disabled={!canCreate} onClick={() => newAt(view === 'month' || view === 'agenda' ? nextHalfHour(now) : slotOn(anchor, now), false)}>
                Nuevo evento
              </Button>
            </>
          )
        }
      />

      {statusQ.isLoading || connecting ? (
        <Skeleton className="h-[420px] rounded-[18px]" />
      ) : statusQ.error || !statusQ.data?.configured ? (
        <Empty icon={<CalendarDays size={28} />} title="El calendario todavía no está listo">
          {statusQ.error instanceof CalendarError && statusQ.error.code !== 'not_deployed'
            ? statusQ.error.message
            : 'Falta terminar la instalación del servidor que conecta con Google Calendar (función y credenciales de Google en Supabase).'}
        </Empty>
      ) : !connected ? (
        <Empty
          icon={<CalendarDays size={28} />}
          title="Conecta tu Google Calendar"
          action={
            <Button variant="primary" onClick={() => void connect()}>
              Conectar con Google
            </Button>
          }
        >
          Verás tus calendarios aquí y podrás crear, mover y eliminar eventos. Google te pedirá permiso una sola vez; puedes desconectarlo cuando quieras en Ajustes.
        </Empty>
      ) : (
        <>
          {calendars.length > 1 && (
            <div className="cal-filters no-scrollbar" role="group" aria-label="Calendarios visibles">
              {calendars.map((c) => {
                const on = isVisible(c, prefs.visible);
                return (
                  <button key={c.id} type="button" aria-pressed={on} className="cal-filter" onClick={() => savePrefs({ ...prefs, visible: { ...prefs.visible, [c.id]: !on } })}>
                    <Dot color={on ? c.color : 'var(--color-mute)'} size={9} />
                    {c.name}
                  </button>
                );
              })}
            </div>
          )}

          {loadError && !lost && (
            <p role="alert" className="rounded-[12px] bg-crit-soft px-4 py-3 text-[13.5px] text-crit">
              No se pudo leer Google Calendar: {loadError.message}
            </p>
          )}

          {calendarsQ.isLoading || (eventsQ.isLoading && shown.length > 0) ? (
            <Skeleton className="h-[420px] rounded-[18px]" />
          ) : view === 'agenda' ? (
            <Agenda from={from} to={to} {...viewProps} />
          ) : view === 'month' ? (
            <MonthGrid from={from} anchor={anchor} {...viewProps} />
          ) : (
            <TimeGrid days={daysIn(from, to)} {...viewProps} />
          )}
        </>
      )}

      <EventDialog draft={draft} onClose={() => setDraft(null)} calendars={calendars} />
    </Page>
  );
}

function nextHalfHour(d: Date): Date {
  const minutes = d.getHours() * 60 + d.getMinutes();
  return addMinutes(startOfDay(d), Math.min(23 * 60, Math.ceil((minutes + 1) / 30) * 30));
}

/** A sensible start on the day being viewed: the next half hour today, 9:00 on other days. */
function slotOn(day: Date, now: Date): Date {
  return startOfDay(day).getTime() === startOfDay(now).getTime() ? nextHalfHour(now) : addMinutes(startOfDay(day), 9 * 60);
}
