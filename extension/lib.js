// Decisions with no browser API in them: which part of the tab scrolls, and how to cut it.

/** Long enough for a very long article; the rest of a bottomless feed stays out. */
export const MAX_HEIGHT = 60_000;
/** Under the 50 MB the document library accepts for one file. */
export const MAX_BYTES = 48 * 1024 * 1024;
/** Chrome allows two screenshots per second. */
export const MIN_SHOT_GAP_MS = 550;
/** A scroller covering less of the tab than this is a sidebar or a widget, not the page. */
const MIN_AREA_SHARE = 0.25;

/** Sharpness that still fits the library: the longer the page, the fewer pixels per point. */
export const scaleFor = (height) => (height <= 15_000 ? 2 : height <= 30_000 ? 1.5 : 1);

/**
 * What each photo keeps: the middle two thirds of the scroller. Many sites slide things into
 * place as they enter the screen and undo it as they leave, so whatever touches its edges is
 * caught halfway and two stretches would not line up.
 */
export function bandFor(clientHeight) {
  const height = Math.max(120, Math.round((clientHeight * 2) / 3));
  return { height, margin: Math.max(0, Math.round((clientHeight - height) / 2)) };
}

/** The stretch starting at `top`: where to scroll, and how tall it is once the page's end is known. */
export const scrollFor = (top, margin) => Math.max(0, top - margin);
export const stretchHeight = (top, band, total) => Math.min(band, total - top);

/** Where each frame sits in the tab. A frame that can't be placed stays out of the result. */
export function frameOffsets(frames, navigation) {
  const byId = new Map(frames.map((f) => [f.frameId, f]));
  const nav = new Map(navigation.map((n) => [n.frameId, n]));
  const memo = new Map();
  const locate = (id) => {
    if (id === 0) return { x: 0, y: 0 };
    if (memo.has(id)) return memo.get(id);
    memo.set(id, null); // a parent loop must not recurse forever
    const frame = byId.get(id);
    const info = nav.get(id);
    const parent = info && byId.get(info.parentFrameId);
    let found = null;
    if (frame && parent) {
      const near = (a, b) => Math.abs(a - b) <= 2;
      const slot =
        parent.iframes.find((s) => s.src && s.src === info.url && near(s.width, frame.vw)) ??
        parent.iframes.find((s) => near(s.width, frame.vw) && near(s.height, frame.vh));
      const origin = slot && locate(info.parentFrameId);
      if (slot && origin) found = { x: origin.x + slot.left, y: origin.y + slot.top };
    }
    memo.set(id, found);
    return found;
  };
  const out = new Map();
  for (const f of frames) {
    const at = locate(f.frameId);
    if (at) out.set(f.frameId, at);
  }
  return out;
}

const visibleArea = (r, offset, tabW, tabH) => {
  const left = Math.max(0, r.left + offset.x);
  const top = Math.max(0, r.top + offset.y);
  const right = Math.min(tabW, r.left + offset.x + r.width);
  const bottom = Math.min(tabH, r.top + offset.y + r.height);
  return Math.max(0, right - left) * Math.max(0, bottom - top);
};

/**
 * The page's real scroller: what shows most of the tab and has the most to scroll. It can be
 * the document, a panel inside it, or the document of a frame (Claude artifacts live in one).
 * With nothing to scroll, the top document is captured as it is.
 */
export function chooseTarget(frames, offsets, tabW, tabH) {
  const minArea = tabW * tabH * MIN_AREA_SHARE;
  let best = { frameId: 0, kind: 'document', score: 0 };
  for (const f of frames) {
    const offset = offsets.get(f.frameId);
    if (!offset) continue;
    const options = [{ kind: 'document', scrollable: f.doc.scrollable, rect: { left: 0, top: 0, width: f.doc.width, height: f.doc.height } }];
    if (f.inner) options.push({ kind: 'element', scrollable: f.inner.scrollable, rect: f.inner });
    for (const o of options) {
      if (o.scrollable <= 40) continue;
      const area = visibleArea(o.rect, offset, tabW, tabH);
      if (area < minArea) continue;
      const score = area * o.scrollable;
      if (score > best.score) best = { frameId: f.frameId, kind: o.kind, score };
    }
  }
  return { frameId: best.frameId, kind: best.kind };
}

/** A failure from Chrome, in words that say what to do. */
export function friendlyError(err) {
  const text = err instanceof Error ? err.message : String(err);
  if (/chrome:\/\/|chrome-extension:|edge:\/\/|extensions gallery|Cannot access|cannot be scripted|is not allowed|activeTab|<all_urls>/i.test(text)) {
    return 'Chrome no deja capturar esta página.';
  }
  if (/No tab with id|Frame with ID|No frame with id|frame was removed|Tabs cannot be|document was removed/i.test(text)) {
    return 'La pestaña cambió mientras se capturaba. Inténtalo de nuevo.';
  }
  return 'No se pudo capturar esta página.';
}
