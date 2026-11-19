// The bar's keyboard: single letters while a tool is in hand, and Cmd (Ctrl for text) even while
// the page is in use; Cmd+C still copies a selection, and typing is never taken.
// Needs Chromium on port 9333 with the extension loaded and ./paginas on 127.0.0.1:8765.
//
//   node pruebas/atajos.mjs
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

// Records whether the key's default action survived. In capture on window, after the bar's own.
await page.eval(`window.__defaults = []; addEventListener('keydown', (e) => __defaults.push(e.defaultPrevented ? 'tomada' : 'libre'), true)`);
const MODS = { alt: 1, ctrl: 2, meta: 4, shift: 8 };
const press = async (k, mod) => {
  const modifiers = mod ? MODS[mod] : 0;
  const code = `Key${k.toUpperCase()}`;
  await page.send('Input.dispatchKeyEvent', { type: 'keyDown', key: k, code, modifiers, windowsVirtualKeyCode: k.toUpperCase().charCodeAt(0), ...(mod ? {} : { text: k }) });
  await page.send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code, modifiers });
  await sleep(80);
};
const tool = () => page.eval(`${ROOT}.querySelector('.tools button[aria-pressed="true"]')?.getAttribute('aria-label') ?? ''`);
const lastDefault = () => page.eval(`__defaults.at(-1)`);
const pick = (label) => page.eval(`[...${ROOT}.querySelectorAll('button')].find((b) => b.getAttribute('aria-label').startsWith(${JSON.stringify(label)})).click()`);

for (const [k, label] of [['t', 'Texto'], ['f', 'Formas'], ['r', 'Resaltador'], ['l', 'Lápiz'], ['c', 'Captura'], ['p', 'Puntero láser'], ['e', 'Borrador']]) {
  await press(k);
  const now = await tool();
  check(`${k.toUpperCase()} elige ${label}`, now.startsWith(label), now);
}

for (const [k, mod, label] of [['f', 'meta', 'Formas'], ['r', 'meta', 'Resaltador'], ['l', 'meta', 'Lápiz'], ['c', 'meta', 'Captura'], ['t', 'ctrl', 'Texto']]) {
  await pick('Usar la página');
  await press(k, mod);
  const now = await tool();
  const name = `${mod === 'meta' ? 'Cmd' : 'Ctrl'}+${k.toUpperCase()}`;
  check(`${name} elige ${label} aunque la página esté en uso`, now.startsWith(label) && (await lastDefault()) === 'tomada', now);
}

await pick('Usar la página');
await press('l');
check('con la página en uso, una letra sola es de la página', (await tool()).startsWith('Usar la página') && (await lastDefault()) === 'libre');

await page.eval(`getSelection().selectAllChildren(document.querySelector('p, div, h1, body'))`);
await press('c', 'meta');
check('Cmd+C con texto seleccionado sigue copiando', (await tool()).startsWith('Usar la página') && (await lastDefault()) === 'libre', await tool());
await page.eval(`getSelection().removeAllRanges()`);

await press('t', 'ctrl');
await page.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: 400, y: 400, button: 'left', buttons: 1, clickCount: 1 });
await page.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 400, y: 400, button: 'left', buttons: 0, clickCount: 1 });
await sleep(150);
const editing = await page.eval(`${ROOT}.activeElement?.tagName === 'TEXTAREA'`);
await press('l', 'meta');
await press('f');
check('escribiendo en un texto, ni Cmd+L ni F cambian de herramienta', editing && (await tool()).startsWith('Texto'), await tool());

writeFileSync(path.join(OUT, 'atajos.json'), JSON.stringify(checks, null, 2));
await c.closeTab(page.id);
const failed = Object.values(checks).filter((x) => !x.ok).length;
console.log(failed ? `${failed} fallaron` : 'Todo bien');
process.exit(failed ? 1 : 0);
