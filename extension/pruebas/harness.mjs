// Runs the extension's real flow in a headless Chromium: the bar on real pages, drawing with the
// pointer, captures, and the OS (in demo mode) storing them. It needs:
//   - Chromium on port 9333 with the extension loaded, ideally with --force-device-scale-factor=2
//   - the pages of ./paginas on 127.0.0.1:8765 and 8766 (artifact.html opens localhost:8766, another origin)
//   - the OS dev server on localhost:5183
//
//   node pruebas/harness.mjs [escenarios...]   (sin argumentos: todos)
import { mkdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

const { cdp, Session, sleep } = await import(path.join(homedir(), '.claude/skills/chrome-extensions/scripts/cdp-lib.mjs'));

const EXT = 'kcnicbloecgnkjjahlfkhokliigkaflh';
const PAGES = 'http://127.0.0.1:8765';
const OS = 'http://localhost:5183/';
const OUT = path.join(import.meta.dirname, 'resultados');
mkdirSync(OUT, { recursive: true });
const c = cdp(Number(process.env.PORT ?? 9333));
const results = {};

const sw = (expr) => c.evalInServiceWorker(expr, EXT);

async function waitFor(what, test, ms = 150_000) {
  const end = Date.now() + ms;
  for (;;) {
    const value = await test();
    if (value) return value;
    if (Date.now() > end) throw new Error(`Tiempo agotado esperando: ${what}`);
    await sleep(200);
  }
}

// ---------- Tabs ----------
const open = async (url) => {
  const page = await c.newTab(url);
  await c.activate(page.id);
  await page.send('Page.bringToFront').catch(() => undefined);
  await sleep(1200);
  return page;
};
const osTab = async () => (await c.targets()).find((t) => t.type === 'page' && t.url.startsWith(OS));
/** Each scenario starts alone: no OS tab of the previous one can be mistaken for its own. */
async function cleanTabs() {
  const blank = await c.newTab('about:blank');
  for (const t of (await c.targets()).filter((x) => x.type === 'page' && x.id !== blank.id)) await c.closeTab(t.id);
  await sleep(300);
}
/** The icon can't be pressed from here: this is what its click runs. */
const pressIcon = () => sw(`chrome.tabs.query({ active: true }).then(([t]) => toggleOverlay(t))`);

// ---------- The bar, from the frame it lives in ----------
const ROOT = `document.querySelector('vena-overlay')?.shadowRoot`;
const hasBar = (s) => s.eval(`Boolean(${ROOT})`);
const clickButton = (s, label) => s.eval(`[...${ROOT}.querySelectorAll('button')].find((b) => b.getAttribute('aria-label').startsWith(${JSON.stringify(label)})).click()`);
const markCount = (s) => s.eval(`${ROOT}.querySelector('svg.marks > g > g').children.length`);
const toast = (s) => s.eval(`(() => { const t = ${ROOT}.querySelector('.toast'); return t.hidden || t.classList.contains('hidden') ? '' : t.textContent; })()`);
const dockVisible = (s) => s.eval(`!${ROOT}.querySelector('.dock').classList.contains('hidden')`);

async function frameSession(urlPart) {
  const t = await waitFor('el marco', async () => (await c.targets()).find((x) => x.type === 'iframe' && x.url.includes(urlPart)), 8000);
  const s = new Session(t.webSocketDebuggerUrl);
  await s.open;
  return s;
}

// ---------- A real pointer ----------
const mouse = (page, type, x, y, buttons = 1) => page.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', buttons, clickCount: 1, pointerType: 'mouse' });
async function drag(page, [x0, y0], [x1, y1], steps = 8) {
  await mouse(page, 'mouseMoved', x0, y0, 0);
  await mouse(page, 'mousePressed', x0, y0);
  for (let i = 1; i <= steps; i++) await mouse(page, 'mouseMoved', x0 + ((x1 - x0) * i) / steps, y0 + ((y1 - y0) * i) / steps);
  await mouse(page, 'mouseReleased', x1, y1, 0);
  await sleep(120);
}
async function clickAt(page, x, y) {
  await mouse(page, 'mousePressed', x, y);
  await mouse(page, 'mouseReleased', x, y, 0);
  await sleep(120);
}
const typeText = (page, text) => page.send('Input.insertText', { text });
const pressKey = (page, key, code = key, keyCode = 0) =>
  page.send('Input.dispatchKeyEvent', { type: 'keyDown', key, code, windowsVirtualKeyCode: keyCode }).then(() => page.send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: keyCode }));

