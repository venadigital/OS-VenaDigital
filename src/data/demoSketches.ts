// Hand-drawn style SVG thumbnails for the demo boards (mirrors the design mockups).
const INK = '#3D3C39';
const HAND = "'Caveat', 'Bradley Hand', 'Comic Sans MS', cursive";
const T = { blue: '#EAF2FB', green: '#E9F5EE', yellow: '#FDF4D3', rose: '#FBEEF3', white: '#FFFFFF' };

const text = (x: number, y: number, t: string, size = 16, anchor = 'middle', fill = '#1F1E1C') =>
  `<text x="${x}" y="${y}" text-anchor="${anchor}" font-family="${HAND}" font-size="${size}" fill="${fill}">${t}</text>`;

const box = (x: number, y: number, w: number, h: number, fill: string, label?: string, size = 16) =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="8" fill="${fill}" stroke="${INK}" stroke-width="1.6"/>` +
  (label ? text(x + w / 2, y + h / 2 + size * 0.33, label, size) : '');

function arrow(x1: number, y1: number, x2: number, y2: number) {
  const a = Math.atan2(y2 - y1, x2 - x1);
  const l = 7;
  const p1 = [x2 - l * Math.cos(a - 0.45), y2 - l * Math.sin(a - 0.45)];
  const p2 = [x2 - l * Math.cos(a + 0.45), y2 - l * Math.sin(a + 0.45)];
  return `<path d="M${x1} ${y1} L${x2} ${y2} M${p1[0].toFixed(1)} ${p1[1].toFixed(1)} L${x2} ${y2} L${p2[0].toFixed(1)} ${p2[1].toFixed(1)}" fill="none" stroke="${INK}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>`;
}

const SKETCHES: Record<string, () => string> = {
  arch: () =>
    text(22, 34, 'Arquitectura v1', 19, 'start') +
    box(22, 78, 72, 44, T.white, 'Mac') +
    box(136, 72, 84, 56, T.green, 'Supabase') +
    box(258, 36, 66, 40, T.blue, 'App web') +
    box(258, 124, 66, 40, T.blue, 'iPhone') +
    arrow(96, 100, 132, 100) +
    arrow(256, 58, 224, 84) +
    arrow(256, 142, 224, 116),
  funnel: () =>
    (
      [
        [30, 250, 214, T.blue, 'Contenido'],
        [72, 210, 172, T.green, 'Lead magnet'],
        [114, 170, 132, T.yellow, 'Masterclass'],
        [156, 130, 96, T.rose, 'Academia'],
      ] as const
    )
      .map(
        ([y, top, bot, fill, t]) =>
          `<path d="M${172 - top / 2} ${y} H${172 + top / 2} L${172 + bot / 2} ${y + 36} H${172 - bot / 2} Z" fill="${fill}" stroke="${INK}" stroke-width="1.6" stroke-linejoin="round"/>` +
          text(172, y + 24, t),
      )
      .join(''),
  calendar: () => {
    let out = '';
    const days = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
    const stick: Record<string, string> = { '0-1': T.yellow, '1-3': T.blue, '2-0': T.rose, '3-2': T.green, '4-1': T.yellow, '5-0': T.blue, '6-2': T.rose, '2-2': T.yellow };
    for (let c = 0; c < 7; c++) {
      const x = 22 + c * 44;
      out += text(x + 20, 30, days[c], 15, 'middle', '#52514E');
      for (let r = 0; r < 3; r++) {
        const y = 40 + r * 48;
        out += `<rect x="${x}" y="${y}" width="40" height="44" rx="5" fill="#FFFFFF" stroke="#CFCDC6" stroke-width="1.2"/>`;
        const f = stick[`${c}-${r}`];
        if (f) out += `<rect x="${x + 5}" y="${y + 8}" width="30" height="22" rx="4" fill="${f}" stroke="${INK}" stroke-width="1.2"/>`;
      }
    }
    return out;
  },
  flow: () => {
    const xs = [20, 106, 192, 278];
    const fills = [T.white, T.blue, T.green, T.yellow];
    const names = ['Form', 'CRM', 'Email', 'Slack'];
    let out = text(20, 40, 'Onboarding clientes', 18, 'start');
    xs.forEach((x, i) => {
      out += `<rect x="${x}" y="70" width="48" height="48" rx="12" fill="${fills[i]}" stroke="${INK}" stroke-width="1.6"/><circle cx="${x + 24}" cy="94" r="6" fill="none" stroke="${INK}" stroke-width="1.4"/>`;
      out += text(x + 24, 144, names[i], 15);
      if (i < 3) out += arrow(x + 52, 94, xs[i + 1] - 4, 94);
    });
    return out;
  },
  mindmap: () => {
    const br: [number, number, string][] = [
      [66, 46, 'Invitados'],
      [58, 156, 'Guion'],
      [284, 40, 'Formato'],
      [300, 108, 'Clips'],
      [262, 168, 'Fechas'],
    ];
    let out = '';
    for (const [x, y, t] of br) {
      out += `<path d="M172 100 Q${(172 + x) / 2} ${y} ${x} ${y}" fill="none" stroke="${INK}" stroke-width="1.4" stroke-linecap="round"/><circle cx="${x}" cy="${y}" r="4" fill="${INK}"/>`;
      out += text(x + (x < 172 ? -8 : 8), y - 8, t, 15, x < 172 ? 'end' : 'start');
    }
    return out + `<ellipse cx="172" cy="100" rx="46" ry="27" fill="${T.yellow}" stroke="${INK}" stroke-width="1.6"/>` + text(172, 108, 'Podcast T2', 18);
  },
  loose: () =>
    `<g transform="rotate(-4 77 68)"><rect x="34" y="36" width="86" height="64" rx="4" fill="${T.yellow}" stroke="${INK}" stroke-width="1.4"/>${text(77, 74, '¿y si…?', 17)}</g>` +
    `<g transform="rotate(3 183 92)"><rect x="140" y="60" width="86" height="64" rx="4" fill="${T.blue}" stroke="${INK}" stroke-width="1.4"/>${text(183, 98, 'probar', 17)}</g>` +
    `<g transform="rotate(-2 284 60)"><rect x="246" y="30" width="76" height="60" rx="4" fill="${T.rose}" stroke="${INK}" stroke-width="1.4"/>${text(284, 66, 'idea', 17)}</g>` +
    `<path d="M70 150 c 12 -14 36 -14 46 0 c 8 12 -8 26 -24 24 c -18 -2 -30 -12 -22 -24" fill="none" stroke="${INK}" stroke-width="1.4" stroke-linecap="round"/>` +
    `<path d="M150 164 c 20 10 44 -6 64 -2 c 14 3 22 -8 34 -20" fill="none" stroke="${INK}" stroke-width="1.4" stroke-linecap="round"/>` +
    arrow(240, 150, 250, 140),
};

export function sketchDataUrl(kind: keyof typeof SKETCHES | string): string {
  const body = (SKETCHES[kind] ?? SKETCHES.loose)();
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 344 200" width="688" height="400"><rect width="344" height="200" fill="#FCFCFB"/>${body}</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
