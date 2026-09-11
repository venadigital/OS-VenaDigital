// Desktop screens (1440 wide).
import {
  C, S, MONO, HAND, icon, dur, usd, num, doc, card, cardHead, moreLink, label, dot,
  btnPrimary, btnGhost, iconBtn, stopBtn, segmented, stepper, searchField, pageHeader, desktop,
} from './shared.mjs';
import {
  PROJECTS, proj, TASKS, task, RUNNING, TODAY_TOTAL, SESSIONS, SRC, ACCOUNTS, DAYS, API_TOTAL, SUBS_TOTAL, RATIO,
  MODELS, SUBS, TYPES, NOTES_TOTAL, BOARDS,
} from './data.mjs';
import { noteCard, NOTES_PINNED, NOTES_RECENT, sketch, DOTS, shareBar, sparkColumns } from './parts.mjs';

const FONT_HAND = `<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Caveat:wght@500;600&amp;display=swap">`;

const statusLive = (text = 'En curso') =>
  `<div style="display: flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 500; color: ${C.ink2};">${dot(C.good, 7)}<span>${text}</span></div>`;

const pill = (text) =>
  `<span style="display: inline-flex; align-items: center; height: 22px; padding: 0 8px; border-radius: 6px; background: {{accentSoft}}; color: {{accent}}; font-size: 12.5px; font-weight: 600;">${text}</span>`;

const captureBar = (placeholder, hint) =>
  `<div style="display: flex; align-items: center; gap: 12px; height: 48px; padding: 0 12px 0 16px; border-radius: 12px; background: ${C.plane}; border: 1px solid ${C.line};">
      ${icon('plus', 18, C.ink3)}
      <div style="flex-grow: 1; font-size: 14.5px; color: ${C.ink4};">${placeholder}</div>
      ${hint}
    </div>`;

const kbdHint = (text) =>
  `<div style="display: flex; align-items: center; gap: 6px; font-size: 12px; color: ${C.ink3};">
        <span style="display: flex; align-items: center; justify-content: center; width: 24px; height: 20px; border-radius: 5px; background: #FFFFFF; border: 1px solid #E3E1DA;">${icon('enter', 12, C.ink2, 2)}</span>
        <span>${text}</span>
      </div>`;

// ============================== HOME ==============================
export function home() {
  const h = 840;
  const top3 = PROJECTS.slice(0, 3);
  const rest = PROJECTS.slice(3);
  const restMin = rest.reduce((s, a) => s + a.today, 0);

  const timerCard = card(`
      <div style="display: flex; align-items: center; justify-content: space-between;">${label('Tiempo')}${statusLive()}</div>
      <div style="display: flex; flex-direction: column; gap: 2px;">
        <div style="font-size: 15px; font-weight: 600; color: ${C.ink};">${RUNNING.task}</div>
        <div style="display: flex; align-items: center; gap: 6px; font-size: 12.5px; color: ${C.ink3};">${dot(proj('os').color, 7)}<span>${RUNNING.project} · desde las ${RUNNING.since}</span></div>
      </div>
      <div class="tnum" style="font-size: 44px; line-height: 48px; font-weight: 600; letter-spacing: -0.025em; color: ${C.ink};">00:42:18</div>
      <div style="display: flex; gap: 8px; margin-top: auto;">${stopBtn('Detener', 34, true)}${btnGhost('Cambiar tarea')}</div>`);

  const todayCard = card(`
      <div style="display: flex; align-items: center; justify-content: space-between;">${label('Hoy')}${moreLink('Ver tiempo')}</div>
      <div style="display: flex; flex-direction: column; gap: 2px;">
        <div style="font-size: 30px; line-height: 36px; font-weight: 600; letter-spacing: -0.02em; color: ${C.ink};">${dur(TODAY_TOTAL)}</div>
        <div style="font-size: 12.5px; color: ${C.ink3};">5 proyectos · 6 sesiones</div>
      </div>
      ${shareBar(PROJECTS.map((a) => ({ v: a.today, color: a.color })), 10)}
      <div style="display: flex; flex-direction: column; gap: 7px;">
        ${top3
          .map(
            (a) => `<div style="display: flex; align-items: center; gap: 8px; font-size: 13px;">${dot(a.color)}<span style="flex-grow: 1; color: ${C.ink};">${a.name}</span><span class="tnum" style="color: ${C.ink2};">${dur(a.today)}</span></div>`,
          )
          .join('')}
        <div style="display: flex; align-items: center; gap: 8px; font-size: 13px; color: ${C.ink3};"><span style="width: 8px;"></span><span style="flex-grow: 1;">2 más</span><span class="tnum">${dur(restMin)}</span></div>
      </div>`);

  const aiCard = card(`
      <div style="display: flex; align-items: center; justify-content: space-between;">${label('Consumo IA · septiembre')}${moreLink('Ver consumo')}</div>
      <div style="display: flex; flex-direction: column; gap: 2px;">
        <div style="font-size: 30px; line-height: 36px; font-weight: 600; letter-spacing: -0.02em; color: ${C.ink};">${usd(API_TOTAL)}</div>
        <div style="font-size: 12.5px; color: ${C.ink3};">Valor a precio API · 1 modelo sin precio</div>
      </div>
      ${sparkColumns(DAYS.map((d) => d.reduce((s, v) => s + v, 0)), { h: 44, bw: 14, gap: 6 })}
      <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-top: auto; font-size: 13px; color: ${C.ink2};">
        <span>Pagas $${SUBS_TOTAL}/mes en 3 suscripciones</span>${pill(`Rinde ${RATIO}`)}
      </div>`);

  const boardsList = BOARDS.slice(0, 3)
    .map(
      (b, i) => `<div style="display: flex; align-items: center; gap: 14px; padding: 10px 12px;${i ? ` border-top: 1px solid ${C.rule};` : ''}">
          <div style="width: 76px; height: 50px; flex-shrink: 0; border-radius: 8px; border: 1px solid ${C.line}; overflow: hidden; padding: 3px; ${DOTS}">${sketch(b.sketch, { labels: false })}</div>
          <div style="flex-grow: 1; display: flex; flex-direction: column; gap: 2px; min-width: 0;">
            <div style="font-size: 14px; font-weight: 500; color: ${C.ink};">${b.name}</div>
            <div style="font-size: 12.5px; color: ${C.ink3};">${b.meta}</div>
          </div>
          ${icon('chevRight', 16, C.ink4, 2)}
        </div>`,
    )
    .join('');

  const content = `
    ${pageHeader({ eyebrow: 'Viernes, 11 de septiembre', title: 'Buenas tardes, Laura', right: btnPrimary('Nuevo') })}
    ${captureBar('Anota una idea, un pendiente o pega un link…', kbdHint('guardar en Notas'))}
    <div style="display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px;">
      ${timerCard}
      ${todayCard}
      ${aiCard}
    </div>
    <div style="display: grid; grid-template-columns: minmax(0, 3fr) minmax(0, 2fr); gap: 28px;">
      <section style="display: flex; flex-direction: column; gap: 12px;">
        ${cardHead('Notas fijadas', moreLink('Todas las notas'))}
        <div style="display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; align-items: start;">
          ${NOTES_PINNED.map((n) => noteCard(n)).join('')}
        </div>
      </section>
      <section style="display: flex; flex-direction: column; gap: 12px;">
        ${cardHead('Tableros recientes', moreLink('Todos'))}
        <div style="border: 1px solid ${C.line}; border-radius: 14px; background: #FFFFFF; display: flex; flex-direction: column; padding: 4px 0;">${boardsList}</div>
      </section>
    </div>`;

  return { w: 1440, h, html: doc({ w: 1440, h, body: desktop({ active: 'Inicio', h, content, timer: false }) }) };
}

