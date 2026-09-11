// Reusable pieces: post-it notes, board sketches, small charts.
import { C, S, HAND, icon, dot } from './shared.mjs';
import { TYPES } from './data.mjs';

// ---------- Notes (post-its) ----------
function pageSkeleton() {
  return `<div style="height: 88px; border-radius: 10px; background: #F4F3EF; padding: 12px 14px; display: flex; flex-direction: column; gap: 7px; overflow: hidden;">
        <div style="display: flex; gap: 5px;"><span style="width: 6px; height: 6px; border-radius: 50%; background: #D9D7D0;"></span><span style="width: 6px; height: 6px; border-radius: 50%; background: #D9D7D0;"></span><span style="width: 6px; height: 6px; border-radius: 50%; background: #D9D7D0;"></span></div>
        <div style="width: 62%; height: 9px; border-radius: 3px; background: #D9D7D0;"></div>
        <div style="width: 88%; height: 5px; border-radius: 3px; background: #E4E2DC;"></div>
        <div style="width: 76%; height: 5px; border-radius: 3px; background: #E4E2DC;"></div>
        <div style="width: 54%; height: 5px; border-radius: 3px; background: #E4E2DC;"></div>
      </div>`;
}

function swatchArt(colors) {
  const sw = colors
    .map((c) => `<div style="flex-grow: 1; flex-basis: 0; height: 100%; border-radius: 8px; background: ${c};"></div>`)
    .join('');
  return `<div style="height: 96px; display: flex; gap: 6px; padding: 8px; border-radius: 10px; background: #FFFFFF;">${sw}</div>`;
}

export function noteCard(n, { pad = '14px 16px' } = {}) {
  const t = TYPES[n.type];
  const border = n.type === 'link' ? C.line : 'rgba(31, 30, 28, 0.05)';
  const headRight = n.pinned ? icon('pin', 14, C.ink3) : '';
  const head = `<div style="display: flex; align-items: center; justify-content: space-between; gap: 8px;">
      <div style="display: flex; align-items: center; gap: 6px; font-size: 11.5px; font-weight: 600; color: ${C.ink2};">${dot(t.dot, 7)}<span>${t.label}</span></div>
      ${headRight}
    </div>`;
  let body;
  if (n.type === 'link') {
    body = `${n.preview === false ? '' : pageSkeleton()}
      <div style="display: flex; flex-direction: column; gap: 4px;">
        <div style="display: flex; align-items: center; gap: 6px; font-size: 12px; color: ${C.ink3};">${icon('link', 13, C.ink3, 2)}<span>${n.domain}</span></div>
        <div style="font-size: 14px; line-height: 19px; font-weight: 600; color: ${C.ink};">${n.title}</div>
        ${n.desc ? `<div style="font-size: 13px; line-height: 18px; color: ${C.ink2};">${n.desc}</div>` : ''}
      </div>`;
  } else if (n.swatches) {
    body = `${swatchArt(n.swatches)}<div style="font-size: 14px; line-height: 20px; color: ${C.ink};">${n.text}</div>`;
  } else if (n.quote) {
    body = `<div style="font-size: 21px; line-height: 26px; font-weight: 700; letter-spacing: -0.015em; color: ${C.ink}; text-wrap: balance;">${n.text}</div>`;
  } else {
    body = `<div style="font-size: 14px; line-height: 20px; color: ${C.ink}; text-wrap: pretty;">${n.text}</div>`;
  }
  const done = n.type === 'hacer' ? icon('circle', 16, C.ink4, 1.6) : '';
  const foot = `<div style="display: flex; align-items: center; justify-content: space-between; gap: 8px; font-size: 12px; color: ${C.ink3};"><span>${n.meta}</span>${done}</div>`;
  return `<div style="background: ${t.tint}; border: 1px solid ${border}; border-radius: 14px; padding: ${pad}; display: flex; flex-direction: column; gap: 10px;">${head}${body}${foot}</div>`;
}

export const NOTES_PINNED = [
  { type: 'hacer', text: 'Grabar la clase 5 de Academia IA antes del martes.', meta: 'Para el martes 15', pinned: true },
  { type: 'investigar', text: '¿Cuánto cuesta gpt-5.6-sol en la API? Lo necesito para Consumo IA.', meta: 'Ayer', pinned: true },
  { type: 'nota', text: '“Primero ordenas. Luego automatizas.” Frase para el carrusel del lunes.', meta: '9 sep', pinned: true },
];

