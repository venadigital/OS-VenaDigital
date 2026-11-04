// Goes down the tab photographing it, keeps the stretches, and opens the OS, which asks for
// them and stores them with its own session. The extension holds no account or key.
import { bandFor, chooseTarget, frameOffsets, friendlyError, MAX_BYTES, MAX_HEIGHT, MIN_SHOT_GAP_MS, scaleFor, scrollFor, stretchHeight } from './lib.js';
import { purgeOld, readMeta, readPart, removeRecord, saveMeta, savePart } from './store.js';

const OS_URL = 'https://os.venadigital.com.co/';
const OS_ORIGINS = new Set(['https://os.venadigital.com.co', 'http://localhost:5183']);
/** A running capture touches its state constantly; this long without it, the worker died. */
const STALE_MS = 30_000;

const IDLE = { status: 'idle' };

async function setState(state) {
  await chrome.storage.session.set({ state: { ...state, updatedAt: Date.now() } });
  const text = state.status === 'capturing' ? `${Math.round((state.progress ?? 0) * 100)}%` : state.status === 'error' ? '!' : '';
  await chrome.action.setBadgeText({ text });
  await chrome.action.setBadgeBackgroundColor({ color: state.status === 'error' ? '#c92a2a' : '#1f1e1c' });
}
const getState = async () => (await chrome.storage.session.get('state')).state ?? IDLE;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

class Cancelled extends Error {}

// ---------- In the tab ----------
const call = async (tabId, frameId, method, args = []) => {
  const [res] = await chrome.scripting.executeScript({
    target: { tabId, frameIds: [frameId] },
    func: (m, a) => globalThis.__venaCapture[m](...a),
    args: [method, args],
  });
  return res?.result;
};

async function findTarget(tabId) {
  await chrome.scripting.executeScript({ target: { tabId, allFrames: true }, files: ['page.js'] });
  const probes = await chrome.scripting.executeScript({
    target: { tabId, allFrames: true },
    func: () => globalThis.__venaCapture?.probe(),
  });
  const frames = probes.filter((p) => p.result).map((p) => ({ frameId: p.frameId, ...p.result }));
  const top = frames.find((f) => f.frameId === 0);
  if (!top) throw new Error('Cannot access this page');
  const navigation = (await chrome.webNavigation.getAllFrames({ tabId })) ?? [];
  const offsets = frameOffsets(frames, navigation);
  const target = chooseTarget(frames, offsets, top.vw, top.vh);
  return { ...target, offset: offsets.get(target.frameId) ?? { x: 0, y: 0 }, tabWidth: top.vw };
}

// ---------- Photos ----------
let lastShot = 0;
async function shoot(tab) {
  const current = await chrome.tabs.get(tab.id);
  if (!current.active) throw new Error('hidden');
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
async function captureVisible(tab, id) {
  const [res] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: () => ({ w: innerWidth, h: innerHeight }) });
  const bitmap = await shoot(tab);
  const k = bitmap.width / res.result.w;
  const blob = await cut(bitmap, { left: 0, top: 0, width: res.result.w, height: res.result.h }, k, k, 'image/png');
  bitmap.close();
  await savePart({ id, index: 0, blob, width: res.result.w, height: res.result.h, words: [] });
  return { count: 1, truncated: false };
}

async function captureLong(tab, id, withText) {
  const target = await findTarget(tab.id);
  const first = await call(tab.id, target.frameId, 'begin', [target.kind]);
  const { height: band, margin } = bandFor(first.clientHeight);
  let quality = withText ? 0.82 : 0.92;
  let bytes = 0;
  let index = 0;
  let top = 0;
  let total = first.total;
  try {
    for (;;) {
      if ((await getState()).cancel) throw new Cancelled();
      const view = await call(tab.id, target.frameId, 'goTo', [scrollFor(top, margin), index > 0]);
      total = view.total;
      const height = Math.max(1, stretchHeight(top, band, Math.min(total, MAX_HEIGHT)));
      const bitmap = await shoot(tab);
      const deviceScale = bitmap.width / target.tabWidth;
      const box = {
        left: target.offset.x + view.rect.left,
        top: target.offset.y + view.rect.top + (top - view.scrollTop),
        width: view.rect.width,
        height,
      };
      const blob = await cut(bitmap, box, deviceScale, Math.min(deviceScale, scaleFor(total)), 'image/jpeg', quality);
      bitmap.close();
      const words = withText ? await call(tab.id, target.frameId, 'harvest', [top, height]) : [];
      await savePart({ id, index, blob, width: box.width, height, words });
      bytes += blob.size;
      index += 1;
      top += height;
      const end = Math.min(total, MAX_HEIGHT);
      await setState({ ...(await getState()), progress: Math.min(1, top / end) });
      if (top >= end) break;
      // Heavy page: trade quality for the rest of it before it overflows the library.
      const projected = (bytes / index) * Math.ceil(end / band);
      if (projected > MAX_BYTES && quality > 0.5) quality -= 0.08;
    }
  } finally {
    await call(tab.id, target.frameId, 'end').catch(() => undefined);
  }
  if (withText && bytes > MAX_BYTES) throw new Error('too-large');
  return { count: index, truncated: total > MAX_HEIGHT };
}