// ============================== TIEMPO ==============================
const toMin = (s) => {
  const [hh, mm] = s.split(':').map(Number);
  return hh * 60 + mm;
};

function timeline() {
  const start = 8 * 60;
  const span = 10 * 60;
  const pct = (m) => (((m - start) / span) * 100).toFixed(3);
  const hours = Array.from({ length: 11 }, (_, i) => 8 + i);
  const grid = hours
    .map((hr) => `<div style="position: absolute; top: 0; bottom: 0; left: ${pct(hr * 60)}%; width: 1px; background: ${C.rule};"></div>`)
    .join('');
  const labels = hours
    .map((hr, i) => {
      const tx = i === 0 ? '0' : i === hours.length - 1 ? '-100%' : '-50%';
      return `<div class="tnum" style="position: absolute; top: 0; left: ${pct(hr * 60)}%; transform: translateX(${tx}); font-size: 11px; color: ${C.ink3};">${hr}:00</div>`;
    })
    .join('');
  const blocks = SESSIONS.map((s) => {
    const a = proj(task(s.task).project);
    const st = toMin(s.start);
    const w = ((s.min / span) * 100).toFixed(3);
    return `<div style="position: absolute; top: 6px; height: 30px; left: ${pct(st)}%; width: calc(${w}% - 2px); background: ${a.color}; border-radius: 4px;"></div>`;
  }).join('');
  const now = pct(toMin('14:47'));
  const legend = PROJECTS.map(
    (a) => `<div style="display: flex; align-items: center; gap: 6px; font-size: 12px; color: ${C.ink2};">${dot(a.color, 7)}<span>${a.short}</span></div>`,
  ).join('');
  return card(`
      ${cardHead('Línea del día', `<div style="display: flex; align-items: center; gap: 14px;">${legend}</div>`)}
      <div style="display: flex; flex-direction: column; gap: 6px;">
        <div style="position: relative; height: 14px;">
          <div style="position: absolute; left: ${now}%; transform: translateX(-50%); font-size: 11px; font-weight: 600; color: ${C.ink};">Ahora</div>
        </div>
        <div style="position: relative; height: 42px;">
          ${grid}
          ${blocks}
          <div style="position: absolute; top: 0; bottom: 0; left: ${now}%; width: 2px; margin-left: -1px; background: ${C.ink}; border-radius: 1px;"></div>
        </div>
        <div style="position: relative; height: 16px;">${labels}</div>
      </div>`);
}

