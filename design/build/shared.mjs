// Tokens, icons and app chrome shared by every OS Vena Digital mockup.
// Direction: neutral Notion/Apple — system font (SF Pro), warm grays, one accent.

export const C = {
  ink: '#1F1E1C',
  ink2: '#52514E',
  ink3: '#898781',
  ink4: '#A9A7A1',
  navInk: '#3D3C39',
  bg: '#FFFFFF',
  plane: '#F9F9F7',
  fill: '#F2F1ED',
  fill2: '#EBEAE5',
  line: '#EAE9E4',
  line2: '#DEDCD5',
  rule: '#F0EFEA',
  grid: '#ECEBE6',
  axis: '#C3C2B7',
  good: '#0CA30C',
  warn: '#FAB219',
  critText: '#B42F2F',
  critSoft: '#FCEBEA',
  spark: '#D9D7D0',
};

// Validated categorical order (dataviz reference palette, light mode).
export const S = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#4a3aa7', '#e34948'];

export const ACCENT = '#256abf';
export const ACCENT_OPTIONS = ['#256abf', '#1f1e1c', '#c94a36', '#1f7a55'];
export const MONO = "ui-monospace, 'SF Mono', Menlo, monospace";
export const HAND = "'Caveat', 'Bradley Hand', 'Comic Sans MS', cursive";

