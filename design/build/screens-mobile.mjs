// Mobile screens (390 × 844). No fake status bar: the top 54px stay empty.
import { C, icon, dur, durShort, usd, doc, label, dot, stopBtn, segmented, mobile, mobileTitle, roundBtn, moreLink } from './shared.mjs';
import { PROJECTS, proj, RUNNING, TODAY_TOTAL, WEEK, WEEK_TOTAL, API_TOTAL, SUBS_TOTAL, RATIO, NOTES_TOTAL, TYPES } from './data.mjs';
import { noteCard, NOTES_PINNED, NOTES_RECENT, shareBar } from './parts.mjs';

const W = 390;
const H = 844;

const mcard = (inner, { gap = 10, pad = 16, radius = 16, center = false } = {}) =>
  `<div style="background: #FFFFFF; border-radius: ${radius}px; padding: ${pad}px; display: flex; flex-direction: column; gap: ${gap}px;${center ? ' align-items: center;' : ''} box-shadow: 0 1px 2px rgba(31, 30, 28, 0.04); border: 1px solid ${C.line};">${inner}</div>`;

const live = (text = 'En curso') =>
  `<div style="display: flex; align-items: center; gap: 6px; font-size: 12.5px; font-weight: 500; color: ${C.ink2};">${dot(C.good, 7)}<span>${text}</span></div>`;

// ============================== INICIO ==============================
export function inicioMovil() {
  const content = `
    ${mobileTitle('Buenas tardes', { eyebrow: 'Viernes 11 sep', right: `${roundBtn('search')}${roundBtn('plus', { accent: true })}` })}
    ${mcard(`
      <div style="display: flex; align-items: center; justify-content: space-between;">${live()}<span style="font-size: 12.5px; color: ${C.ink3};">Desde las ${RUNNING.since}</span></div>
      <div style="display: flex; flex-direction: column; gap: 1px;">
        <div style="font-size: 17px; font-weight: 600; color: ${C.ink};">${RUNNING.task}</div>
        <div style="display: flex; align-items: center; gap: 6px; font-size: 13px; color: ${C.ink3};">${dot(proj('os').color, 7)}<span>${RUNNING.project}</span></div>
      </div>
      <div class="tnum" style="font-size: 46px; line-height: 50px; font-weight: 600; letter-spacing: -0.03em; color: ${C.ink};">00:42:18</div>
      <div style="display: flex;">${stopBtn('Detener', 44, true)}</div>`)}
    <div style="display: flex; align-items: center; gap: 10px; height: 44px; padding: 0 14px; border-radius: 12px; background: #FFFFFF; border: 1px solid ${C.line};">
      ${icon('plus', 18, C.ink3)}<span style="font-size: 15px; color: ${C.ink4};">Anota algo rápido…</span>
    </div>
    ${mcard(`
      <div style="display: flex; align-items: center; justify-content: space-between;">${label('Hoy')}${moreLink('Ver')}</div>
      <div style="font-size: 26px; line-height: 32px; font-weight: 600; letter-spacing: -0.02em; color: ${C.ink};">${dur(TODAY_TOTAL)}</div>
      ${shareBar(PROJECTS.map((a) => ({ v: a.today, color: a.color })), 8)}
      <div style="display: flex; flex-direction: column; gap: 6px; margin-top: 2px;">
        ${PROJECTS.slice(0, 3)
          .map((a) => `<div style="display: flex; align-items: center; gap: 8px; font-size: 13.5px;">${dot(a.color)}<span style="flex-grow: 1; color: ${C.ink};">${a.name}</span><span class="tnum" style="color: ${C.ink2};">${dur(a.today)}</span></div>`)
          .join('')}
      </div>`)}
    ${mcard(`
      <div style="display: flex; align-items: center; justify-content: space-between;">${label('Consumo IA · septiembre')}<span style="display: inline-flex; align-items: center; height: 22px; padding: 0 8px; border-radius: 6px; background: {{accentSoft}}; color: {{accent}}; font-size: 12.5px; font-weight: 600;">Rinde ${RATIO}</span></div>
      <div style="display: flex; align-items: baseline; justify-content: space-between; gap: 8px;">
        <div style="font-size: 24px; line-height: 30px; font-weight: 600; letter-spacing: -0.02em; color: ${C.ink};">${usd(API_TOTAL)}</div>
        <div style="font-size: 12.5px; color: ${C.ink3};">pagas $${SUBS_TOTAL}/mes</div>
      </div>`, { gap: 6 })}`;
  return { w: W, h: H, html: doc({ w: W, h: H, body: mobile({ active: 'Inicio', content }), bodyBg: C.plane }) };
}

