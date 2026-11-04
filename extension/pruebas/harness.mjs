// Runs the extension's real flow in a headless Chromium: real popup, real captures, and the OS
// (in demo mode) receiving them. Needs Chromium on port 9333 with the extension loaded, the
// pages of ./paginas on 127.0.0.1:8765 and localhost:8766, and the OS dev server on 5183.
//
//   node pruebas/harness.mjs [escenarios...]   (sin argumentos: todos)
import { mkdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

const { cdp, sleep } = await import(path.join(homedir(), '.claude/skills/chrome-extensions/scripts/cdp-lib.mjs'));

const EXT = 'kcnicbloecgnkjjahlfkhokliigkaflh';
const PAGES = 'http://127.0.0.1:8765';
const OUT = path.join(import.meta.dirname, 'resultados');
mkdirSync(OUT, { recursive: true });
const c = cdp(Number(process.env.PORT ?? 9333));
const results = {};

const sw = (expr) => c.evalInServiceWorker(expr, EXT);
const state = async () => (await sw(`chrome.storage.session.get('state')`)).state ?? { status: 'idle' };

async function waitFor(what, test, ms = 150_000) {
  const end = Date.now() + ms;
  for (;;) {
    const value = await test();
    if (value) return value;
    if (Date.now() > end) throw new Error(`Tiempo agotado esperando: ${what}`);
    await sleep(250);
  }
}

/** Opens the real popup, puts the page back in front and presses a button. */
async function press(page, button) {
  const popup = await c.openExtensionPage(EXT, 'popup/popup.html');
  await c.activate(page.id);
  await sleep(300);
  await popup.eval(`document.getElementById('${button}').click()`).catch(() => undefined); // the popup closes itself
  return popup;
}

const open = async (url) => {
  const page = await c.newTab(url);
  await sleep(1500);
  return page;
};
const osTab = async () => (await c.targets()).find((t) => t.type === 'page' && t.url.startsWith('http://localhost:5183/'));
const closeOsTabs = async () => {
  for (const t of await c.targets()) if (t.type === 'page' && t.url.startsWith('http://localhost:5183/')) await c.closeTab(t.id);
};

async function osSession() {
  const t = await waitFor('la pestaña del OS', osTab, 20_000);
  return c.page((x) => x.id === t.id);
}

/** Waits for the capture to end and reads what the OS stored. */
async function finish(kind, label) {
  const os = await osSession();
  if (kind === 'document') {
    await waitFor('el visor del OS', () => os.eval(`/^\\/documentos\\/./.test(location.pathname) && document.querySelectorAll('[data-page]').length > 0`), 90_000);
    await sleep(2500);
    const seen = await os.eval(`({
      path: location.pathname.replace(/demo-.*/, 'demo'),
      pages: document.querySelectorAll('[data-page]').length,
      first: (() => { const r = document.querySelector('[data-page]').getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; })(),
      gap: getComputedStyle(document.querySelector('.doc-pages')).gap,
      web: !!document.querySelector('.doc-pages--web'),
      name: document.querySelector('.doc-name').value,
      text: [...document.querySelectorAll('[data-page="0"] .textLayer span')].map((s) => s.textContent).join(' ').slice(0, 200),
    })`);
    return seen;
  }
  await waitFor('la biblioteca de capturas', () => os.eval(`location.search.includes('vista=capturas') && !!document.querySelector('article button')`), 90_000);
  await os.eval(`document.querySelector('article button').click()`);
  await waitFor('la imagen', () => os.eval(`!!document.querySelector('.doc-capture-view img')?.naturalWidth`), 15_000);
  const image = await os.eval(`(async () => {
    const img = document.querySelector('.doc-capture-view img');
    const blob = await (await fetch(img.src)).blob();
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let raw = '';
    for (let i = 0; i < bytes.length; i += 0x8000) raw += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return { width: img.naturalWidth, height: img.naturalHeight, type: blob.type, data: btoa(raw), name: document.querySelector('dialog[open] h2').textContent };
  })()`);
  const file = `${label}.${image.type === 'image/jpeg' ? 'jpg' : 'png'}`;
  writeFileSync(path.join(OUT, file), Buffer.from(image.data, 'base64'));
  const { data: _data, ...rest } = image;
  return { ...rest, file };
}

async function pageState(page, selector) {
  return page.eval(`({ scrollY: Math.round(scrollY), floating: ${selector ? `getComputedStyle(document.querySelector('${selector}')).visibility` : 'null'}, leftover: typeof globalThis.__venaCapture })`);
}

const scenarios = {
  // A long page with a fixed header, a chat bubble and reversible slide-in animations.
  async anotar_largo() {
    const page = await open(`${PAGES}/largo.html`);
    await page.eval(`scrollTo({ top: 300, behavior: 'instant' })`);
    await press(page, 'annotate');
    const seen = await finish('document', 'anotar_largo');
    const after = await pageState(page, 'header');
    return { seen, after, ok: seen.web && seen.pages > 5 && seen.gap === '0px' && /Fila/.test(seen.text) && after.scrollY === 300 && after.floating === 'visible' };
  },
  async capturar_largo() {
    const page = await open(`${PAGES}/largo.html`);
    await press(page, 'page');
    const seen = await finish('capture', 'capturar_largo');
    return { seen, ok: seen.height >= 6000 };
  },
  // Like a Claude artifact: a bar on top and the content in a sandboxed frame of another origin.
  async capturar_marco() {
    const page = await open(`${PAGES}/artifact.html`);
    await press(page, 'page');
    const seen = await finish('capture', 'capturar_marco');
    return { seen, ok: seen.height >= 3200 };
  },
  async anotar_marco() {
    const page = await open(`${PAGES}/artifact.html`);
    await press(page, 'annotate');
    const seen = await finish('document', 'anotar_marco');
    return { seen, ok: /Bloque 1/.test(seen.text) && !/Barra/.test(seen.text) };
  },
  // Like Notion or Gmail: the page doesn't move, a panel scrolls inside it.
  async capturar_panel() {
    const page = await open(`${PAGES}/panel.html`);
    await press(page, 'page');
    const seen = await finish('capture', 'capturar_panel');
    return { seen, ok: seen.height >= 2400 };
  },
  async capturar_pantalla() {
    const page = await open(`${PAGES}/largo.html`);
    await press(page, 'visible');
    const seen = await finish('capture', 'capturar_pantalla');
    return { seen, ok: seen.width > 0 && seen.height < seen.width };
  },
  async cancelar() {
    const page = await open(`${PAGES}/largo.html`);
    await page.eval(`scrollTo({ top: 200, behavior: 'instant' })`);
    await press(page, 'page');
    await waitFor('que avance', async () => (await state()).progress > 0, 30_000);
    await sw(`chrome.storage.session.get('state').then(({ state }) => chrome.storage.session.set({ state: { ...state, cancel: true } }))`);
    await waitFor('que termine', async () => (await state()).status === 'idle', 15_000);
    await sleep(500);
    const after = await pageState(page, 'header');
    return { after, openedOs: Boolean(await osTab()), ok: !(await osTab()) && after.scrollY === 200 && after.floating === 'visible' && after.leftover === 'undefined' };
  },
  async cambiar_de_pestana() {
    const page = await open(`${PAGES}/largo.html`);
    const other = await open(`${PAGES}/panel.html`);
    await press(page, 'page');
    await waitFor('que avance', async () => (await state()).progress > 0, 30_000);
    await c.activate(other.id);
    const failed = await waitFor('el error', async () => {
      const s = await state();
      return s.status === 'error' ? s : null;
    }, 20_000);
    const after = await pageState(page, 'header');
    await sw(`chrome.storage.session.set({ state: { status: 'idle' } }).then(() => chrome.action.setBadgeText({ text: '' }))`);
    return { message: failed.message, after, ok: /pestaña/.test(failed.message) && after.floating === 'visible' };
  },
  async pagina_prohibida() {
    const page = await open('chrome://version/');
    await press(page, 'annotate');
    const failed = await waitFor('el error', async () => {
      const s = await state();
      return s.status === 'error' ? s : null;
    }, 20_000);
    await sw(`chrome.storage.session.set({ state: { status: 'idle' } }).then(() => chrome.action.setBadgeText({ text: '' }))`);
    return { message: failed.message, ok: /no deja/.test(failed.message) };
  },
  // Other sites can't even reach the extension.
  async otros_sitios() {
    const page = await open(`${PAGES}/largo.html`);
    const seen = await page.eval(`typeof globalThis.chrome?.runtime?.sendMessage`);
    return { seen, ok: seen === 'undefined' };
  },
  async web_real() {
    const page = await open('https://venadigital.com.co');
    await sleep(2500);
    await press(page, 'annotate');
    const seen = await finish('document', 'web_real');
    return { seen, ok: seen.web && seen.pages > 5 };
  },
  // Only by name: it depends on what that site lets a headless browser see.
  async opcional_artifact() {
    const page = await open(process.env.ARTIFACT_URL);
    await sleep(5000);
    const shown = await page.eval(`document.title`);
    await press(page, 'page');
    const seen = await finish('capture', 'opcional_artifact');
    return { shown, seen, ok: true };
  },
  async opcional_popup() {
    const popup = await c.openExtensionPage(EXT, 'popup/popup.html');
    await c.activate(popup.id);
    await popup.send('Emulation.setDeviceMetricsOverride', { width: 304, height: 190, deviceScaleFactor: 2, mobile: false });
    await sleep(400);
    const { data } = await popup.send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(path.join(OUT, 'popup.png'), Buffer.from(data, 'base64'));
    return { ok: true };
  },
};

await sw(`chrome.storage.local.set({ osUrl: 'http://localhost:5183/?demo' })`);
const wanted = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(scenarios).filter((n) => !n.startsWith('opcional_'));
for (const name of wanted) {
  await closeOsTabs();
  const started = Date.now();
  try {
    results[name] = { ...(await scenarios[name]()), seconds: Math.round((Date.now() - started) / 1000) };
  } catch (err) {
    results[name] = { ok: false, error: err.message, state: await state().catch(() => null) };
    await sw(`chrome.storage.session.set({ state: { status: 'idle' } })`).catch(() => undefined);
  }
  console.log(name, results[name].ok ? 'OK' : 'FALLA', JSON.stringify(results[name]).slice(0, 400));
}
writeFileSync(path.join(OUT, 'resultados.json'), `${JSON.stringify(results, null, 2)}\n`);
process.exit(Object.values(results).every((r) => r.ok) ? 0 : 1);