export function tiempo() {
  const h = 1240;
  const max = Math.max(...PROJECTS.map((p) => p.today));
  const bars = PROJECTS.map((p) => {
    const w = ((p.today / max) * 100).toFixed(2);
    const pc = Math.round((p.today / TODAY_TOTAL) * 100);
    const n = TASKS.filter((t) => t.project === p.id && t.today > 0).length;
    return `<div style="display: grid; grid-template-columns: 210px minmax(0, 1fr) 140px; align-items: center; gap: 16px; height: 44px;">
          <div style="display: flex; align-items: center; gap: 10px; min-width: 0;">${dot(p.color)}<div style="display: flex; flex-direction: column;"><span style="font-size: 14px; font-weight: 500; color: ${C.ink};">${p.name}</span><span style="font-size: 12px; color: ${C.ink3};">${n} ${n === 1 ? 'tarea' : 'tareas'} hoy</span></div></div>
          <div style="height: 14px;"><div style="height: 14px; width: ${w}%; background: ${p.color}; border-radius: 0 4px 4px 0;"></div></div>
          <div style="display: flex; justify-content: flex-end; align-items: baseline; gap: 8px; font-size: 13.5px;"><span class="tnum" style="font-weight: 600; color: ${C.ink};">${dur(p.today)}</span><span class="tnum" style="width: 34px; text-align: right; color: ${C.ink3};">${pc} %</span></div>
        </div>`;
  }).join('');

  const byProject = card(`
      <div style="display: flex; align-items: flex-end; justify-content: space-between; gap: 16px;">
        <div style="display: flex; flex-direction: column; gap: 2px;">
          ${label('Tiempo por proyecto · hoy')}
          <div style="font-size: 48px; line-height: 54px; font-weight: 600; letter-spacing: -0.03em; color: ${C.ink};">${dur(TODAY_TOTAL)}</div>
        </div>
        <div style="font-size: 13px; color: ${C.ink3}; padding-bottom: 8px;">5 proyectos · 6 sesiones</div>
      </div>
      <div style="display: flex; flex-direction: column; gap: 2px;">${bars}</div>`);

  const circleBtn = (running, size = 28) =>
    running
      ? `<div style="width: ${size}px; height: ${size}px; border-radius: 50%; background: ${C.critSoft}; display: flex; align-items: center; justify-content: center;">${icon('stop', 12, C.critText)}</div>`
      : `<div style="width: ${size}px; height: ${size}px; border-radius: 50%; background: ${C.fill}; display: flex; align-items: center; justify-content: center;">${icon('play', 12, C.ink2)}</div>`;

  const cols = 'minmax(0, 1fr) 150px 100px 28px';
  const rows = [...SESSIONS].reverse().map((s, i) => {
    const t = task(s.task);
    const p = proj(t.project);
    const running = !s.end;
    return `<div style="display: grid; grid-template-columns: ${cols}; align-items: center; gap: 16px; height: 52px;${i ? ` border-top: 1px solid ${C.rule};` : ''}">
          <div style="display: flex; align-items: center; gap: 10px; min-width: 0;">${dot(p.color)}<div style="display: flex; flex-direction: column; min-width: 0;"><div style="display: flex; align-items: center; gap: 10px;"><span style="font-size: 14px; color: ${C.ink};">${t.name}</span>${running ? statusLive() : ''}</div><span style="font-size: 12px; color: ${C.ink3};">${p.name}</span></div></div>
          <div class="tnum" style="font-size: 13.5px; color: ${C.ink2};">${s.start} – ${running ? 'ahora' : s.end}</div>
          <div class="tnum" style="font-size: 13.5px; font-weight: 600; color: ${C.ink}; text-align: right;">${dur(s.min)}</div>
          ${circleBtn(running)}
        </div>`;
  }).join('');

  const registros = card(`
      ${cardHead('Registros', `<div style="font-size: 13px; color: ${C.ink3};">6 sesiones hoy</div>`)}
      <div style="display: flex; flex-direction: column;">
        <div style="display: grid; grid-template-columns: ${cols}; gap: 16px; padding-bottom: 8px; border-bottom: 1px solid ${C.line}; font-size: 12px; font-weight: 500; color: ${C.ink3};">
          <span>Tarea</span><span>Horario</span><span style="text-align: right;">Duración</span><span></span>
        </div>
        ${rows}
      </div>`);

  const groups = PROJECTS.map((p, gi) => {
    const items = TASKS.filter((t) => t.project === p.id)
      .map(
        (t) => `<div style="display: flex; align-items: center; gap: 10px; height: 46px; padding-left: 18px;">
          <div style="flex-grow: 1; min-width: 0; display: flex; flex-direction: column;">
            <div style="font-size: 13.5px; font-weight: 500; color: ${C.ink};">${t.name}</div>
            <div class="tnum" style="font-size: 12px; color: ${t.running ? C.ink2 : C.ink3};">${t.running ? `En curso · ${dur(t.today)}` : t.today ? `Hoy ${dur(t.today)}` : 'Sin registros hoy'}</div>
          </div>
          ${circleBtn(t.running, 30)}
        </div>`,
      )
      .join('');
    return `<div style="display: flex; flex-direction: column; padding: 10px 0 2px;${gi ? ` border-top: 1px solid ${C.rule};` : ''}">
        <div style="display: flex; align-items: center; gap: 8px; height: 24px;">
          ${dot(p.color)}<span style="flex-grow: 1; font-size: 13px; font-weight: 600; color: ${C.ink};">${p.name}</span><span class="tnum" style="font-size: 12px; color: ${C.ink3};">${dur(p.today)}</span>
        </div>
        ${items}
      </div>`;
  }).join('');

  const tareas = card(`
      ${cardHead('Proyectos y tareas', `<div style="display: flex; align-items: center; gap: 4px; font-size: 13px; font-weight: 500; color: {{accent}};">${icon('plus', 14, '{{accent}}', 2)}<span>Proyecto</span></div>`)}
      <div style="display: flex; align-items: center; gap: 8px; height: 38px; padding: 0 6px 0 12px; border-radius: 10px; border: 1px solid ${C.line2}; background: #FFFFFF;">
        ${icon('plus', 16, C.ink3, 2)}<span style="flex-grow: 1; font-size: 13.5px; color: ${C.ink4};">Nueva tarea…</span>
        <div style="display: flex; align-items: center; gap: 5px; height: 26px; padding: 0 8px; border-radius: 6px; background: ${C.fill}; font-size: 12px; font-weight: 500; color: ${C.ink2};">${dot(proj('os').color, 6)}<span>OS Vena</span>${icon('chevDown', 12, C.ink3, 2)}</div>
      </div>
      <div style="display: flex; flex-direction: column; margin-top: -6px;">${groups}</div>
      <div style="font-size: 12.5px; color: ${C.ink3}; line-height: 17px;">Al iniciar otra tarea, la que está en curso se detiene sola.</div>`);

  const timerBar = `<div style="display: flex; align-items: center; gap: 16px; padding: 14px 16px 14px 20px; border: 1px solid ${C.line}; border-radius: 14px; background: #FFFFFF; box-shadow: 0 1px 3px rgba(31, 30, 28, 0.05);">
      ${dot(C.good, 9)}
      <div style="flex-grow: 1; display: flex; flex-direction: column; gap: 2px;">
        <div style="display: flex; align-items: center; gap: 6px; font-size: 16px; font-weight: 600; color: ${C.ink};"><span>${RUNNING.task}</span>${icon('chevDown', 16, C.ink3, 2)}</div>
        <div style="display: flex; align-items: center; gap: 6px; font-size: 12.5px; color: ${C.ink3};">${dot(proj('os').color, 7)}<span>${RUNNING.project} · en curso desde las ${RUNNING.since}</span></div>
      </div>
      <div class="tnum" style="font-size: 30px; font-weight: 600; letter-spacing: -0.02em; color: ${C.ink};">${RUNNING.elapsed}</div>
      ${stopBtn('Detener', 40)}
    </div>`;

  const content = `
    ${pageHeader({
      eyebrow: 'Viernes, 11 de septiembre',
      title: 'Tiempo',
      right: `${segmented(['Día', 'Semana', 'Mes'], 'Día')}${stepper('Hoy')}${btnGhost('Todos los proyectos', null, 'chevDown')}${btnGhost('Nueva tarea', 'plus')}`,
    })}
    ${timerBar}
    ${timeline()}
    <div style="display: grid; grid-template-columns: minmax(0, 1fr) 340px; gap: 20px; align-items: start;">
      <div style="display: flex; flex-direction: column; gap: 20px;">${byProject}${registros}</div>
      ${tareas}
    </div>`;

  return { w: 1440, h, html: doc({ w: 1440, h, body: desktop({ active: 'Tiempo', h, content, timer: false, gap: 20 }) }) };
}