// ============================== TIEMPO ==============================
function weekChart() {
  const w = 326;
  const h = 142;
  const base = 116;
  const maxMin = 425;
  const k = 92 / maxMin;
  const slot = w / 7;
  const bw = 22;
  let g = `<line x1="0" x2="${w}" y1="${base}" y2="${base}" stroke="${C.axis}" stroke-width="1"></line>`;
  WEEK.forEach((d, i) => {
    const x = +(i * slot + slot / 2 - bw / 2).toFixed(1);
    const segs = PROJECTS.map((a) => ({ v: d.v[a.id] || 0, color: a.color })).filter((s) => s.v > 0);
    const total = segs.reduce((s, x2) => s + x2.v, 0);
    let y = base;
    const gaps = Math.max(0, segs.length - 1) * 2;
    const hTot = total * k;
    segs.forEach((s, j) => {
      const hs = (s.v / total) * (hTot - gaps);
      const top = y - hs;
      if (j === segs.length - 1) {
        const r = Math.min(4, hs);
        g += `<path d="M${x} ${y.toFixed(1)} V${(top + r).toFixed(1)} Q${x} ${top.toFixed(1)} ${x + r} ${top.toFixed(1)} H${x + bw - r} Q${x + bw} ${top.toFixed(1)} ${x + bw} ${(top + r).toFixed(1)} V${y.toFixed(1)} Z" fill="${s.color}"></path>`;
      } else {
        g += `<rect x="${x}" y="${top.toFixed(1)}" width="${bw}" height="${hs.toFixed(1)}" fill="${s.color}"></rect>`;
      }
      y = top - 2;
    });
    if (d.today) {
      g += `<text x="${(x + bw / 2).toFixed(1)}" y="${(base - hTot - 7).toFixed(1)}" text-anchor="middle" font-size="11" font-weight="600" fill="${C.ink2}" style="font-variant-numeric: tabular-nums;">${durShort(total)}</text>`;
    }
    g += `<text x="${(x + bw / 2).toFixed(1)}" y="${base + 18}" text-anchor="middle" font-size="11" font-weight="${d.today ? 600 : 400}" fill="${total ? (d.today ? C.ink : C.ink3) : C.ink4}">${d.d}</text>`;
  });
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" style="display: block;">${g}</svg>`;
}

export function tiempoMovil() {
  const legend = PROJECTS.map(
    (a) => `<div style="display: flex; align-items: center; gap: 6px; font-size: 12.5px; color: ${C.ink2};">${dot(a.color, 7)}<span>${a.short}</span><span class="tnum" style="color: ${C.ink}; font-weight: 600;">${durShort(a.week)}</span></div>`,
  ).join('');
  const content = `
    ${mobileTitle('Tiempo', { right: roundBtn('plus', { accent: true }) })}
    ${mcard(`
      <div style="display: flex; align-items: center; gap: 8px; height: 40px; padding: 0 14px; border-radius: 20px; background: ${C.fill};">${dot(C.good, 7)}<span style="font-size: 14px; font-weight: 600; color: ${C.ink};">${RUNNING.task}</span>${icon('chevDown', 14, C.ink3, 2)}</div>
      <div class="tnum" style="font-size: 60px; line-height: 64px; font-weight: 300; letter-spacing: -0.02em; color: ${C.ink};">${RUNNING.elapsed}</div>
      <div style="display: flex; align-items: center; gap: 6px; font-size: 13px; color: ${C.ink3}; margin-top: -4px;">${dot(proj('os').color, 7)}<span>${RUNNING.project} · desde las ${RUNNING.since}</span></div>
      <div style="display: flex; width: 100%; margin-top: 4px;">${stopBtn('Detener', 46, true)}</div>`, { gap: 10, pad: 18, radius: 20, center: true })}
    ${segmented(['Día', 'Semana', 'Mes'], 'Semana', { h: 44, full: true })}
    ${mcard(`
      <div style="display: flex; align-items: flex-end; justify-content: space-between; gap: 8px;">
        <div style="display: flex; flex-direction: column; gap: 1px;">
          ${label('Esta semana')}
          <div style="font-size: 24px; line-height: 30px; font-weight: 600; letter-spacing: -0.02em; color: ${C.ink};">${dur(WEEK_TOTAL)}</div>
        </div>
        <div style="font-size: 12.5px; color: ${C.ink3}; padding-bottom: 4px;">7 – 13 sep</div>
      </div>
      ${weekChart()}
      <div style="display: flex; flex-wrap: wrap; gap: 8px 14px;">${legend}</div>`, { gap: 12 })}`;
  return { w: W, h: H, html: doc({ w: W, h: H, body: mobile({ active: 'Tiempo', content }), bodyBg: C.plane }) };
}

