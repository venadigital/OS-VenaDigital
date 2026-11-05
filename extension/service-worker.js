// Puts the drawing bar on the tab, photographs it when asked, and hands the images to the OS,
// which stores them with its own session. The extension holds no account or key.
import { bandFor, chooseTarget, cropPlan, frameOffsets, friendlyError, MAX_HEIGHT, MIN_SHOT_GAP_MS, movedBetween, scaleFor, scrollFor } from './lib.js';
import { purgeOld, readMeta, readPart, removeRecord, saveMeta, savePart } from './store.js';

const OS_URL = 'https://os.venadigital.com.co/';
const OS_ORIGINS = new Set(['https://os.venadigital.com.co', 'http://localhost:5183']);
/** A running capture touches its state constantly; this long without it, the worker died. */
const STALE_MS = 30_000;
/** How long the OS has to pick a capture up in the background before it's shown (to sign in, say). */
const OS_PATIENCE_MS = 25_000;
const OS_CHECK = 'os-check';

const IDLE = { status: 'idle' };

async function setState(state) {
  await chrome.storage.session.set({ state: { ...state, updatedAt: Date.now() } });
  await chrome.action.setBadgeText({ text: state.status === 'capturing' ? `${Math.round((state.progress ?? 0) * 100)}%` : '' });
  await chrome.action.setBadgeBackgroundColor({ color: '#1f1e1c' });
}
const getState = async () => (await chrome.storage.session.get('state')).state ?? IDLE;
const isRunning = (state) => state.status === 'capturing' && Date.now() - state.updatedAt < STALE_MS;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

class Cancelled extends Error {}
class TabHidden extends Error {}

// ---------- In the tab ----------
const call = async (tabId, frameId, method, args = []) => {
  const [res] = await chrome.scripting.executeScript({
    target: { tabId, frameIds: [frameId] },
    func: (m, a) => globalThis.__venaCapture[m](...a),
    args: [method, args],
  });
  return res?.result;
};

/** Tells the bar something. It may be gone (the page navigated), which is nobody's error. */
const tell = (tabId, frameId, message) => chrome.tabs.sendMessage(tabId, message, { frameId }).catch(() => undefined);

async function readLayout(tabId) {
  await chrome.scripting.executeScript({ target: { tabId, allFrames: true }, files: ['page.js'] });
  const probes = await chrome.scripting.executeScript({
    target: { tabId, allFrames: true },
    func: () => globalThis.__venaCapture?.probe(),
  });
  const frames = probes.filter((p) => p.result).map((p) => ({ frameId: p.frameId, ...p.result }));
  const top = frames.find((f) => f.frameId === 0);
  if (!top) throw new Error('Cannot access this page');
  const navigation = (await chrome.webNavigation.getAllFrames({ tabId })) ?? [];
  return { frames, top, offsets: frameOffsets(frames, navigation) };
}

const forgetHelpers = (tabId) =>
  chrome.scripting
    .executeScript({ target: { tabId, allFrames: true }, func: () => void delete globalThis.__venaCapture })
    .catch(() => undefined);

// ---------- The drawing bar ----------
async function flashProblem(title) {
  await chrome.action.setBadgeText({ text: '!' });
  await chrome.action.setBadgeBackgroundColor({ color: '#c92a2a' });
  await chrome.action.setTitle({ title });
  setTimeout(() => {
    void chrome.action.setBadgeText({ text: '' });
    void chrome.action.setTitle({ title: 'Dibujar en esta página' });
  }, 4000);
}

async function toggleOverlay(tab) {
  try {
    const open = await chrome.scripting.executeScript({
      target: { tabId: tab.id, allFrames: true },
      func: () => Boolean(globalThis.__venaOverlay),
    });
    const running = open.find((r) => r.result);
    if (running) return void (await tell(tab.id, running.frameId, { type: 'close' }));

    const layout = await readLayout(tab.id);
    const target = chooseTarget(layout.frames, layout.offsets, layout.top.vw, layout.top.vh);
    await call(tab.id, target.frameId, 'begin', [target.kind]);
    await chrome.scripting.executeScript({ target: { tabId: tab.id, frameIds: [target.frameId] }, files: ['overlay.js'] });
    await forgetHelpers(tab.id);
  } catch (err) {
    console.warn('no se pudo abrir la barra', err);
    await flashProblem(friendlyError(err).replace('capturar', 'dibujar en'));
  }
}
chrome.action.onClicked.addListener((tab) => void toggleOverlay(tab));
self.toggleOverlay = toggleOverlay; // tests can't press the icon