// ============================== CONSUMO IA ==============================
function roundTop(x, y, w, h, r) {
  if (h <= 0) return '';
  const rr = Math.min(r, h, w / 2);
  return `M${x} ${y + h} V${(y + rr).toFixed(1)} Q${x} ${y} ${x + rr} ${y} H${x + w - rr} Q${x + w} ${y} ${x + w} ${(y + rr).toFixed(1)} V${y + h} Z`;
}

function dailyChart() {
  const W = 1030;
  const H = 262;
  const x0 = 46;
  const plotW = W - x0;
  const slot = plotW / 30;
  const bw = 16;
  const base = 232;
  const k = 4.4; // px per USD ($50 → 220px)
  const hover = 10; // today, 11 sep — tooltip sits over the empty rest of the month
  let g = '';
  for (let v = 0; v <= 50; v += 10) {
    const y = base - v * k;
    g += `<line x1="${x0}" x2="${W}" y1="${y}" y2="${y}" stroke="${v ? C.grid : C.axis}" stroke-width="1"></line>`;
    g += `<text x="${x0 - 10}" y="${y + 4}" text-anchor="end" font-size="11" fill="${C.ink3}" style="font-variant-numeric: tabular-nums;">$${v}</text>`;
  }
  const hx = x0 + hover * slot;
  g = `<rect x="${hx.toFixed(1)}" y="8" width="${slot.toFixed(1)}" height="${base - 8}" rx="4" fill="#F4F3EF"></rect>` + g;
  // Stack accounts bottom→top; 2px surface gap between segments, rounded top on the last one.
  DAYS.forEach((vals, i) => {
    const x = +(x0 + (i + 0.5) * slot - bw / 2).toFixed(1);
    const segs = vals.map((v, j) => ({ v, color: ACCOUNTS[j].color })).filter((s) => s.v > 0);
    let y = base;
    segs.forEach((s, j) => {
      const hs = s.v * k - (j ? 2 : 0);
      const top = +(y - hs).toFixed(1);
      g +=
        j === segs.length - 1
          ? `<path d="${roundTop(x, top, bw, +hs.toFixed(1), 4)}" fill="${s.color}"></path>`
          : `<rect x="${x}" y="${top}" width="${bw}" height="${hs.toFixed(1)}" fill="${s.color}"></rect>`;
      y = top - 2;
    });
  });
  [1, 5, 10, 15, 20, 25, 30].forEach((d) => {
    const x = x0 + (d - 0.5) * slot;
    g += `<text x="${x.toFixed(1)}" y="${base + 20}" text-anchor="middle" font-size="11" fill="${C.ink3}" style="font-variant-numeric: tabular-nums;">${d}</text>`;
  });
  const tx = x0 + 10.5 * slot;
  g += `<text x="${tx.toFixed(1)}" y="${base + 20}" text-anchor="middle" font-size="11" font-weight="600" fill="${C.ink2}">Hoy</text>`;
  const today = DAYS[hover];
  const tipLeft = Math.round(hx + slot + 8);
  const legend = ACCOUNTS
    .map(
      (s) => `<div style="display: flex; align-items: center; gap: 6px; font-size: 12.5px; color: ${C.ink2};"><span style="width: 10px; height: 10px; border-radius: 3px; background: ${s.color};"></span><span>${s.name}</span></div>`,
    )
    .join('');
  const tipRow = (color, name, v, bold = false) =>
    `<div style="display: flex; align-items: center; gap: 8px; font-size: 12.5px;">${color ? `<span style="width: 8px; height: 8px; border-radius: 2px; background: ${color};"></span>` : '<span style="width: 8px;"></span>'}<span style="flex-grow: 1; color: ${C.ink2};${bold ? ` font-weight: 600; color: ${C.ink};` : ''}">${name}</span><span class="tnum" style="color: ${C.ink}; font-weight: ${bold ? 600 : 500};">${usd(v)}</span></div>`;
  return card(`
      ${cardHead('Costo diario en USD', `<div style="display: flex; align-items: center; gap: 16px;">${legend}</div>`)}
      <div style="position: relative;">
        <svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" style="display: block;">${g}</svg>
        <div style="position: absolute; top: 18px; left: ${tipLeft}px; width: 232px; display: flex; flex-direction: column; gap: 6px; padding: 10px 12px; background: #FFFFFF; border: 1px solid ${C.line}; border-radius: 10px; box-shadow: 0 8px 24px rgba(31, 30, 28, 0.10);">
          <div style="font-size: 12px; font-weight: 600; color: ${C.ink};">Hoy, 11 de septiembre</div>
          ${ACCOUNTS.map((a, j) => tipRow(a.color, a.name, today[j])).join('')}
          <div style="height: 1px; background: ${C.rule};"></div>
          ${tipRow(null, 'Total', today.reduce((s, v) => s + v, 0), true)}
        </div>
      </div>`);
}

