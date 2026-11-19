// The laser in the bar, with a real pointer: it draws a red dot and a trail that fades, adds no
// marks, hides the cursor only once it moves, answers to P, and leaves nothing behind.
// Needs Chromium on port 9333 with the extension loaded and ./paginas on 127.0.0.1:8765.
//
//   node pruebas/laser.mjs
import { writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

const { cdp, sleep } = await import(path.join(homedir(), '.claude/skills/chrome-extensions/scripts/cdp-lib.mjs'));

const EXT = 'kcnicbloecgnkjjahlfkhokliigkaflh';
const OUT = path.join(import.meta.dirname, 'resultados');
const c = cdp(Number(process.env.PORT ?? 9333));
const ROOT = `document.querySelector('vena-overlay').shadowRoot`;
const checks = {};
const check = (name, ok, detail) => {
  checks[name] = { ok: Boolean(ok), detail };
  console.log(`${ok ? '✓' : '✗'} ${name}${detail === undefined ? '' : ` (${JSON.stringify(detail)})`}`);
};

const page = await c.newTab('http://127.0.0.1:8765/largo.html');
await c.activate(page.id);
await page.send('Page.bringToFront').catch(() => undefined);
await sleep(1200);
await c.evalInServiceWorker(`chrome.tabs.query({ active: true }).then(([t]) => toggleOverlay(t))`, EXT);
await sleep(600);

const mouse = (type, x, y, buttons = 0) => page.send('Input.dispatchMouseEvent', { type, x, y, button: buttons ? 'left' : 'none', buttons, pointerType: 'mouse' });
const key = async (k) => {
  await page.send('Input.dispatchKeyEvent', { type: 'keyDown', key: k, code: `Key${k.toUpperCase()}`, text: k });
  await page.send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code: `Key${k.toUpperCase()}` });
};
const state = () =>
  page.eval(`(() => {
    const r = ${ROOT};
    const s = r.querySelector('.surface');
    const cv = r.querySelector('.laser-canvas');
    let red = 0;
    if (cv && cv.width) {
      const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
      for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 200 && d[i] > 200 && d[i + 1] < 90) red++;
    }
    const pressed = [...r.querySelectorAll('.tools button[aria-pressed="true"]')].map((b) => b.getAttribute('aria-label'));
    return { canvas: Boolean(cv), red, cursor: getComputedStyle(s).cursor, marks: r.querySelector('svg.marks > g > g').children.length, pressed, styles: r.querySelector('.styles') !== null };
  })()`);

const button = await page.eval(`[...${ROOT}.querySelectorAll('button')].map((b) => b.getAttribute('aria-label')).find((l) => l.startsWith('Puntero láser'))`);
check('el botón está en la barra', button === 'Puntero láser · P', button);

await page.eval(`[...${ROOT}.querySelectorAll('button')].find((b) => b.getAttribute('aria-label').startsWith('Puntero láser')).click()`);
await sleep(150);
let s = await state();
check('al elegirlo aparece su lienzo y no hay barra de estilos', s.canvas && !s.styles && s.pressed[0]?.startsWith('Puntero láser'), s);
check('el cursor sigue visible hasta que se mueve', s.cursor === 'default', s.cursor);

for (let i = 0; i <= 24; i++) {
  await mouse('mouseMoved', 200 + i * 18, 300 + Math.sin(i / 3) * 60);
  await sleep(12);
}
await sleep(30);
s = await state();
check('al moverse dibuja el punto rojo con su estela', s.red > 150, s.red);
check('y esconde el cursor', s.cursor === 'none', s.cursor);
const { data } = await page.send('Page.captureScreenshot', { format: 'png' });
writeFileSync(path.join(OUT, 'laser.png'), Buffer.from(data, 'base64'));

// A click with the laser is not a mark.
await mouse('mousePressed', 600, 320, 1);
await mouse('mouseMoved', 680, 380, 1);
await mouse('mouseReleased', 680, 380);
await sleep(80);
s = await state();
check('hacer clic o arrastrar no deja trazos', s.marks === 0, s.marks);

// Resting, the trail fades and only the dot stays.
await sleep(500);
const resting = (await state()).red;
check('quieto, la estela se va y queda solo el punto', resting > 0 && resting < s.red, { resting, moving: s.red });

// Leaving the page takes the dot away too.
await page.eval(`${ROOT}.querySelector('.surface').dispatchEvent(new PointerEvent('pointerleave'))`);
await sleep(450);
check('al salir del área el punto se apaga', (await state()).red === 0, (await state()).red);

await key('l');
await sleep(100);
s = await state();
check('otra herramienta quita el lienzo y devuelve el cursor', !s.canvas && s.cursor === 'crosshair', s);

await key('p');
await sleep(100);
s = await state();
check('la tecla P lo vuelve a elegir', s.canvas && s.pressed[0]?.startsWith('Puntero láser'), s.pressed);

await page.eval(`[...${ROOT}.querySelectorAll('button')].find((b) => b.getAttribute('aria-label') === 'Cerrar').click()`);
await sleep(150);
check('al cerrar la barra no queda nada', await page.eval(`!document.querySelector('vena-overlay')`));

writeFileSync(path.join(OUT, 'laser.json'), JSON.stringify(checks, null, 2));
await c.closeTab(page.id);
const failed = Object.values(checks).filter((x) => !x.ok).length;
console.log(failed ? `${failed} fallaron` : 'Todo bien');
process.exit(failed ? 1 : 0);