const P = {
  home: '<path d="M4 10.5 12 4l8 6.5"></path><path d="M6 9v10.5c0 .3.2.5.5.5H10v-5.5h4V20h3.5c.3 0 .5-.2.5-.5V9"></path>',
  timer: '<circle cx="12" cy="13.5" r="7.5"></circle><path d="M12 10v3.5l2.3 1.6"></path><path d="M9.5 3h5"></path><path d="m18.5 6.5 1.2-1.2"></path>',
  sparkle: '<path d="M11 3.5c.5 4.2 2.3 6 6.5 6.5-4.2.5-6 2.3-6.5 6.5-.5-4.2-2.3-6-6.5-6.5 4.2-.5 6-2.3 6.5-6.5Z"></path><path d="M18.5 15c.2 1.6 1 2.3 2.5 2.5-1.5.2-2.3.9-2.5 2.5-.2-1.6-1-2.3-2.5-2.5 1.5-.2 2.3-.9 2.5-2.5Z"></path>',
  shapes: '<rect x="3.5" y="3.5" width="7.5" height="7.5" rx="1.5"></rect><circle cx="17" cy="7.25" r="3.75"></circle><path d="M12 13.5l4.5 7h-9Z"></path>',
  note: '<path d="M5 4h14a1 1 0 0 1 1 1v9.5L14.5 20H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Z"></path><path d="M14.5 20v-4.5a1 1 0 0 1 1-1H20"></path>',
  search: '<circle cx="11" cy="11" r="6.5"></circle><path d="m20 20-4.2-4.2"></path>',
  plus: '<path d="M12 5v14M5 12h14"></path>',
  play: '<path d="M8.5 6.2v11.6c0 .8.9 1.3 1.6.9l9.3-5.8c.6-.4.6-1.3 0-1.7l-9.3-5.8c-.7-.4-1.6.1-1.6.8Z" fill="currentColor" stroke="none"></path>',
  stop: '<rect x="6.5" y="6.5" width="11" height="11" rx="2.5" fill="currentColor" stroke="none"></rect>',
  chevDown: '<path d="m6.5 9.5 5.5 5.5 5.5-5.5"></path>',
  chevUpDown: '<path d="m8 9.5 4-4 4 4"></path><path d="m8 14.5 4 4 4-4"></path>',
  chevLeft: '<path d="m14.5 6-6 6 6 6"></path>',
  chevRight: '<path d="m9.5 6 6 6-6 6"></path>',
  sliders: '<path d="M4 7h9M17 7h3M4 17h3M11 17h9"></path><circle cx="15" cy="7" r="2"></circle><circle cx="9" cy="17" r="2"></circle>',
  link: '<path d="M10 13.5a3.5 3.5 0 0 0 5 0l3-3a3.5 3.5 0 0 0-5-5l-1 1"></path><path d="M14 10.5a3.5 3.5 0 0 0-5 0l-3 3a3.5 3.5 0 0 0 5 5l1-1"></path>',
  pin: '<path d="M12 16.5V21"></path><path d="M8.5 3.5h7l-1 5.5 3 3v1.5h-11V12l3-3Z"></path>',
  more: '<circle cx="5.5" cy="12" r="1.4" fill="currentColor" stroke="none"></circle><circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none"></circle><circle cx="18.5" cy="12" r="1.4" fill="currentColor" stroke="none"></circle>',
  image: '<rect x="3.5" y="4.5" width="17" height="15" rx="2"></rect><circle cx="9" cy="10" r="1.6"></circle><path d="m20.5 15.5-4.5-4.5-8.5 8.5"></path>',
  circle: '<circle cx="12" cy="12" r="8"></circle>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"></path>',
  arrowUpRight: '<path d="M7.5 16.5 16.5 7.5"></path><path d="M9 7.5h7.5V15"></path>',
  sync: '<path d="M19.5 11A7.5 7.5 0 0 0 6.2 7.2L4.5 9"></path><path d="M4.5 4.5V9H9"></path><path d="M4.5 13a7.5 7.5 0 0 0 13.3 3.8l1.7-1.8"></path><path d="M19.5 19.5V15H15"></path>',
  laptop: '<rect x="4.5" y="5" width="15" height="10.5" rx="1.5"></rect><path d="M2.5 19h19"></path>',
  share: '<path d="M12 14.5V3.5"></path><path d="m8 7.5 4-4 4 4"></path><path d="M5.5 12v6.5a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2V12"></path>',
  cursor: '<path d="M6 4.5 11 19l2.2-6.3 6.3-2.2Z"></path>',
  move: '<path d="M12 3.5v17M3.5 12h17"></path><path d="m9.5 6 2.5-2.5L14.5 6M9.5 18l2.5 2.5 2.5-2.5M6 9.5 3.5 12 6 14.5M18 9.5l2.5 2.5-2.5 2.5"></path>',
  rect: '<rect x="4" y="5.5" width="16" height="13" rx="2"></rect>',
  diamond: '<path d="M12 3.5 20.5 12 12 20.5 3.5 12Z"></path>',
  ellipse: '<ellipse cx="12" cy="12" rx="8.5" ry="7"></ellipse>',
  arrow: '<path d="M5 19 19 5"></path><path d="M10 5h9v9"></path>',
  line: '<path d="M5 19 19 5"></path>',
  pencil: '<path d="M4.5 19.5h3.8L19 8.8a2.7 2.7 0 0 0-3.8-3.8L4.5 15.7Z"></path><path d="m13.5 6.5 4 4"></path>',
  text: '<path d="M5.5 7V5h13v2"></path><path d="M12 5v14"></path><path d="M9.5 19h5"></path>',
  eraser: '<path d="m7.5 19.5-3.2-3.2a1.5 1.5 0 0 1 0-2.1l9.4-9.4a1.5 1.5 0 0 1 2.1 0l4 4a1.5 1.5 0 0 1 0 2.1l-7.6 7.6"></path><path d="M7.5 19.5h12"></path><path d="m9.5 9.5 6 6"></path>',
  undo: '<path d="M9 14.5 4.5 10 9 5.5"></path><path d="M4.5 10H15a4.5 4.5 0 0 1 0 9h-3"></path>',
  redo: '<path d="m15 14.5 4.5-4.5L15 5.5"></path><path d="M19.5 10H9a4.5 4.5 0 0 0 0 9h3"></path>',
  minus: '<path d="M5 12h14"></path>',
  alert: '<path d="M12 4.5 20.5 19H3.5Z"></path><path d="M12 10v4"></path><circle cx="12" cy="16.6" r=".9" fill="currentColor" stroke="none"></circle>',
  compose: '<path d="M12 4.5H6a1.5 1.5 0 0 0-1.5 1.5v12A1.5 1.5 0 0 0 6 19.5h12a1.5 1.5 0 0 0 1.5-1.5v-6"></path><path d="m17.5 4 2.5 2.5L13 13.5l-3.2.7.7-3.2Z"></path>',
  sort: '<path d="M7 4.5v15M3.5 16 7 19.5l3.5-3.5"></path><path d="M13 6.5h7.5M13 12h5.5M13 17.5h3"></path>',
  enter: '<path d="M19 5.5v5.5a3 3 0 0 1-3 3H6"></path><path d="m9.5 10.5-3.5 3.5 3.5 3.5"></path>',
};