const tok = (m) => (Number.isInteger(m) ? `${m} M` : `${num(m)} M`);

export function consumo() {
  const h = 1400;
  const tile = (lab, value, cap, hero = false) =>
    card(
      `${label(lab)}
        <div style="font-size: ${hero ? 48 : 30}px; line-height: ${hero ? 54 : 36}px; font-weight: 600; letter-spacing: ${hero ? '-0.03em' : '-0.02em'}; color: ${C.ink}; margin-top: ${hero ? 0 : 'auto'};">${value}</div>
        <div style="font-size: 12.5px; color: ${C.ink3};">${cap}</div>`,
      { gap: 6 },
    );
  const kpis = `<div style="display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 16px;">
      ${tile('Valor a precio API', usd(API_TOTAL), 'Del 1 al 11 sep · 1 modelo sin precio', true)}
      ${tile('Suscripciones', `$${SUBS_TOTAL}<span style="font-size: 15px; font-weight: 500; color: ${C.ink3}; letter-spacing: 0;">/mes</span>`, '2 cuentas de Claude · ChatGPT Plus')}
      ${tile('Rendimiento', RATIO, 'Valor a precio API ÷ lo que pagas')}
      ${tile('Tokens procesados', '468 M', '96 % leídos desde caché')}
    </div>`;

  const cols = 'minmax(0, 1fr) 118px 76px 76px 84px 118px';
  const mrow = (m, i) => {
    const s = SRC[m.src];
    const cost =
      m.cost == null
        ? `<div style="display: flex; align-items: center; justify-content: flex-end; gap: 6px; font-size: 13px; font-weight: 500; color: {{accent}};">${icon('alert', 14, C.warn, 2)}<span>Definir precio</span></div>`
        : `<div class="tnum" style="font-size: 13.5px; font-weight: 600; color: ${C.ink}; text-align: right;">${usd(m.cost)}</div>`;
    return `<div style="display: grid; grid-template-columns: ${cols}; align-items: center; gap: 12px; height: 46px;${i ? ` border-top: 1px solid ${C.rule};` : ''}">
          <div style="font-family: ${MONO}; font-size: 12.5px; color: ${C.ink};">${m.id}</div>
          <div style="font-size: 13px; color: ${C.ink2};">${s.name}</div>
          <div class="tnum" style="font-size: 13px; color: ${C.ink2}; text-align: right;">${tok(m.input)}</div>
          <div class="tnum" style="font-size: 13px; color: ${C.ink2}; text-align: right;">${tok(m.output)}</div>
          <div class="tnum" style="font-size: 13px; color: ${C.ink2}; text-align: right;">${tok(m.cache)}</div>
          ${cost}
        </div>`;
  };
  const models = card(`
      ${cardHead('Por modelo', `<div style="display: flex; align-items: center; gap: 2px; font-size: 13px; font-weight: 500; color: {{accent}};"><span>Tabla de precios</span>${icon('chevRight', 14, '{{accent}}', 2)}</div>`)}
      <div style="display: flex; flex-direction: column;">
        <div style="display: grid; grid-template-columns: ${cols}; gap: 12px; padding-bottom: 8px; border-bottom: 1px solid ${C.line}; font-size: 12px; font-weight: 500; color: ${C.ink3};">
          <span>Modelo</span><span>Fuente</span><span style="text-align: right;">Entrada</span><span style="text-align: right;">Salida</span><span style="text-align: right;">Caché</span><span style="text-align: right;">Costo</span>
        </div>
        ${MODELS.map(mrow).join('')}
        <div style="display: grid; grid-template-columns: ${cols}; align-items: center; gap: 12px; height: 46px; border-top: 1px solid ${C.line}; font-size: 13.5px; font-weight: 600; color: ${C.ink};">
          <span>Total</span><span></span>
          <span class="tnum" style="text-align: right;">13,6 M</span><span class="tnum" style="text-align: right;">4,9 M</span><span class="tnum" style="text-align: right;">449,3 M</span><span class="tnum" style="text-align: right;">${usd(API_TOTAL)}</span>
        </div>
      </div>
      <div style="font-size: 12.5px; color: ${C.ink3};">gpt-5.6-sol no suma al total hasta que definas su precio por millón de tokens.</div>`);

  const subRows = SUBS.map(
    (s, i) => `<div style="display: flex; flex-direction: column; gap: 8px; padding: 12px 0;${i ? ` border-top: 1px solid ${C.rule};` : ''}">
          <div style="display: flex; align-items: flex-start; justify-content: space-between; gap: 8px;">
            <div style="display: flex; flex-direction: column; gap: 1px; min-width: 0;">
              <div style="display: flex; align-items: center; gap: 7px; font-size: 14px; font-weight: 600; color: ${C.ink};">${dot(s.color)}<span>${s.plan}</span><span style="font-weight: 500; color: ${C.ink3};">· ${s.account}</span></div>
              <div style="font-size: 12.5px; color: ${C.ink3}; padding-left: 15px;">${s.email}</div>
              <div style="font-size: 12.5px; color: ${C.ink3}; padding-left: 15px;">${s.renew}</div>
            </div>
            <div class="tnum" style="font-size: 14px; font-weight: 600; color: ${C.ink};">$${s.price}<span style="font-size: 12.5px; font-weight: 500; color: ${C.ink3};">/mes</span></div>
          </div>
          <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px; font-size: 13px; color: ${C.ink2};">
            <span>Valor a precio API: <span class="tnum" style="font-weight: 600; color: ${C.ink};">${usd(s.value)}</span></span>${pill(`Rinde ${s.ratio}`)}
          </div>
        </div>`,
  ).join('');
  const subs = card(`
      ${cardHead('Cuentas y suscripciones', `<div class="tnum" style="font-size: 13px; color: ${C.ink3};">$${SUBS_TOTAL}/mes</div>`)}
      <div style="display: flex; flex-direction: column; margin-top: -8px;">${subRows}</div>
      <div style="display: flex; align-items: center; gap: 6px; font-size: 13.5px; font-weight: 500; color: {{accent}};">${icon('plus', 16, '{{accent}}', 2)}<span>Agregar suscripción</span></div>`);

  const collector = card(`
      ${cardHead('Colector local', statusLive('Activo'))}
      <div style="display: flex; align-items: center; gap: 12px;">
        <div style="width: 36px; height: 36px; border-radius: 10px; background: ${C.fill}; display: flex; align-items: center; justify-content: center;">${icon('laptop', 18, C.ink2)}</div>
        <div style="display: flex; flex-direction: column; gap: 1px;">
          <div style="font-size: 13.5px; font-weight: 500; color: ${C.ink};">MacBook Pro de Laura</div>
          <div style="font-size: 12.5px; color: ${C.ink3};">Lee ~/.claude y ~/.codex cada 10 min</div>
        </div>
      </div>
      <div style="display: flex; flex-direction: column; gap: 6px;">
        <div style="display: flex; align-items: center; gap: 8px; font-size: 12.5px; color: ${C.ink2};">${icon('sync', 15, C.ink3)}<span>Última subida hoy a las 14:44</span></div>
        <div style="display: flex; align-items: center; gap: 8px; font-size: 12.5px; color: ${C.ink2};">${dot(ACCOUNTS[0].color, 7)}<span>Sesión activa en Claude Code: cuenta Personal</span></div>
      </div>`);

  const content = `
    ${pageHeader({
      eyebrow: `${dot(C.good, 7)}<span>Sincronizado hace 3 min</span>`,
      title: 'Consumo IA',
      right: `${btnGhost('Todas las cuentas', null, 'chevDown')}${segmented(['Día', 'Semana', 'Mes'], 'Mes')}${stepper('Septiembre 2026')}`,
    })}
    ${kpis}
    ${dailyChart()}
    <div style="display: grid; grid-template-columns: minmax(0, 1fr) 340px; gap: 20px; align-items: start;">
      ${models}
      <div style="display: flex; flex-direction: column; gap: 20px;">${subs}${collector}</div>
    </div>`;

  return { w: 1440, h, html: doc({ w: 1440, h, body: desktop({ active: 'Consumo IA', h, content, gap: 20 }) }) };
}