export const NOTES_RECENT = {
  supabase: { type: 'link', domain: 'supabase.com', title: 'Row Level Security', desc: 'Políticas para que cada fila solo la vea su dueña.', meta: 'Ayer' },
  facturas: { type: 'hacer', text: 'Enviar las facturas de agosto a los clientes.', meta: 'Ayer' },
  paleta: { type: 'inspiracion', text: 'Paleta cálida para la landing de Academia.', swatches: ['#F3D9B1', '#E9A77C', '#C8664B', '#6E4B3A', '#F6F1E7'], meta: '8 sep' },
  excalidraw: { type: 'investigar', text: 'Excalidraw: ¿exportToBlob sirve para las miniaturas de los tableros?', meta: '8 sep' },
  episodio: { type: 'nota', text: 'Episodio del podcast: cómo organizo mi semana con IA sin volverme loca.', meta: '7 sep' },
  github: { type: 'link', domain: 'github.com', title: 'excalidraw/excalidraw', desc: 'Pizarra open source (MIT) para embeber en el módulo Tableros.', meta: '6 sep', preview: false },
  metricas: { type: 'hacer', text: 'Revisar métricas de Instagram de agosto.', meta: '5 sep' },
  caos: { type: 'inspiracion', text: 'Menos caos, más sistema.', quote: true, meta: '4 sep' },
  push: { type: 'investigar', text: 'Push en PWA de iOS: ¿qué tan confiables son los avisos?', meta: '3 sep' },
  hig: { type: 'link', domain: 'developer.apple.com', title: 'Human Interface Guidelines', desc: 'Referencia de estilo para el OS.', meta: '2 sep', preview: false },
};

// ---------- Board sketches ----------
const INK = '#3D3C39';
const T = { blue: '#EAF2FB', green: '#E9F5EE', yellow: '#FDF4D3', rose: '#FBEEF3', white: '#FFFFFF' };