export function icon(name, size = 18, color = 'currentColor', sw = 1.75) {
  const tint = color === 'currentColor' ? '' : ` color: ${color};`;
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" style="display: block; flex-shrink: 0;${tint}">${P[name]}</svg>`;
}

// ---- formatting (es-CO) ----
export function dur(min) {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  if (!h) return `${m} min`;
  return m ? `${h} h ${m} min` : `${h} h`;
}
export function durShort(min) {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  if (!h) return `${m} min`;
  return m ? `${h} h ${String(m).padStart(2, '0')}` : `${h} h`;
}
export function usd(n) {
  const [i, d] = n.toFixed(2).split('.');
  return `$${i.replace(/\B(?=(\d{3})+(?!\d))/g, '.')},${d}`;
}
export function num(n, dec = 1) {
  return n.toFixed(dec).replace('.', ',');
}

// ---- document wrapper (one artboard) ----
export function doc({ w, h, body, head = '', bodyBg = C.bg }) {
  const props = JSON.stringify({
    accent: { editor: 'color', default: ACCENT, options: ACCENT_OPTIONS },
    $preview: { width: w, height: h },
  });
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <script src="./support.js"></script>
</head>
<body>
<x-dc>
<helmet>
  ${head}
  <style>
    html, body { margin: 0; background: ${bodyBg}; }
    body { font-family: -apple-system, BlinkMacSystemFont, system-ui, 'Segoe UI', 'Helvetica Neue', Arial, sans-serif; color: ${C.ink}; font-size: 14px; line-height: 1.43; -webkit-font-smoothing: antialiased; }
    * { box-sizing: border-box; }
    a { color: ${ACCENT}; text-decoration: none; }
    a:hover { color: #1c5cab; }
    h1, h2, h3, p { margin: 0; }
    .tnum { font-variant-numeric: tabular-nums; }
  </style>
</helmet>
${body}
</x-dc>
<script data-dc-script data-props='${props}'>
class Component extends DCLogic {
  soft(hex, alpha) {
    var m = /^#?([0-9a-f]{6})/i.exec(hex || '');
    if (!m) return 'rgba(37, 106, 191, ' + alpha + ')';
    var n = parseInt(m[1], 16);
    return 'rgba(' + ((n >> 16) & 255) + ', ' + ((n >> 8) & 255) + ', ' + (n & 255) + ', ' + alpha + ')';
  }
  renderVals() {
    var accent = this.props.accent ?? '${ACCENT}';
    return { accent: accent, accentSoft: this.soft(accent, 0.1), accentLine: this.soft(accent, 0.45) };
  }
}
</script>
</body>
</html>
`;
}

// ---- small building blocks ----
export const card = (inner, { gap = 16, pad = 20 } = {}) =>
  `<div style="background: ${C.bg}; border: 1px solid ${C.line}; border-radius: 14px; padding: ${pad}px; display: flex; flex-direction: column; gap: ${gap}px;">${inner}</div>`;

export const cardHead = (title, right = '') =>
  `<div style="display: flex; align-items: center; justify-content: space-between; gap: 12px; min-height: 22px;">
      <div style="font-size: 15px; font-weight: 600; color: ${C.ink}; letter-spacing: -0.005em;">${title}</div>
      ${right}
    </div>`;

export const moreLink = (label) =>
  `<div style="display: flex; align-items: center; gap: 2px; font-size: 13px; font-weight: 500; color: ${C.ink2};"><span>${label}</span>${icon('chevRight', 14, C.ink3, 2)}</div>`;

export const label = (text) =>
  `<div style="font-size: 13px; font-weight: 500; color: ${C.ink2};">${text}</div>`;

export const dot = (color, size = 8) =>
  `<span style="width: ${size}px; height: ${size}px; border-radius: 50%; background: ${color}; flex-shrink: 0;"></span>`;

export const btnPrimary = (text, ic = 'plus') =>
  `<div style="display: flex; align-items: center; gap: 6px; height: 34px; padding: 0 14px 0 12px; border-radius: 8px; background: {{accent}}; color: #FFFFFF; font-size: 13.5px; font-weight: 600; white-space: nowrap;">${ic ? icon(ic, 16, '#FFFFFF', 2) : ''}<span>${text}</span></div>`;

export const btnGhost = (text, ic = null, trail = null) =>
  `<div style="display: flex; align-items: center; gap: 6px; height: 34px; padding: 0 12px; border-radius: 8px; background: ${C.bg}; border: 1px solid ${C.line2}; color: ${C.ink}; font-size: 13.5px; font-weight: 500; white-space: nowrap;">${ic ? icon(ic, 16, C.ink2) : ''}<span>${text}</span>${trail ? icon(trail, 14, C.ink3, 2) : ''}</div>`;

export const iconBtn = (ic, size = 34) =>
  `<div style="width: ${size}px; height: ${size}px; border-radius: 8px; border: 1px solid ${C.line2}; background: ${C.bg}; display: flex; align-items: center; justify-content: center; color: ${C.ink2};">${icon(ic, 16)}</div>`;

export const stopBtn = (text = 'Detener', h = 34, full = false) =>
  `<div style="display: flex; align-items: center; justify-content: center; gap: 7px; height: ${h}px; padding: 0 16px; border-radius: ${h / 2}px; background: ${C.critSoft}; color: ${C.critText}; font-size: 14px; font-weight: 600;${full ? ' flex-grow: 1;' : ''}">${icon('stop', 14, C.critText)}<span>${text}</span></div>`;

export function segmented(items, active, { h = 30, full = false } = {}) {
  const seg = items
    .map((t) => {
      const on = t === active;
      return `<div style="display: flex; align-items: center; justify-content: center; height: ${h - 4}px; padding: 0 14px; border-radius: 7px; font-size: 13px; font-weight: ${on ? 600 : 500}; color: ${on ? C.ink : C.ink2};${on ? ' background: #FFFFFF; box-shadow: 0 1px 2px rgba(31, 30, 28, 0.10), 0 0 0 0.5px rgba(31, 30, 28, 0.08);' : ''}${full ? ' flex-grow: 1;' : ''}">${t}</div>`;
    })
    .join('');
  return `<div style="display: flex; align-items: center; gap: 2px; padding: 2px; border-radius: 9px; background: ${C.fill};${full ? ' width: 100%;' : ''}">${seg}</div>`;
}

export function stepper(text) {
  return `<div style="display: flex; align-items: center; gap: 2px; height: 34px; padding: 0 4px; border-radius: 8px; border: 1px solid ${C.line2}; background: ${C.bg};">
      <div style="width: 26px; height: 26px; display: flex; align-items: center; justify-content: center; color: ${C.ink2};">${icon('chevLeft', 16, C.ink2, 2)}</div>
      <div style="font-size: 13.5px; font-weight: 500; color: ${C.ink}; padding: 0 4px;">${text}</div>
      <div style="width: 26px; height: 26px; display: flex; align-items: center; justify-content: center; color: ${C.ink4};">${icon('chevRight', 16, C.ink4, 2)}</div>
    </div>`;
}

export function searchField(placeholder, w = 220) {
  return `<div style="display: flex; align-items: center; gap: 8px; width: ${w}px; height: 34px; padding: 0 10px; border-radius: 8px; background: ${C.fill}; color: ${C.ink3};">${icon('search', 16, C.ink3)}<span style="font-size: 13.5px; color: ${C.ink4};">${placeholder}</span></div>`;
}

export function pageHeader({ eyebrow = '', title, right = '' }) {
  return `<header style="display: flex; align-items: flex-end; justify-content: space-between; gap: 24px;">
    <div style="display: flex; flex-direction: column; gap: 4px;">
      ${eyebrow ? `<div style="display: flex; align-items: center; gap: 6px; font-size: 13px; font-weight: 500; color: ${C.ink3};">${eyebrow}</div>` : ''}
      <h1 style="font-size: 32px; line-height: 38px; font-weight: 700; letter-spacing: -0.022em; color: ${C.ink};">${title}</h1>
    </div>
    <div style="display: flex; align-items: center; gap: 10px;">${right}</div>
  </header>`;
}

// ---- desktop app chrome ----
const NAV = [
  ['home', 'Inicio'],
  ['timer', 'Tiempo'],
  ['sparkle', 'Consumo IA'],
  ['shapes', 'Tableros'],
  ['note', 'Notas'],
];

function navItem(ic, text, on) {
  return `<div style="display: flex; align-items: center; gap: 10px; height: 32px; padding: 0 10px; border-radius: 8px; font-size: 14px; font-weight: ${on ? 600 : 500}; color: ${on ? C.ink : C.navInk};${on ? ` background: ${C.fill2};` : ''}">
        ${icon(ic, 18, on ? C.ink : C.ink2)}
        <span>${text}</span>
      </div>`;
}

export const RECENT_BOARDS = ['Arquitectura OS Vena', 'Funnel Academia IA', 'Calendario de contenidos'];

export function sidebar(active, { timer = true } = {}) {
  const nav = NAV.map(([ic, t]) => navItem(ic, t, t === active)).join('');
  const recent = RECENT_BOARDS.map(
    (b) => `<div style="display: flex; align-items: center; gap: 10px; height: 30px; padding: 0 10px; border-radius: 8px; font-size: 13.5px; color: ${C.ink2};">
        ${icon('shapes', 16, C.ink3)}
        <span style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${b}</span>
      </div>`,
  ).join('');
  const timerWidget = timer
    ? `<div style="background: ${C.bg}; border: 1px solid ${C.line}; border-radius: 12px; padding: 12px; display: flex; flex-direction: column; gap: 6px; box-shadow: 0 1px 2px rgba(31, 30, 28, 0.04);">
      <div style="display: flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 500; color: ${C.ink2};">${dot(C.good, 7)}<span>En curso</span></div>
      <div style="display: flex; flex-direction: column; gap: 1px;">
        <div style="font-size: 13px; font-weight: 600; color: ${C.ink};">Diseño de pantallas</div>
        <div style="font-size: 12px; color: ${C.ink3};">OS Vena Digital</div>
      </div>
      <div style="display: flex; align-items: center; justify-content: space-between;">
        <span class="tnum" style="font-size: 20px; font-weight: 600; letter-spacing: -0.01em; color: ${C.ink};">00:42:18</span>
        <div style="width: 30px; height: 30px; border-radius: 50%; background: ${C.critSoft}; display: flex; align-items: center; justify-content: center;">${icon('stop', 14, C.critText)}</div>
      </div>
    </div>`
    : '';
  return `<aside style="width: 240px; flex-shrink: 0; background: ${C.plane}; border-right: 1px solid ${C.grid}; display: flex; flex-direction: column; gap: 18px; padding: 12px 10px 14px;">
    <div style="display: flex; align-items: center; gap: 10px; height: 36px; padding: 0 8px;">
      <img src="vena-isotipo.png" alt="Vena Digital" style="width: 24px; height: 24px; display: block;">
      <div style="flex-grow: 1; font-size: 14px; font-weight: 600; color: ${C.ink};">Vena OS</div>
      ${icon('chevUpDown', 14, C.ink3, 2)}
    </div>
    <div style="display: flex; flex-direction: column; gap: 2px;">
      <div style="display: flex; align-items: center; gap: 10px; height: 32px; padding: 0 10px; border-radius: 8px; font-size: 14px; font-weight: 500; color: ${C.navInk};">
        ${icon('search', 18, C.ink2)}
        <span style="flex-grow: 1;">Buscar</span>
        <span style="font-family: ${MONO}; font-size: 11px; color: ${C.ink3};">⌘K</span>
      </div>
      ${nav}
    </div>
    <div style="display: flex; flex-direction: column; gap: 2px;">
      <div style="font-size: 12px; font-weight: 600; color: ${C.ink3}; padding: 0 10px 6px;">Tableros recientes</div>
      ${recent}
    </div>
    <div style="flex-grow: 1;"></div>
    ${timerWidget}
    <div style="display: flex; flex-direction: column; gap: 2px;">
      ${navItem('sliders', 'Ajustes', false)}
      <div style="display: flex; align-items: center; gap: 10px; height: 36px; padding: 0 8px;">
        <div style="width: 24px; height: 24px; border-radius: 50%; background: #E3E1DA; display: flex; align-items: center; justify-content: center; font-size: 10.5px; font-weight: 700; color: ${C.ink2};">LS</div>
        <div style="font-size: 13.5px; font-weight: 500; color: ${C.navInk};">Laura Salazar</div>
      </div>
    </div>
  </aside>`;
}

export function desktop({ active, h, content, timer = true, gap = 28 }) {
  return `<div style="width: 1440px; min-height: ${h}px; display: flex; background: ${C.bg};">
  ${sidebar(active, { timer })}
  <main style="flex-grow: 1; min-width: 0; display: flex; flex-direction: column; gap: ${gap}px; padding: 40px 64px 56px;">
    ${content}
  </main>
</div>`;
}

// ---- mobile chrome ----
const TABS = [
  ['home', 'Inicio'],
  ['timer', 'Tiempo'],
  ['sparkle', 'Consumo IA'],
  ['shapes', 'Tableros'],
  ['note', 'Notas'],
];

export function tabBar(active) {
  const items = TABS.map(([ic, t]) => {
    const on = t === active;
    const col = on ? '{{accent}}' : '#8C8A84';
    return `<div style="flex-grow: 1; flex-basis: 0; display: flex; flex-direction: column; align-items: center; gap: 3px; padding-top: 7px; color: ${col};">
        ${icon(ic, 24, col, on ? 2 : 1.75)}
        <span style="font-size: 10px; font-weight: ${on ? 600 : 500};">${t}</span>
      </div>`;
  }).join('');
  return `<nav style="height: 83px; flex-shrink: 0; display: flex; align-items: flex-start; padding: 0 8px; background: #FFFFFF; border-top: 1px solid ${C.line};">${items}</nav>`;
}

export function mobile({ active, content, bg = C.plane, overlay = '' }) {
  return `<div style="width: 390px; height: 844px; display: flex; flex-direction: column; background: ${bg}; overflow: hidden; position: relative;">
  <div style="height: 54px; flex-shrink: 0;"></div>
  <div style="flex-grow: 1; min-height: 0; display: flex; flex-direction: column; gap: 12px; padding: 4px 16px 16px; overflow: hidden;">
    ${content}
  </div>
  ${overlay}
  ${tabBar(active)}
</div>`;
}

export function mobileTitle(title, { eyebrow = '', right = '' } = {}) {
  return `<div style="display: flex; align-items: flex-end; justify-content: space-between; gap: 12px; padding: 0 2px 4px;">
      <div style="display: flex; flex-direction: column; gap: 2px;">
        ${eyebrow ? `<div style="font-size: 13px; font-weight: 500; color: ${C.ink3};">${eyebrow}</div>` : ''}
        <h1 style="font-size: 34px; line-height: 40px; font-weight: 700; letter-spacing: -0.02em; color: ${C.ink};">${title}</h1>
      </div>
      <div style="display: flex; align-items: center; gap: 8px; padding-bottom: 4px;">${right}</div>
    </div>`;
}

export const roundBtn = (ic, { accent = false, size = 44 } = {}) =>
  accent
    ? `<div style="width: ${size}px; height: ${size}px; border-radius: 50%; background: {{accent}}; display: flex; align-items: center; justify-content: center;">${icon(ic, 18, '#FFFFFF', 2.2)}</div>`
    : `<div style="width: ${size}px; height: ${size}px; border-radius: 50%; background: ${C.fill2}; display: flex; align-items: center; justify-content: center;">${icon(ic, 18, C.ink2, 2)}</div>`;