// ============================== TABLEROS ==============================
export function tableros() {
  const h = 800;
  const cards = BOARDS.map(
    (b) => `<div style="border: 1px solid ${C.line}; border-radius: 14px; overflow: hidden; background: #FFFFFF; display: flex; flex-direction: column;">
        <div style="height: 196px; padding: 10px; border-bottom: 1px solid ${C.rule}; ${DOTS}">${sketch(b.sketch)}</div>
        <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 12px 16px 14px;">
          <div style="display: flex; flex-direction: column; gap: 2px;">
            <div style="font-size: 14.5px; font-weight: 600; color: ${C.ink};">${b.name}</div>
            <div style="font-size: 12.5px; color: ${C.ink3};">${b.meta}</div>
          </div>
          ${icon('more', 18, C.ink3)}
        </div>
      </div>`,
  ).join('');
  const content = `
    ${pageHeader({
      eyebrow: '6 tableros',
      title: 'Tableros',
      right: `${searchField('Buscar tableros', 220)}${btnGhost('Recientes', 'sort', 'chevDown')}${btnPrimary('Nuevo tablero')}`,
    })}
    <div style="display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 20px;">${cards}</div>`;
  return { w: 1440, h, html: doc({ w: 1440, h, head: FONT_HAND, body: desktop({ active: 'Tableros', h, content }) }) };
}