// ---------- Photos ----------
let lastShot = 0;
async function shoot(tab) {
  const current = await chrome.tabs.get(tab.id);
  if (!current.active) throw new TabHidden();
  const wait = lastShot + MIN_SHOT_GAP_MS - Date.now();
  if (wait > 0) await sleep(wait);
  lastShot = Date.now();
  const url = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' });
  return createImageBitmap(await (await fetch(url)).blob());
}

/** A rectangle of the photo (in CSS pixels of the tab) as an image `scale` times its size. */
async function cut(bitmap, box, deviceScale, scale, type, quality) {
  const canvas = new OffscreenCanvas(Math.max(1, Math.round(box.width * scale)), Math.max(1, Math.round(box.height * scale)));
  const ctx = canvas.getContext('2d');
  ctx.drawImage(bitmap, box.left * deviceScale, box.top * deviceScale, box.width * deviceScale, box.height * deviceScale, 0, 0, canvas.width, canvas.height);
  return canvas.convertToBlob({ type, quality });
}

// ---------- Captures ----------
/** What is on screen: the whole tab, or a rectangle drawn in the frame of the bar. */
async function captureStill(tab, id, frameId, box, layout) {
  const offset = layout.offsets.get(frameId) ?? { x: 0, y: 0 };
  const area = box ? { left: box.left + offset.x, top: box.top + offset.y, width: box.width, height: box.height } : { left: 0, top: 0, width: layout.top.vw, height: layout.top.vh };
  const bitmap = await shoot(tab);
  const k = bitmap.width / layout.top.vw;
  const blob = await cut(bitmap, area, k, k, 'image/png');
  bitmap.close();
  await savePart({ id, index: 0, blob, width: area.width, height: area.height });
  return { count: 1, truncated: false };
}

/** The whole page, going down it. Only what scrolls comes out, without the app around it. */
async function captureLong(tab, id, frameId, kind, layout) {
  const offset = layout.offsets.get(frameId) ?? { x: 0, y: 0 };
  const first = await call(tab.id, frameId, 'begin', [kind]);
  const { height: band, margin } = bandFor(first.rect.height);
  let index = 0;
  let top = 0;
  let total = first.total;
  let retries = 0;
  try {
    for (;;) {
      if ((await getState()).cancel) throw new Cancelled();
      const view = await call(tab.id, frameId, 'goTo', [scrollFor(top, margin), index > 0]);
      total = view.total;
      const end = Math.min(total, MAX_HEIGHT);
      if (top >= end) break;
      const plan = cropPlan(top, Math.min(band, end - top), view);
      if (plan.height < 1) break; // the page doesn't go further than this
      const bitmap = await shoot(tab);
      const after = await call(tab.id, frameId, 'view');
      if (movedBetween(view, after) && retries < 3) {
        // It moved under the photo: what it shows isn't where the measure says.
        bitmap.close();
        retries += 1;
        continue;
      }
      retries = 0;
      const deviceScale = bitmap.width / layout.top.vw;
      const box = { left: offset.x + view.rect.left, top: offset.y + view.rect.top + plan.y, width: view.rect.width, height: plan.height };
      const blob = await cut(bitmap, box, deviceScale, Math.min(deviceScale, scaleFor(total)), 'image/jpeg', 0.92);
      bitmap.close();
      await savePart({ id, index, blob, width: box.width, height: plan.height });
      index += 1;
      top = plan.start + plan.height;
      await setState({ ...(await getState()), progress: Math.min(1, top / end) });
      if (top >= end) break;
    }
  } finally {
    await call(tab.id, frameId, 'end').catch(() => undefined);
  }
  return { count: index, truncated: total > MAX_HEIGHT };
}

async function osUrl(params) {
  // Tests point this at a local copy of the OS.
  const { osUrl: custom } = await chrome.storage.local.get('osUrl');
  const url = new URL(custom ?? OS_URL);
  url.pathname = '/documentos';
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return url.href;
}

/** The OS stores it with its session, from a tab that stays out of the way and closes itself. */
async function handOver(id, tab, frameId) {
  const os = await chrome.tabs.create({ url: await osUrl({ extension: id }), active: false, index: tab.index + 1, windowId: tab.windowId });
  const { pending = {} } = await chrome.storage.session.get('pending');
  pending[id] = { tabId: tab.id, frameId, osTabId: os.id, at: Date.now(), shown: false };
  await chrome.storage.session.set({ pending });
  await chrome.alarms.create(OS_CHECK, { delayInMinutes: 0.5 });
}

