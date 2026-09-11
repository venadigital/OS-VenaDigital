// Consumo IA broken down by work folder (project) and by session.
import { useMemo, useState, type ReactNode } from 'react';
import { format, isSameDay } from 'date-fns';
import { es } from 'date-fns/locale';
import { AlertTriangle, Link2 } from 'lucide-react';
import { Button, Card, CardHead, Dot } from '@/components/ui';
import type { ModelPrice, Project, UsageSession } from '@/data/types';
import { dur, durShort, tokens, usd } from '@/lib/format';
import { projectForFolder, sessionCost } from '@/lib/pricing';

type Row = { s: UsageSession; cost: number; tokens: number; unpriced: boolean; minutes: number };

export function useSessionRows(sessions: UsageSession[], prices: ModelPrice[]): Row[] {
  return useMemo(
    () =>
      sessions.map((s) => ({
        s,
        ...sessionCost(s, prices),
        minutes: Math.max(1, (new Date(s.ended_at).getTime() - new Date(s.started_at).getTime()) / 60000),
      })),
    [sessions, prices],
  );
}

const folderLabel = (f: string) => f || 'Sin carpeta';

export function ProjectsCard({
  tabs,
  rows,
  projects,
  minutesByProject,
}: {
  tabs: ReactNode;
  rows: Row[];
  projects: Project[];
  minutesByProject: Map<string, number>;
}) {
  const groups = useMemo(() => {
    const map = new Map<string, { folder: string; cost: number; tokens: number; sessions: number; unpriced: boolean; last: string }>();
    for (const r of rows) {
      const g = map.get(r.s.project) ?? { folder: r.s.project, cost: 0, tokens: 0, sessions: 0, unpriced: false, last: r.s.ended_at };
      g.cost += r.cost;
      g.tokens += r.tokens;
      g.sessions += 1;
      g.unpriced ||= r.unpriced;
      if (r.s.ended_at > g.last) g.last = r.s.ended_at;
      map.set(r.s.project, g);
    }
    return [...map.values()].sort((a, b) => b.cost - a.cost);
  }, [rows]);
  const max = Math.max(0.01, ...groups.map((g) => g.cost));

  return (
    <Card className="min-w-0">
      <CardHead title="Por proyecto" right={tabs} />
      {groups.length === 0 ? (
        <p className="text-[13.5px] text-ink-3">Sin sesiones en este periodo. El colector nuevo las sube en los próximos minutos.</p>
      ) : (
        <div className="flex flex-col">
          {groups.map((g, i) => {
            const linked = projectForFolder(g.folder, projects);
            const minutes = linked ? minutesByProject.get(linked.id) ?? 0 : 0;
            return (
              <div key={g.folder || '—'} className={`grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1.5 py-3 ${i ? 'border-t border-rule' : ''}`}>
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="truncate text-[14px] font-medium text-ink">{folderLabel(g.folder)}</span>
                  <span className="flex flex-wrap items-center gap-x-2 text-xs text-ink-3">
                    <span>
                      {g.sessions} {g.sessions === 1 ? 'sesión' : 'sesiones'} · {tokens(g.tokens)} tokens
                    </span>
                    {linked && (
                      <span className="inline-flex items-center gap-1 text-ink-2">
                        <Link2 size={12} />
                        <Dot color={linked.color} size={6} />
                        {linked.name}
                        {minutes > 0 && ` · ${durShort(minutes)} registradas`}
                      </span>
                    )}
                  </span>
                </div>
                <div className="flex flex-col items-end">
                  <span className="tnum text-[14px] font-semibold text-ink">
                    {usd(g.cost)}
                    {g.unpriced && <AlertTriangle size={12} className="ml-1 inline text-warn" />}
                  </span>
                  {minutes > 0 && <span className="tnum text-xs text-ink-3">{usd(g.cost / (minutes / 60))}/hora</span>}
                </div>
                <div className="col-span-2 h-1.5 rounded-full bg-fill">
                  <div className="h-1.5 rounded-full bg-accent" style={{ width: `${Math.max(1, (g.cost / max) * 100)}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      )}
      <p className="text-[12.5px] text-ink-3">
        Cada proyecto es la carpeta donde trabajaste en Claude Code o Codex. Si su nombre coincide con un proyecto de Tiempo se unen solos; si no, asócialo al
        editar el proyecto en Tiempo.
      </p>
    </Card>
  );
}

export function SessionsCard({ tabs, rows }: { tabs: ReactNode; rows: Row[] }) {
  const [limit, setLimit] = useState(25);
  const sorted = useMemo(() => [...rows].sort((a, b) => b.s.started_at.localeCompare(a.s.started_at)), [rows]);
  const now = new Date();
  return (
    <Card className="min-w-0">
      <CardHead title="Por sesión" right={tabs} />
      {sorted.length === 0 ? (
        <p className="text-[13.5px] text-ink-3">Sin sesiones en este periodo.</p>
      ) : (
        <div className="-mx-1 overflow-x-auto px-1">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-line text-left text-xs text-ink-3">
                <th className="py-2 pr-3 font-medium">Cuándo</th>
                <th className="py-2 pr-3 font-medium">Proyecto</th>
                <th className="py-2 pr-3 text-right font-medium">Duración</th>
                <th className="hidden py-2 pr-3 text-right font-medium sm:table-cell">Tokens</th>
                <th className="py-2 text-right font-medium">Costo</th>
              </tr>
            </thead>
            <tbody>
              {sorted.slice(0, limit).map((r) => {
                const start = new Date(r.s.started_at);
                const end = new Date(r.s.ended_at);
                const day = isSameDay(start, now) ? 'Hoy' : format(start, 'EEE d MMM', { locale: es }).replace('.', '');
                const models = Object.keys(r.s.models ?? {}).join(', ');
                return (
                  <tr key={`${r.s.source}:${r.s.session_id}`} className="border-b border-rule align-top last:border-0">
                    <td className="tnum py-2.5 pr-3 whitespace-nowrap">
                      <div className="text-ink first-letter:uppercase">{day}</div>
                      <div className="text-xs text-ink-3">
                        {format(start, 'HH:mm')}–{format(end, 'HH:mm')}
                      </div>
                    </td>
                    <td className="w-full max-w-0 py-2.5 pr-3">
                      <div className="truncate text-ink">{folderLabel(r.s.project)}</div>
                      <div className="truncate font-mono text-[11.5px] text-ink-3" title={models}>
                        {r.s.source === 'codex' ? 'Codex · ' : ''}
                        {models}
                      </div>
                    </td>
                    <td className="tnum py-2.5 pr-3 text-right whitespace-nowrap text-ink-2">{dur(r.minutes)}</td>
                    <td className="tnum hidden py-2.5 pr-3 text-right whitespace-nowrap text-ink-2 sm:table-cell">{tokens(r.tokens)}</td>
                    <td className="tnum py-2.5 text-right font-semibold whitespace-nowrap text-ink">
                      {usd(r.cost)}
                      {r.unpriced && <AlertTriangle size={12} className="ml-1 inline text-warn" />}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {sorted.length > limit && (
        <Button variant="ghost" className="self-center" onClick={() => setLimit((l) => l + 50)}>
          Ver más sesiones
        </Button>
      )}
      <p className="text-[12.5px] text-ink-3">La duración va del primer al último mensaje de la sesión. Nunca se sube el contenido de tus conversaciones.</p>
    </Card>
  );
}