// ============================== TABLERO ABIERTO ==============================
export function tableroEditor() {
  const w = 1440;
  const h = 900;
  const INK = '#3D3C39';
  const hand = (x, y, t, size, anchor = 'middle', fill = C.ink) =>
    `<text x="${x}" y="${y}" text-anchor="${anchor}" font-family="${HAND}" font-size="${size}" fill="${fill}">${t}</text>`;
  const box = (x, y, bw, bh, fill) =>
    `<rect x="${x}" y="${y}" width="${bw}" height="${bh}" rx="14" fill="${fill}" stroke="${INK}" stroke-width="2"></rect>`;
  const arrowHead = (x, y, ang) => {
    const l = 12;
    const p1 = [x - l * Math.cos(ang - 0.45), y - l * Math.sin(ang - 0.45)];
    const p2 = [x - l * Math.cos(ang + 0.45), y - l * Math.sin(ang + 0.45)];
    return `M${p1[0].toFixed(1)} ${p1[1].toFixed(1)} L${x} ${y} L${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
  };
  const conn = (x1, y1, x2, y2, both = false) => {
    const a = Math.atan2(y2 - y1, x2 - x1);
    return `<path d="M${x1} ${y1} L${x2} ${y2} ${arrowHead(x2, y2, a)}${both ? ' ' + arrowHead(x1, y1, a + Math.PI) : ''}" fill="none" stroke="${INK}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path>`;
  };
  // selection around Supabase
  const sx = 592, sy = 272, sw = 276, sh = 160;
  const handles = [
    [sx, sy], [sx + sw / 2, sy], [sx + sw, sy], [sx, sy + sh / 2], [sx + sw, sy + sh / 2], [sx, sy + sh], [sx + sw / 2, sy + sh], [sx + sw, sy + sh],
  ]
    .map(([x, y]) => `<rect x="${x - 5}" y="${y - 5}" width="10" height="10" rx="2.5" fill="#FFFFFF" stroke="{{accent}}" stroke-width="1.5"></rect>`)
    .join('');
  const diagram = `
    ${hand(180, 150, 'Arquitectura v1', 42, 'start')}
    <path d="M182 168 C 240 160, 300 172, 356 164 S 420 162, 432 166" fill="none" stroke="${S[1]}" stroke-width="3" stroke-linecap="round"></path>
    ${box(180, 300, 240, 104, '#FFFFFF')}
    ${hand(300, 346, 'MacBook · colector', 27)}
    ${hand(300, 378, 'lee ~/.claude y ~/.codex', 21, 'middle', C.ink2)}
    ${conn(426, 352, 590, 352)}
    ${hand(508, 336, 'cada 10 min', 21, 'middle', C.ink2)}
    ${box(600, 280, 260, 144, '#E9F5EE')}
    ${hand(730, 344, 'Supabase', 34)}
    ${hand(730, 380, 'Postgres · Auth · Storage', 21, 'middle', C.ink2)}
    ${box(1000, 180, 250, 100, '#EAF2FB')}
    ${hand(1125, 238, 'App web · Hostinger', 27)}
    ${box(1000, 440, 250, 100, '#EAF2FB')}
    ${hand(1125, 498, 'iPhone · PWA', 27)}
    ${conn(994, 244, 872, 318, true)}
    ${conn(994, 476, 872, 402, true)}
    <g transform="rotate(-2 710 580)">
      <rect x="600" y="522" width="220" height="116" rx="6" fill="#FDF4D3" stroke="${INK}" stroke-width="1.6"></rect>
      ${hand(710, 572, '¿Edge Function', 25)}
      ${hand(710, 602, 'para la ingesta?', 25)}
    </g>
    <rect x="${sx}" y="${sy}" width="${sw}" height="${sh}" rx="4" fill="none" stroke="{{accent}}" stroke-width="1.5" stroke-dasharray="6 4"></rect>
    <line x1="${sx + sw / 2}" y1="${sy - 5}" x2="${sx + sw / 2}" y2="${sy - 22}" stroke="{{accent}}" stroke-width="1.5"></line>
    <circle cx="${sx + sw / 2}" cy="${sy - 27}" r="5.5" fill="#FFFFFF" stroke="{{accent}}" stroke-width="1.5"></circle>
    ${handles}`;

  const tool = (ic, on = false) =>
    `<div style="width: 36px; height: 36px; border-radius: 8px; display: flex; align-items: center; justify-content: center; background: ${on ? '{{accentSoft}}' : 'transparent'}; color: ${on ? '{{accent}}' : C.ink2};">${icon(ic, 18, on ? '{{accent}}' : C.ink2)}</div>`;
  const sep = `<div style="width: 1px; height: 22px; background: ${C.line}; margin: 0 4px;"></div>`;
  const toolbar = `<div style="position: absolute; top: 16px; left: 50%; transform: translateX(-50%); display: flex; align-items: center; gap: 2px; padding: 4px; background: #FFFFFF; border: 1px solid ${C.line}; border-radius: 12px; box-shadow: 0 6px 20px rgba(31, 30, 28, 0.08), 0 1px 3px rgba(31, 30, 28, 0.06);">
      ${tool('cursor', true)}${tool('move')}${sep}${tool('rect')}${tool('diamond')}${tool('ellipse')}${tool('arrow')}${tool('line')}${tool('pencil')}${tool('text')}${tool('image')}${sep}${tool('eraser')}
    </div>`;
  const ctlGroup = (inner) =>
    `<div style="display: flex; align-items: center; height: 38px; padding: 0 4px; background: #FFFFFF; border: 1px solid ${C.line}; border-radius: 10px; box-shadow: 0 1px 3px rgba(31, 30, 28, 0.06);">${inner}</div>`;
  const ctl = (ic) => `<div style="width: 30px; height: 30px; display: flex; align-items: center; justify-content: center; color: ${C.ink2};">${icon(ic, 16, C.ink2, 2)}</div>`;
  const controls = `<div style="position: absolute; left: 16px; bottom: 16px; display: flex; gap: 8px;">
      ${ctlGroup(`${ctl('minus')}<div class="tnum" style="font-size: 12.5px; font-weight: 500; color: ${C.ink}; padding: 0 6px;">100 %</div>${ctl('plus')}`)}
      ${ctlGroup(`${ctl('undo')}${ctl('redo')}`)}
    </div>`;

  const topbar = `<div style="height: 52px; flex-shrink: 0; display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 0 16px; background: #FFFFFF; border-bottom: 1px solid ${C.line};">
      <div style="display: flex; align-items: center; gap: 12px;">
        <div style="display: flex; align-items: center; gap: 4px; height: 32px; padding: 0 8px 0 4px; border-radius: 8px; font-size: 13.5px; font-weight: 500; color: ${C.ink2};">${icon('chevLeft', 18, C.ink2, 2)}<span>Tableros</span></div>
        <div style="width: 1px; height: 20px; background: ${C.line};"></div>
        <div style="display: flex; align-items: center; gap: 6px; font-size: 14.5px; font-weight: 600; color: ${C.ink};">${icon('shapes', 16, C.ink2)}<span>Arquitectura OS Vena</span>${icon('chevDown', 14, C.ink3, 2)}</div>
        <div style="display: flex; align-items: center; gap: 4px; font-size: 12.5px; color: ${C.ink3};">${icon('check', 14, C.ink3, 2)}<span>Guardado</span></div>
      </div>
      <div style="display: flex; align-items: center; gap: 8px;">${btnGhost('Exportar', 'share')}${iconBtn('more')}</div>
    </div>`;

  const body = `<div style="width: ${w}px; height: ${h}px; display: flex; flex-direction: column; background: #FCFCFB;">
  ${topbar}
  <div style="flex-grow: 1; position: relative; overflow: hidden; ${DOTS}">
    <svg width="${w}" height="${h - 52}" viewBox="0 0 ${w} ${h - 52}" style="position: absolute; inset: 0; display: block;">${diagram}</svg>
    ${toolbar}
    ${controls}
  </div>
</div>`;
  return { w, h, html: doc({ w, h, head: FONT_HAND, body, bodyBg: '#FCFCFB' }) };
}