// ---------- What the OS stored ----------
/**
 * Opens the capture in the OS and measures it: runs of dark rows at the right edge. A black block
 * is a long run; the 2 px border of each row of the test pages gives the spacing, so a stretch
 * that doesn't line up with the next one shows as an uneven gap.
 */
async function stored(label) {
  const t = await waitFor('la pestaña del OS', osTab, 180_000);
  const os = await c.page((x) => x.id === t.id);
  await waitFor('la biblioteca de capturas', () => os.eval(`location.search.includes('vista=capturas') && !!document.querySelector('article button')`), 90_000);
  await os.eval(`document.querySelector('article button').click()`);
  await waitFor('la imagen', () => os.eval(`!!document.querySelector('.doc-capture-view img')?.naturalWidth`), 15_000);
  const image = await os.eval(`(async () => {
    const img = document.querySelector('.doc-capture-view img');
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0);
    const column = ctx.getImageData(Math.round(img.naturalWidth * 0.95), 0, 1, img.naturalHeight).data;
    const runs = [];
    let run = 0;
    for (let y = 0; y <= img.naturalHeight; y++) {
      const dark = y < img.naturalHeight && column[y * 4] + column[y * 4 + 1] + column[y * 4 + 2] < 60;
      if (dark) run += 1;
      else if (run) { runs.push([y - run, run]); run = 0; }
    }
    const blob = await (await fetch(img.src)).blob();
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let raw = '';
    for (let i = 0; i < bytes.length; i += 0x8000) raw += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return { width: img.naturalWidth, height: img.naturalHeight, type: blob.type, data: btoa(raw), name: document.querySelector('dialog[open] h2').textContent, runs };
  })()`);
  const { data, runs, ...rest } = image;
  if (label) writeFileSync(path.join(OUT, `${label}.${image.type === 'image/jpeg' ? 'jpg' : 'png'}`), Buffer.from(data, 'base64'));
  const longest = Math.max(0, ...runs.map((r) => r[1]));
  const gaps = runs.slice(1).map((r, i) => r[0] - runs[i][0]);
  return { ...rest, longestDark: longest, gapsMin: gaps.length ? Math.min(...gaps) : 0, gapsMax: gaps.length ? Math.max(...gaps) : 0, darkRows: runs.length };
}
/** Rows of the test pages are evenly spaced, so the stitching is too if the gaps are equal. */
const evenRows = (m) => m.longestDark < 20 && m.gapsMax - m.gapsMin <= 3;

async function drawSomething(page, y = 200) {
  await drag(page, [760, y], [1000, y + 60]); // the pen, away from the column that gets measured
}

