// Writes the canvas working files (artboards + canvas.json) into design/canvas/.
// Run: node design/build/index.mjs
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { home, tiempo, consumo, tableros, tableroEditor, notas } from './screens-desktop.mjs';
import { inicioMovil, tiempoMovil, notasMovil } from './screens-mobile.mjs';

const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'canvas');
mkdirSync(out, { recursive: true });

const ROW2 = 1680;
const ROW3 = 3040;
const layout = [
  ['Main.dc.html', 'Inicio', home(), 0, 0],
  ['Tiempo.dc.html', 'Tiempo', tiempo(), 1560, 0],
  ['ConsumoIA.dc.html', 'Consumo IA', consumo(), 3120, 0],
  ['Tableros.dc.html', 'Tableros', tableros(), 0, ROW2],
  ['TableroAbierto.dc.html', 'Tablero abierto', tableroEditor(), 1560, ROW2],
  ['Notas.dc.html', 'Notas', notas(), 3120, ROW2],
  ['InicioMovil.dc.html', 'Inicio · móvil', inicioMovil(), 0, ROW3],
  ['TiempoMovil.dc.html', 'Tiempo · móvil', tiempoMovil(), 470, ROW3],
  ['NotasMovil.dc.html', 'Notas · móvil', notasMovil(), 940, ROW3],
];

const artboards = layout.map(([file, title, s, x, y]) => {
  writeFileSync(join(out, file), s.html);
  return { file, title, x, y, w: s.w, h: s.h };
});

const annotations = [
  {
    id: 'direccion',
    x: 0,
    y: 960,
    w: 600,
    text:
      'Dirección visual: neutra, entre Notion y Apple. Fuente del sistema (SF Pro), grises cálidos y un solo color de acento. Vena Digital aparece solo en el logo.\n' +
      'El chip «accent» encima de cada pantalla prueba otros acentos: azul, grafito, coral o verde.\n' +
      'Todos los datos son de ejemplo.',
  },
  {
    id: 'tiempo',
    x: 1560,
    y: 1330,
    w: 600,
    text:
      'Tiempo: las tareas viven dentro de proyectos y el dashboard suma el tiempo por proyecto (con filtro por proyecto). Un solo cronómetro activo a la vez: si inicias otra tarea, la que estaba en curso se detiene sola. El timer vive en la base de datos: lo arrancas en el Mac y lo detienes en el celular.',
  },
  {
    id: 'consumo',
    x: 4640,
    y: 0,
    w: 380,
    text:
      'Consumo IA: Claude Code y Codex con tokens exactos. Un colector local en tu Mac lee los logs y sube los totales a Supabase.\n' +
      'Tres cuentas: Claude Max 5x (personal), Claude Pro (Vena Digital) y ChatGPT Plus. Cada una se compara con lo que pagas por ella. El colector asigna el consumo de Claude Code a la cuenta que tiene la sesión activa.\n' +
      'Los precios son editables. Un modelo sin precio queda marcado y no suma; nunca aparece como $0.',
  },
  {
    id: 'tablero',
    x: 1560,
    y: ROW2 + 900 + 90,
    w: 620,
    text:
      'Tablero abierto: el lienzo y las herramientas de dibujo serán el componente Excalidraw embebido (open source, con sus funciones gratuitas). Lo que se diseña aquí es todo lo que lo rodea: la galería de tableros, el nombre, el guardado automático y exportar.',
  },
  {
    id: 'movil',
    x: 1420,
    y: ROW3,
    w: 420,
    text:
      'Móvil: una barra inferior con los 5 módulos. En las pantallas que no muestran el timer (como Notas), el timer activo flota sobre la barra como un mini reproductor, para que lo detengas sin cambiar de módulo.',
  },
];

const canvas = { artboards, annotations, launch: { view: 'canvas' } };
writeFileSync(join(out, 'canvas.json'), JSON.stringify(canvas, null, 2));
console.log(`wrote ${artboards.length} artboards + canvas.json to ${out}`);
