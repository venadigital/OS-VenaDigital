// "Hoy con clientes" on Inicio: deliveries and payments due this week, and clients gone quiet.
import type { CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, ArrowUpRight, CalendarClock, Clock3, FileText, Users } from 'lucide-react';
import { Card } from '@/components/ui';
import { hm, todayItems, useClientsData } from './model';
import './clientes.css';

const MAX = 6;

export function ClientsTodayCard() {
  const { summaries, now, loading } = useClientsData();
  const active = summaries.filter((s) => s.client.status === 'activo');
  if (loading || active.length === 0) return null;

  const items = todayItems(summaries, now);
  const attention = active.filter((s) => s.issues.length).length;
  const hours = active.reduce((t, s) => t + s.monthMinutes, 0);

  return (
    <Card as="section" className="cl-today">
      <div className="section-heading">
        <h2 className="metric-label">
          <span className="icon-tile"><Users size={18} /></span>
          Hoy con clientes
          {attention > 0 && <span className="cl-pill is-amber">{attention} {attention === 1 ? 'necesita' : 'necesitan'} atención</span>}
        </h2>
        <Link to="/clientes" className="text-link">
          Ver clientes <ArrowUpRight size={15} />
        </Link>
      </div>
      {items.length === 0 ? (
        <p className="text-[13.5px] text-ink-3">Nada vence esta semana y todos tus clientes están al día.</p>
      ) : (
        <div className="cl-today-list" style={{ "--rows": Math.ceil(Math.min(items.length, MAX) / 2) } as CSSProperties}>
          {items.slice(0, MAX).map((it) => {
            const Icon = it.tone === 'crit' ? AlertTriangle : it.kind === 'cobro' ? FileText : it.kind === 'seguimiento' ? Clock3 : CalendarClock;
            const tone = it.tone === 'crit' ? 'cl-crit-ink' : it.tone === 'warn' ? 'cl-amber-ink' : '';
            return (
              <Link key={it.key} to={`/clientes/${it.clientId}${it.kind === 'cobro' ? '?tab=facturacion' : it.kind === 'entrega' ? '?tab=tareas' : '?tab=bitacora'}`} className="cl-today-item">
                <span className={`when ${tone}`}>{it.when}</span>
                <Icon size={16} className={tone ? `!text-current ${tone}` : undefined} />
                <span className="what"><b>{it.client}</b> · {it.text}</span>
              </Link>
            );
          })}
        </div>
      )}
      <div className="cl-today-foot">
        <span>{active.length} {active.length === 1 ? 'cliente activo' : 'clientes activos'} · {hm(hours)} este mes</span>
        {items.length > MAX && <span>y {items.length - MAX} más en Clientes</span>}
      </div>
    </Card>
  );
}