const scenarios = {
  async herramientas() {
    const page = await open(`${PAGES}/largo.html`);
    await pressIcon();
    await waitFor('la barra', () => hasBar(page), 5000);
    await page.eval(`scrollTo({ top: 0, behavior: 'instant' })`);
    const seen = {};
    await drag(page, [200, 200], [500, 260]);
    seen.lapiz = await markCount(page);
    await clickButton(page, 'Resaltador');
    await drag(page, [200, 300], [500, 300]);
    seen.resaltador = await markCount(page);
    await clickButton(page, 'Formas');
    await clickButton(page, 'Flecha');
    await drag(page, [600, 200], [800, 320]);
    seen.flecha = await markCount(page);
    await clickButton(page, 'Texto');
    await clickAt(page, 300, 420);
    await typeText(page, 'Hola ñandú');
    await clickAt(page, 700, 500); // closes the box
    seen.texto = await markCount(page);
    const text = await page.eval(`${ROOT}.querySelector('svg.marks text')?.textContent`);
    await page.eval(`${ROOT}.querySelector('button[aria-label="Deshacer"]').click()`);
    seen.deshacer = await markCount(page);
    await page.eval(`${ROOT}.querySelector('button[aria-label="Rehacer"]').click()`);
    seen.rehacer = await markCount(page);
    await clickButton(page, 'Borrador');
    await drag(page, [340, 180], [340, 280]); // across the pen stroke
    seen.borrador = await markCount(page);
    await page.eval(`scrollTo({ top: 300, behavior: 'instant' })`);
    await sleep(150);
    const moved = await page.eval(`${ROOT}.querySelector('svg.marks > g').getAttribute('transform')`);
    await clickButton(page, 'Usar la página');
    const passes = await page.eval(`getComputedStyle(${ROOT}.querySelector('.surface')).pointerEvents`);
    const ok = seen.lapiz === 1 && seen.resaltador === 2 && seen.flecha === 3 && seen.texto === 4 && text === 'Hola ñandú' && seen.deshacer === 3 && seen.rehacer === 4 && seen.borrador === 3 && moved === 'translate(0 -300)' && passes === 'none';
    return { seen, text, moved, passes, ok };
  },

  async recuadro() {
    const page = await open(`${PAGES}/largo.html`);
    await pressIcon();
    await waitFor('la barra', () => hasBar(page), 5000);
    await drag(page, [150, 300], [450, 360]);
    await clickButton(page, 'Captura');
    await drag(page, [100, 250], [600, 450]);
    const seen = await stored('recuadro');
    return { seen, ok: Math.abs(seen.width / seen.height - 500 / 200) < 0.05 && seen.width >= 500 };
  },

  async pantalla() {
    const page = await open(`${PAGES}/largo.html`);
    await pressIcon();
    await waitFor('la barra', () => hasBar(page), 5000);
    await drawSomething(page);
    await clickButton(page, 'Captura');
    await clickButton(page, 'Capturar la pantalla');
    const seen = await stored('pantalla');
    const back = await dockVisible(page);
    return { seen, dockBack: back, ok: seen.height < seen.width && back };
  },

  async completa() {
    const page = await open(`${PAGES}/largo.html`);
    await pressIcon();
    await waitFor('la barra', () => hasBar(page), 5000);
    await drawSomething(page);
    await page.eval(`scrollTo({ top: 2000, behavior: 'instant' })`);
    await sleep(200);
    await drawSomething(page, 300);
    await clickButton(page, 'Captura');
    await clickButton(page, 'Capturar la página completa');
    const seen = await stored('completa');
    const after = await page.eval(`({ scrollY: Math.round(scrollY), header: getComputedStyle(document.querySelector('header')).visibility })`);
    return { seen, after, ok: evenRows(seen) && seen.darkRows === 30 && after.scrollY === 2000 && after.header === 'visible' };
  },

  // Like a Claude artifact: a bar on top and the content in a sandboxed frame of another origin.
  async marco_artifact() {
    const page = await open(`${PAGES}/artifact.html`);
    await pressIcon();
    const frame = await frameSession('marco.html');
    await waitFor('la barra en el marco', () => hasBar(frame), 5000);
    const inTop = await hasBar(page);
    await drag(page, [760, 300], [1000, 420]); // tab coordinates: the frame starts 40 px down
    const marks = await markCount(frame);
    await clickButton(frame, 'Captura');
    await clickButton(frame, 'Capturar la página completa');
    const seen = await stored('marco_artifact');
    const scale = seen.width / 1265;
    return { inTop, marks, seen, ok: !inTop && marks === 1 && evenRows(seen) && seen.darkRows === 16 && Math.abs(seen.height / scale - 3200) < 4 };
  },

  // Its scroll is animated by the page's own code, so a jump arrives late (the bug in her artifact).
  async scroll_animado() {
    const page = await open(`${PAGES}/suave.html`);
    await pressIcon();
    await waitFor('la barra', () => hasBar(page), 5000);
    await clickButton(page, 'Captura');
    await clickButton(page, 'Capturar la página completa');
    const seen = await stored('scroll_animado');
    return { seen, ok: evenRows(seen) && seen.darkRows === 24 };
  },

  // The body scrolls, with a diagram taller than the screen inside (the other cause of black blocks).
  async cuerpo_y_diagrama() {
    const page = await open(`${PAGES}/cuerpo.html`);
    await pressIcon();
    await waitFor('la barra', () => hasBar(page), 5000);
    await clickButton(page, 'Captura');
    await clickButton(page, 'Capturar la página completa');
    const seen = await stored('cuerpo_y_diagrama');
    const css = seen.height / (seen.width / (await page.eval('document.body.clientWidth')));
    return { seen, cssHeight: Math.round(css), ok: seen.longestDark < 20 && Math.abs(css - 2400) < 10 };
  },

  // Like Notion or Gmail: the page doesn't move, a panel scrolls inside it.
  async panel() {
    const page = await open(`${PAGES}/panel.html`);
    await pressIcon();
    await waitFor('la barra', () => hasBar(page), 5000);
    await drag(page, [760, 300], [1000, 420]);
    const marks = await markCount(page);
    await page.eval(`document.getElementById('principal').scrollTop = 200`);
    await sleep(150);
    const moved = await page.eval(`${ROOT}.querySelector('svg.marks > g').getAttribute('transform')`);
    await clickButton(page, 'Captura');
    await clickButton(page, 'Capturar la página completa');
    const seen = await stored('panel');
    const after = await page.eval(`document.getElementById('principal').scrollTop`);
    return { marks, moved, seen, after, ok: marks === 1 && moved === 'translate(0 -200)' && evenRows(seen) && seen.darkRows === 12 && after === 200 };
  },

  async csp_estricta() {
    const page = await open(`${PAGES}/estricta.html`);
    await pressIcon();
    await waitFor('la barra', () => hasBar(page), 5000);
    const position = await page.eval(`getComputedStyle(${ROOT}.querySelector('.dock')).position`);
    await drag(page, [100, 200], [500, 300]);
    const marks = await markCount(page);
    const fill = await page.eval(`${ROOT}.querySelector('svg.marks path')?.getAttribute('fill')`);
    await clickButton(page, 'Captura');
    await clickButton(page, 'Capturar la pantalla');
    const seen = await stored('csp_estricta');
    return { position, marks, fill, seen, ok: position === 'fixed' && marks === 1 && Boolean(fill) && seen.width > 0 };
  },

  async cancelar() {
    const page = await open(`${PAGES}/largo.html`);
    await page.eval(`scrollTo({ top: 200, behavior: 'instant' })`);
    await pressIcon();
    await waitFor('la barra', () => hasBar(page), 5000);
    await clickButton(page, 'Captura');
    await clickButton(page, 'Capturar la página completa');
    await waitFor('que avance', async () => ((await sw(`chrome.storage.session.get('state')`)).state?.progress ?? 0) > 0, 30_000);
    await pressKey(page, 'Escape', 'Escape', 27);
    await waitFor('que termine', async () => (await sw(`chrome.storage.session.get('state')`)).state?.status === 'idle', 15_000);
    await sleep(800);
    const after = await page.eval(`({ scrollY: Math.round(scrollY), header: getComputedStyle(document.querySelector('header')).visibility })`);
    const back = await dockVisible(page);
    return { after, back, openedOs: Boolean(await osTab()), ok: !(await osTab()) && after.scrollY === 200 && after.header === 'visible' && back };
  },

  async cambiar_de_pestana() {
    const page = await open(`${PAGES}/largo.html`);
    await pressIcon();
    await waitFor('la barra', () => hasBar(page), 5000);
    await clickButton(page, 'Captura');
    await clickButton(page, 'Capturar la página completa');
    await waitFor('que avance', async () => ((await sw(`chrome.storage.session.get('state')`)).state?.progress ?? 0) > 0, 30_000);
    const other = await c.newTab(`${PAGES}/panel.html`);
    await c.activate(other.id);
    const message = await waitFor('el aviso', () => toast(page), 20_000);
    const back = await dockVisible(page);
    const header = await page.eval(`getComputedStyle(document.querySelector('header')).visibility`);
    return { message, back, header, ok: /pestaña/.test(message) && back && header === 'visible' };
  },

  async cerrar() {
    const page = await open(`${PAGES}/largo.html`);
    await pressIcon();
    await waitFor('la barra', () => hasBar(page), 5000);
    await drawSomething(page);
    await page.eval(`${ROOT}.querySelector('button[aria-label="Cerrar"]').click()`);
    const asks = await page.eval(`${ROOT}.querySelector('.styles').textContent`);
    await clickButton(page, 'Seguir dibujando');
    const kept = await markCount(page);
    await pressIcon(); // the icon again is the same as closing
    await sleep(300);
    await clickButton(page, 'Cerrar y borrar');
    const gone = !(await hasBar(page));
    await pressIcon();
    await waitFor('la barra de nuevo', () => hasBar(page), 5000);
    const fresh = await markCount(page);
    await pressIcon(); // nothing drawn: it closes at once
    await sleep(300);
    const goneAgain = !(await hasBar(page));
    return { asks, kept, gone, fresh, goneAgain, ok: /Cerrar/.test(asks) && kept === 1 && gone && fresh === 0 && goneAgain };
  },

  async pagina_prohibida() {
    await open('chrome://version/');
    await pressIcon();
    await sleep(400);
    const badge = await sw(`chrome.action.getBadgeText({})`);
    const title = await sw(`chrome.action.getTitle({})`);
    return { badge, title, ok: badge === '!' && /no deja/.test(title) };
  },

  // The normal case: the OS works in a tab that doesn't take the focus and closes itself.
  async guardado_silencioso() {
    await sw(`chrome.storage.local.set({ keepOsTab: false })`);
    const page = await open(`${PAGES}/largo.html`);
    await pressIcon();
    await waitFor('la barra', () => hasBar(page), 5000);
    await clickButton(page, 'Captura');
    await clickButton(page, 'Capturar la pantalla');
    const opened = await waitFor('la pestaña del OS', osTab, 10_000);
    const activeTab = await sw(`chrome.tabs.query({ active: true }).then(([t]) => t.url)`);
    const message = await waitFor('Guardada', async () => {
      const t = await toast(page);
      return /Guardada/.test(t) ? t : null;
    }, 30_000);
    await sleep(500);
    const closed = !(await osTab());
    await clickButton(page, 'Ver capturas');
    const shown = await waitFor('Ver capturas', osTab, 8000);
    await sw(`chrome.storage.local.set({ keepOsTab: true })`);
    return { opened: Boolean(opened), activeTab, message, closed, library: shown.url, ok: !activeTab.startsWith(OS) && closed && /vista=capturas/.test(shown.url) };
  },

  // The OS can't finish on its own (no session, say): it comes forward and the bar says so.
  async os_sin_sesion() {
    await sw(`chrome.storage.local.set({ osUrl: 'http://127.0.0.1:8765/largo.html' })`);
    const page = await open(`${PAGES}/largo.html`);
    await pressIcon();
    await waitFor('la barra', () => hasBar(page), 5000);
    await clickButton(page, 'Captura');
    await clickButton(page, 'Capturar la pantalla');
    const message = await waitFor('el aviso', async () => {
      const t = await toast(page);
      return /pestaña del OS/.test(t) ? t : null;
    }, 70_000);
    const active = await sw(`chrome.tabs.query({ active: true }).then(([t]) => t.url)`);
    await sw(`chrome.storage.local.set({ osUrl: '${OS}?demo' }).then(() => chrome.storage.session.remove('pending'))`);
    return { message, active, ok: active.includes('extension=') };
  },

  async otros_sitios() {
    const page = await open(`${PAGES}/largo.html`);
    const seen = await page.eval(`typeof globalThis.chrome?.runtime?.sendMessage`);
    return { seen, ok: seen === 'undefined' };
  },

  async web_real() {
    const page = await open('https://venadigital.com.co');
    await sleep(2500);
    await pressIcon();
    await waitFor('la barra', () => hasBar(page), 5000);
    await drag(page, [300, 250], [800, 400]);
    await clickButton(page, 'Captura');
    await clickButton(page, 'Capturar la página completa');
    const seen = await stored('web_real');
    return { seen, ok: seen.height > seen.width };
  },

  async opcional_barra() {
    const page = await open(`${PAGES}/largo.html`);
    await pressIcon();
    await waitFor('la barra', () => hasBar(page), 5000);
    await drag(page, [150, 200], [600, 280]);
    await clickButton(page, 'Resaltador');
    await drag(page, [150, 340], [600, 340]);
    await sleep(200);
    const { data } = await page.send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(path.join(OUT, 'barra.png'), Buffer.from(data, 'base64'));
    return { ok: true };
  },
};

await sw(`chrome.storage.local.set({ osUrl: '${OS}?demo', keepOsTab: true })`);
const wanted = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(scenarios).filter((n) => !n.startsWith('opcional_'));
for (const name of wanted) {
  await cleanTabs();
  await sw(`chrome.storage.session.set({ state: { status: 'idle' } })`);
  const started = Date.now();
  try {
    results[name] = { ...(await scenarios[name]()), seconds: Math.round((Date.now() - started) / 1000) };
  } catch (err) {
    results[name] = { ok: false, error: err.message };
  }
  console.log(name, results[name].ok ? 'OK' : 'FALLA', JSON.stringify(results[name]).slice(0, 420));
}
if (!process.argv.slice(2).length) writeFileSync(path.join(OUT, process.env.RESULTS ?? 'resultados.json'), `${JSON.stringify(results, null, 2)}\n`);
process.exit(Object.values(results).every((r) => r.ok) ? 0 : 1);