async function osUrlFor(id) {
  // Tests point this at a local copy of the OS.
  const { osUrl } = await chrome.storage.local.get('osUrl');
  const url = new URL(osUrl ?? OS_URL);
  url.pathname = '/documentos';
  url.searchParams.set('extension', id);
  return url.href;
}

async function run(kind, tab) {
  const id = crypto.randomUUID();
  await setState({ status: 'capturing', kind, tabId: tab.id, progress: 0 });
  try {
    await purgeOld();
    const result = kind === 'visible' ? await captureVisible(tab, id) : await captureLong(tab, id, kind === 'annotate');
    await saveMeta({
      id,
      kind: kind === 'annotate' ? 'document' : 'capture',
      title: tab.title || new URL(tab.url).hostname,
      url: tab.url,
      createdAt: Date.now(),
      ...result,
    });
    await setState(IDLE);
    await chrome.tabs.create({ url: await osUrlFor(id), index: tab.index + 1, windowId: tab.windowId });
  } catch (err) {
    await removeRecord(id).catch(() => undefined);
    if (err instanceof Cancelled) return setState(IDLE);
    const message =
      err?.message === 'hidden'
        ? 'Cambiaste de pestaña durante la captura. Quédate en ella hasta que termine.'
        : err?.message === 'too-large'
          ? 'La página es demasiado grande para guardarla.'
          : friendlyError(err);
    console.warn('captura fallida', err);
    await setState({ status: 'error', message });
  }
}

// ---------- Popup ----------
chrome.runtime.onMessage.addListener((msg, sender, respond) => {
  if (sender.id !== chrome.runtime.id) return false;
  if (msg.type === 'start') {
    void (async () => {
      const state = await getState();
      const running = state.status === 'capturing' && Date.now() - state.updatedAt < STALE_MS;
      if (running) return respond({ ok: false });
      respond({ ok: true });
      await run(msg.kind, await chrome.tabs.get(msg.tabId));
    })();
    return true;
  }
  if (msg.type === 'cancel') {
    void (async () => {
      const state = await getState();
      // Past the limit nobody is running to notice the flag, so it simply ends.
      if (state.status === 'capturing' && Date.now() - state.updatedAt < STALE_MS) await setState({ ...state, cancel: true });
      else await setState(IDLE);
      respond({ ok: true });
    })();
    return true;
  }
  if (msg.type === 'dismiss') {
    void setState(IDLE).then(() => respond({ ok: true }));
    return true;
  }
  return false;
});

// ---------- The OS picks up what was captured ----------
function toBase64(bytes) {
  let out = '';
  for (let i = 0; i < bytes.length; i += 0x8000) out += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(out);
}

chrome.runtime.onMessageExternal.addListener((msg, sender, respond) => {
  if (!OS_ORIGINS.has(sender.origin)) return false;
  void (async () => {
    if (msg.type === 'get') return (await readMeta(msg.id)) ?? null;
    if (msg.type === 'part') {
      const part = await readPart(msg.id, msg.index);
      if (!part) return null;
      const { blob, width, height, words } = part;
      return { data: toBase64(new Uint8Array(await blob.arrayBuffer())), type: blob.type, width, height, words };
    }
    if (msg.type === 'done') {
      await removeRecord(msg.id);
      return { ok: true };
    }
    return null;
  })().then(respond, (err) => respond({ error: String(err?.message ?? err) }));
  return true;
});