// ============================== NOTAS ==============================
export function notas() {
  const h = 1060;
  const chips = [['Todas', NOTES_TOTAL, null], ...Object.values(TYPES).map((t) => [t.label, t.count, t.dot])]
    .map(([t, n, d], i) =>
      i === 0
        ? `<div style="display: flex; align-items: center; gap: 6px; height: 30px; padding: 0 12px; border-radius: 15px; background: ${C.ink}; color: #FFFFFF; font-size: 13px; font-weight: 600;"><span>${t}</span><span class="tnum" style="color: rgba(255, 255, 255, 0.65); font-weight: 500;">${n}</span></div>`
        : `<div style="display: flex; align-items: center; gap: 6px; height: 30px; padding: 0 12px; border-radius: 15px; background: ${C.fill}; color: ${C.ink2}; font-size: 13px; font-weight: 500;">${dot(d, 7)}<span>${t}</span><span class="tnum" style="color: ${C.ink3};">${n}</span></div>`,
    )
    .join('');
  const R = NOTES_RECENT;
  const colsSpec = [
    [R.supabase, R.caos],
    [R.facturas, R.episodio, R.push],
    [R.paleta, R.metricas],
    [R.excalidraw, R.github, R.hig],
  ];
  const masonry = colsSpec
    .map((col) => `<div style="flex-grow: 1; flex-basis: 0; min-width: 0; display: flex; flex-direction: column; gap: 16px;">${col.map((n) => noteCard(n)).join('')}</div>`)
    .join('');
  const typeChip = `<div style="display: flex; align-items: center; gap: 6px; height: 28px; padding: 0 10px; border-radius: 8px; background: #FFFFFF; border: 1px solid ${C.line2}; font-size: 12.5px; font-weight: 500; color: ${C.ink2};">${dot(TYPES.nota.dot, 7)}<span>Nota</span>${icon('chevDown', 13, C.ink3, 2)}</div>`;
  const content = `
    ${pageHeader({ eyebrow: `${NOTES_TOTAL} notas`, title: 'Notas', right: `${searchField('Buscar en notas', 240)}${btnPrimary('Nueva nota')}` })}
    <div style="display: flex; flex-direction: column; gap: 16px;">
      <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">${chips}</div>
      ${captureBar('Escribe algo, pega un link o arrastra una imagen…', `<div style="display: flex; align-items: center; gap: 12px;">${typeChip}${kbdHint('guardar')}</div>`)}
    </div>
    <section style="display: flex; flex-direction: column; gap: 12px;">
      <div style="display: flex; align-items: center; gap: 6px; font-size: 13px; font-weight: 600; color: ${C.ink2};">${icon('pin', 14, C.ink3)}<span>Fijadas</span></div>
      <div style="display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 16px; align-items: start;">${NOTES_PINNED.map((n) => noteCard(n)).join('')}</div>
    </section>
    <section style="display: flex; flex-direction: column; gap: 12px;">
      <div style="font-size: 13px; font-weight: 600; color: ${C.ink2};">Recientes</div>
      <div style="display: flex; gap: 16px; align-items: flex-start;">${masonry}</div>
    </section>`;
  return { w: 1440, h, html: doc({ w: 1440, h, body: desktop({ active: 'Notas', h, content }) }) };
}