function box(x, y, w, h, fill, text, size = 16) {
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="8" fill="${fill}" stroke="${INK}" stroke-width="1.6"></rect>${
    text ? `<text x="${x + w / 2}" y="${y + h / 2 + size * 0.33}" text-anchor="middle" font-family="${HAND}" font-size="${size}" fill="${C.ink}">${text}</text>` : ''
  }`;
}
function arrow(x1, y1, x2, y2) {
  const a = Math.atan2(y2 - y1, x2 - x1);
  const l = 7;
  const p1 = [x2 - l * Math.cos(a - 0.45), y2 - l * Math.sin(a - 0.45)];
  const p2 = [x2 - l * Math.cos(a + 0.45), y2 - l * Math.sin(a + 0.45)];
  return `<path d="M${x1} ${y1} L${x2} ${y2} M${p1[0].toFixed(1)} ${p1[1].toFixed(1)} L${x2} ${y2} L${p2[0].toFixed(1)} ${p2[1].toFixed(1)}" fill="none" stroke="${INK}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"></path>`;
}
function hand(x, y, text, size = 16, anchor = 'start', fill = C.ink) {
  return `<text x="${x}" y="${y}" text-anchor="${anchor}" font-family="${HAND}" font-size="${size}" fill="${fill}">${text}</text>`;
}

const SKETCH = {
  arch: (L) =>
    `${L ? hand(22, 34, 'Arquitectura v1', 19) : ''}
    ${box(22, 78, 72, 44, T.white, L && 'Mac')}
    ${box(136, 72, 84, 56, T.green, L && 'Supabase')}
    ${box(258, 36, 66, 40, T.blue, L && 'App web')}
    ${box(258, 124, 66, 40, T.blue, L && 'iPhone')}
    ${arrow(96, 100, 132, 100)}
    ${arrow(256, 58, 224, 84)}
    ${arrow(256, 142, 224, 116)}`,
  funnel: (L) => {
    const lv = [
      [30, 250, 214, T.blue, 'Contenido'],
      [72, 210, 172, T.green, 'Lead magnet'],
      [114, 170, 132, T.yellow, 'Masterclass'],
      [156, 130, 96, T.rose, 'Academia'],
    ];
    return lv
      .map(([y, top, bot, fill, t]) => {
        const h = 36;
        return `<path d="M${172 - top / 2} ${y} H${172 + top / 2} L${172 + bot / 2} ${y + h} H${172 - bot / 2} Z" fill="${fill}" stroke="${INK}" stroke-width="1.6" stroke-linejoin="round"></path>${L ? hand(172, y + 24, t, 16, 'middle') : ''}`;
      })
      .join('');
  },
  calendar: (L) => {
    let out = '';
    const days = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
    const stick = { '0-1': T.yellow, '1-3': T.blue, '2-0': T.rose, '3-2': T.green, '4-1': T.yellow, '5-0': T.blue, '6-2': T.rose, '2-2': T.yellow };
    for (let c = 0; c < 7; c++) {
      const x = 22 + c * 44;
      if (L) out += hand(x + 20, 30, days[c], 15, 'middle', C.ink2);
      for (let r = 0; r < 3; r++) {
        const y = 40 + r * 48;
        out += `<rect x="${x}" y="${y}" width="40" height="44" rx="5" fill="#FFFFFF" stroke="#CFCDC6" stroke-width="1.2"></rect>`;
        const f = stick[`${c}-${r}`];
        if (f) out += `<rect x="${x + 5}" y="${y + 8}" width="30" height="22" rx="4" fill="${f}" stroke="${INK}" stroke-width="1.2"></rect>`;
      }
    }
    return out;
  },
  flow: (L) => {
    const xs = [20, 106, 192, 278];
    const fills = [T.white, T.blue, T.green, T.yellow];
    const names = ['Form', 'CRM', 'Email', 'Slack'];
    let out = '';
    xs.forEach((x, i) => {
      out += `<rect x="${x}" y="70" width="48" height="48" rx="12" fill="${fills[i]}" stroke="${INK}" stroke-width="1.6"></rect><circle cx="${x + 24}" cy="94" r="6" fill="none" stroke="${INK}" stroke-width="1.4"></circle>`;
      if (L) out += hand(x + 24, 144, names[i], 15, 'middle');
      if (i < 3) out += arrow(x + 52, 94, xs[i + 1] - 4, 94);
    });
    if (L) out += hand(20, 40, 'Onboarding clientes', 18);
    return out;
  },
  mindmap: (L) => {
    const br = [
      [66, 46, 'Invitados'], [58, 156, 'Guion'], [284, 40, 'Formato'], [300, 108, 'Clips'], [262, 168, 'Fechas'],
    ];
    let out = '';
    br.forEach(([x, y, t]) => {
      const mx = (172 + x) / 2;
      out += `<path d="M172 100 Q${mx} ${y} ${x} ${y}" fill="none" stroke="${INK}" stroke-width="1.4" stroke-linecap="round"></path><circle cx="${x}" cy="${y}" r="4" fill="${INK}"></circle>`;
      if (L) out += hand(x + (x < 172 ? -8 : 8), y - 8, t, 15, x < 172 ? 'end' : 'start');
    });
    out += `<ellipse cx="172" cy="100" rx="46" ry="27" fill="${T.yellow}" stroke="${INK}" stroke-width="1.6"></ellipse>`;
    if (L) out += hand(172, 108, 'Podcast T2', 18, 'middle');
    return out;
  },
  loose: (L) =>
    `<g transform="rotate(-4 77 68)"><rect x="34" y="36" width="86" height="64" rx="4" fill="${T.yellow}" stroke="${INK}" stroke-width="1.4"></rect>${L ? hand(77, 74, '¿y si…?', 17, 'middle') : ''}</g>
    <g transform="rotate(3 183 92)"><rect x="140" y="60" width="86" height="64" rx="4" fill="${T.blue}" stroke="${INK}" stroke-width="1.4"></rect>${L ? hand(183, 98, 'probar', 17, 'middle') : ''}</g>
    <g transform="rotate(-2 284 60)"><rect x="246" y="30" width="76" height="60" rx="4" fill="${T.rose}" stroke="${INK}" stroke-width="1.4"></rect>${L ? hand(284, 66, 'idea', 17, 'middle') : ''}</g>
    <path d="M70 150 c 12 -14 36 -14 46 0 c 8 12 -8 26 -24 24 c -18 -2 -30 -12 -22 -24" fill="none" stroke="${INK}" stroke-width="1.4" stroke-linecap="round"></path>
    <path d="M150 164 c 20 10 44 -6 64 -2 c 14 3 22 -8 34 -20" fill="none" stroke="${INK}" stroke-width="1.4" stroke-linecap="round"></path>
    ${arrow(240, 150, 250, 140)}`,
};

export function sketch(kind, { labels = true, w = '100%', h = '100%' } = {}) {
  return `<svg viewBox="0 0 344 200" width="${w}" height="${h}" preserveAspectRatio="xMidYMid meet" style="display: block;">${SKETCH[kind](labels)}</svg>`;
}

// Dotted whiteboard background for thumbnails / canvas.
export const DOTS = `background-color: #FCFCFB; background-image: radial-gradient(circle, #D3D1CA 1.1px, transparent 1.4px); background-size: 20px 20px;`;

// ---------- Small charts ----------
// 100% share bar; left end square (baseline), right end rounded (data end).
export function shareBar(items, h = 10) {
  return `<div style="display: flex; gap: 2px; height: ${h}px; width: 100%;">${items
    .map(
      (it, i) =>
        `<div style="flex-grow: ${it.v}; flex-basis: 0; background: ${it.color};${i === items.length - 1 ? ' border-radius: 0 4px 4px 0;' : ''}"></div>`,
    )
    .join('')}</div>`;
}

// Sparkline columns; last column = current period in accent.
export function sparkColumns(values, { h = 36, bw = 10, gap = 4 } = {}) {
  const max = Math.max(...values);
  return `<div style="display: flex; align-items: flex-end; gap: ${gap}px; height: ${h}px;">${values
    .map((v, i) => {
      const hh = Math.max(2, Math.round((v / max) * h));
      const col = i === values.length - 1 ? '{{accent}}' : C.spark;
      return `<div style="width: ${bw}px; height: ${hh}px; background: ${col}; border-radius: 2px 2px 0 0;"></div>`;
    })
    .join('')}</div>`;
}