// ============================== NOTAS ==============================
export function notasMovil() {
  const chips = [['Todas', NOTES_TOTAL, null], ...Object.values(TYPES).map((t) => [t.label, t.count, t.dot])]
    .map(([t, n, d], i) =>
      i === 0
        ? `<div style="flex-shrink: 0; display: flex; align-items: center; gap: 6px; height: 40px; padding: 0 14px; border-radius: 20px; background: ${C.ink}; color: #FFFFFF; font-size: 13.5px; font-weight: 600;"><span>${t}</span><span class="tnum" style="color: rgba(255, 255, 255, 0.65); font-weight: 500;">${n}</span></div>`
        : `<div style="flex-shrink: 0; display: flex; align-items: center; gap: 6px; height: 40px; padding: 0 14px; border-radius: 20px; background: #FFFFFF; border: 1px solid ${C.line}; color: ${C.ink2}; font-size: 13.5px; font-weight: 500;">${dot(d, 7)}<span>${t}</span><span class="tnum" style="color: ${C.ink3};">${n}</span></div>`,
    )
    .join('');
  const R = NOTES_RECENT;
  const col = (list) => `<div style="flex-grow: 1; flex-basis: 0; min-width: 0; display: flex; flex-direction: column; gap: 10px;">${list.map((n) => noteCard(n, { pad: '12px 14px' })).join('')}</div>`;
  const content = `
    ${mobileTitle('Notas', { eyebrow: `${NOTES_TOTAL} notas`, right: `${roundBtn('search')}${roundBtn('compose', { accent: true })}` })}
    <div style="display: flex; gap: 8px; margin: 0 -16px; padding: 0 16px; overflow: hidden;">${chips}</div>
    <div style="display: flex; gap: 10px; align-items: flex-start; margin-top: 2px;">
      ${col([NOTES_PINNED[0], R.supabase, R.caos])}
      ${col([NOTES_PINNED[1], R.paleta, R.episodio])}
    </div>`;
  const overlay = `<div style="position: absolute; left: 12px; right: 12px; bottom: 91px; height: 54px; display: flex; align-items: center; gap: 10px; padding: 0 10px 0 14px; background: #FFFFFF; border: 1px solid ${C.line}; border-radius: 14px; box-shadow: 0 8px 24px rgba(31, 30, 28, 0.12);">
    ${dot(C.good, 8)}
    <div style="flex-grow: 1; min-width: 0; display: flex; flex-direction: column; gap: 0;">
      <div style="font-size: 13.5px; font-weight: 600; color: ${C.ink};">${RUNNING.task}</div>
      <div style="font-size: 11.5px; color: ${C.ink3};">${RUNNING.project}</div>
    </div>
    <div class="tnum" style="font-size: 16px; font-weight: 600; color: ${C.ink};">00:42:18</div>
    <div style="width: 40px; height: 40px; border-radius: 50%; background: ${C.critSoft}; display: flex; align-items: center; justify-content: center;">${icon('stop', 14, C.critText)}</div>
  </div>`;
  return { w: W, h: H, html: doc({ w: W, h: H, body: mobile({ active: 'Notas', content, overlay }), bodyBg: C.plane }) };
}