async function takeShot({ mode, box, kind }, tab, frameId) {
  if (isRunning(await getState())) return tell(tab.id, frameId, { type: 'status', status: 'error', message: 'Ya hay una captura en curso.' });
  const id = crypto.randomUUID();
  await setState({ status: 'capturing', tabId: tab.id, progress: 0 });
  let failure = null;
  let cancelled = false;
  try {
    await purgeOld();
    await tell(tab.id, frameId, { type: 'prepare' });
    const layout = await readLayout(tab.id);
    const result = mode === 'page' ? await captureLong(tab, id, frameId, kind, layout) : await captureStill(tab, id, frameId, box, layout);
    if (!result.count) throw new Error('empty');
    const { title, url } = await chrome.tabs.get(tab.id);
    await saveMeta({ id, title: title || new URL(url).hostname, url, createdAt: Date.now(), ...result });
  } catch (err) {
    await removeRecord(id).catch(() => undefined);
    if (err instanceof Cancelled) cancelled = true;
    else if (err instanceof TabHidden) failure = 'Cambiaste de pestaña durante la captura. Quédate en ella hasta que termine.';
    else {
      console.warn('captura fallida', err);
      failure = friendlyError(err);
    }
  }
  await forgetHelpers(tab.id);
  await setState(IDLE);
  await tell(tab.id, frameId, { type: 'restore' });
  if (cancelled) return tell(tab.id, frameId, { type: 'status', status: 'idle' });
  if (failure) return tell(tab.id, frameId, { type: 'status', status: 'error', message: failure });
  await tell(tab.id, frameId, { type: 'status', status: 'saving' });
  await handOver(id, tab, frameId);
}

// If the OS can't finish in the background (no session, a failed upload), it has to be seen.
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== OS_CHECK) return;
  const { pending = {} } = await chrome.storage.session.get('pending');
  let waiting = false;
  for (const entry of Object.values(pending)) {
    if (entry.shown) continue;
    if (Date.now() - entry.at < OS_PATIENCE_MS) {
      waiting = true;
      continue;
    }
    entry.shown = true;
    await chrome.tabs.update(entry.osTabId, { active: true }).catch(() => undefined);
    await tell(entry.tabId, entry.frameId, { type: 'status', status: 'error', message: 'Termina en la pestaña del OS.' });
  }
  await chrome.storage.session.set({ pending });
  if (waiting) await chrome.alarms.create(OS_CHECK, { delayInMinutes: 0.5 });
});

// ---------- Messages from the bar ----------
chrome.runtime.onMessage.addListener((msg, sender) => {
  if (sender.id !== chrome.runtime.id || !sender.tab) return false;
  if (msg.type === 'shot') void takeShot(msg, sender.tab, sender.frameId);
  if (msg.type === 'cancel') {
    void getState().then((state) => (state.status === 'capturing' ? setState({ ...state, cancel: true }) : undefined));
  }
  if (msg.type === 'open-captures') {
    void osUrl({ vista: 'capturas' }).then((url) => chrome.tabs.create({ url, index: sender.tab.index + 1, windowId: sender.tab.windowId }));
  }
  return false;
});

// ---------- The OS picks up what was captured ----------
function toBase64(bytes) {
  let out = '';
  for (let i = 0; i < bytes.length; i += 0x8000) out += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(out);
}

async function finished(id, osTabId) {
  await removeRecord(id);
  const { pending = {} } = await chrome.storage.session.get('pending');
  const entry = pending[id];
  if (!entry) return;
  delete pending[id];
  await chrome.storage.session.set({ pending });
  await tell(entry.tabId, entry.frameId, { type: 'status', status: 'saved' });
  if (entry.shown) await chrome.tabs.update(entry.tabId, { active: true }).catch(() => undefined);
  const { keepOsTab } = await chrome.storage.local.get('keepOsTab'); // tests read what the OS stored
  if (!keepOsTab && osTabId === entry.osTabId) await chrome.tabs.remove(osTabId).catch(() => undefined);
}

chrome.runtime.onMessageExternal.addListener((msg, sender, respond) => {
  if (!OS_ORIGINS.has(sender.origin)) return false;
  void (async () => {
    if (msg.type === 'get') return (await readMeta(msg.id)) ?? null;
    if (msg.type === 'part') {
      const part = await readPart(msg.id, msg.index);
      if (!part) return null;
      const { blob, width, height } = part;
      return { data: toBase64(new Uint8Array(await blob.arrayBuffer())), type: blob.type, width, height };
    }
    if (msg.type === 'done') {
      void finished(msg.id, sender.tab?.id);
      return { ok: true };
    }
    return null;
  })().then(respond, (err) => respond({ error: String(err?.message ?? err) }));
  return true;
});
