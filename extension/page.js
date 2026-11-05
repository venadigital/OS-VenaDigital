// Injected into every frame of the tab to find what scrolls and to go down it photographing.
// This is the tab being read, so whatever it changes (scroll position, hidden headers) is put
// back at the end.
(() => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const root = () => document.scrollingElement || document.documentElement;

  let scroller = null; // null: the document
  let startScroll = 0;
  const hidden = new Map();

  // ---------- Finding what scrolls ----------
  // A scroller has to fit on screen: what is taller than the screen (a wide diagram with its own
  // horizontal scroll, say) moves along with the page and can't be gone through by itself.
  const bestInner = () => {
    let best = null;
    let bestScore = 0;
    for (const el of document.querySelectorAll('body, body *')) {
      if (el.clientHeight < 150 || el.scrollHeight <= el.clientHeight + 40) continue;
      const overflow = getComputedStyle(el).overflowY;
      if (overflow !== 'auto' && overflow !== 'scroll') continue;
      const r = el.getBoundingClientRect();
      if (r.height > innerHeight + 2 || r.bottom <= 0 || r.top >= innerHeight) continue;
      const score = el.clientWidth * el.clientHeight * (el.scrollHeight - el.clientHeight);
      if (score > bestScore) {
        best = el;
        bestScore = score;
      }
    }
    return best;
  };
  const rectOf = (el) => {
    const r = el.getBoundingClientRect();
    return { left: r.left + el.clientLeft, top: r.top + el.clientTop, width: el.clientWidth, height: el.clientHeight };
  };
  /** The part of the scroller that is really on screen: nothing outside it can be photographed. */
  const visibleRect = (el) => {
    const r = rectOf(el);
    const left = Math.max(0, r.left);
    const top = Math.max(0, r.top);
    return { left, top, width: Math.min(innerWidth, r.left + r.width) - left, height: Math.min(innerHeight, r.top + r.height) - top };
  };

  const probe = () => {
    const doc = root();
    const inner = bestInner();
    return {
      vw: innerWidth,
      vh: innerHeight,
      doc: { scrollable: doc.scrollHeight - doc.clientHeight, width: doc.clientWidth, height: doc.clientHeight },
      inner: inner && { scrollable: inner.scrollHeight - inner.clientHeight, ...visibleRect(inner) },
      iframes: [...document.querySelectorAll('iframe, frame')].map((f) => ({ ...rectOf(f), src: f.src || '' })),
    };
  };

  // ---------- Moving through the page ----------
  const target = () => scroller ?? root();
  const scrollTop = () => (scroller ? scroller.scrollTop : scrollY);
  const jump = (top) => (scroller ? scroller.scrollTo({ top, behavior: 'instant' }) : scrollTo({ top, left: scrollX, behavior: 'instant' }));
  const view = () => ({
    scrollTop: scrollTop(),
    total: target().scrollHeight,
    clientHeight: target().clientHeight,
    rect: scroller ? visibleRect(scroller) : { left: 0, top: 0, width: root().clientWidth, height: root().clientHeight },
  });

  const begin = (kind) => {
    scroller = kind === 'element' ? bestInner() : null;
    startScroll = scrollTop();
    return view();
  };

  const busy = () => {
    const animating = document.getAnimations().some((a) => a.playState === 'running' && a.effect && a.effect.getComputedTiming().iterations !== Infinity);
    if (animating) return true;
    return [...document.images].some((img) => {
      if (img.complete) return false;
      const r = img.getBoundingClientRect();
      return r.bottom > 0 && r.top < innerHeight && r.width > 0;
    });
  };
  const settle = async (ms) => {
    const start = performance.now();
    await sleep(120);
    while (busy() && performance.now() - start < ms) await sleep(80);
  };
  // Scroll libraries turn a jump into an animation run by their own code, which nothing announces.
  // The only sign that the page has arrived is that it stops moving.
  const stopMoving = async (ms) => {
    const start = performance.now();
    let last = scrollTop();
    let quiet = 0;
    while (quiet < 3 && performance.now() - start < ms) {
      await sleep(60);
      const now = scrollTop();
      quiet = Math.abs(now - last) < 0.5 ? quiet + 1 : 0;
      last = now;
    }
  };
  /** Until what was just changed is on the screen. A hidden frame gets no frames, so it has a limit. */
  const painted = () =>
    Promise.race([new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))), sleep(150)]);

  // What stays on screen (headers, chat bubbles) belongs to the first stretch only.
  // Big fixed elements are usually the page's background, so they stay. Looking for them
  // walks the whole page, so it only happens every few stretches.
  let floating = [];
  let floatingAge = Infinity;
  const hideFloating = () => {
    if (floatingAge++ >= 6) {
      floating = [...document.querySelectorAll('body *')].filter((el) => /^(fixed|sticky)$/.test(getComputedStyle(el).position));
      floatingAge = 1;
    }
    const screen = innerWidth * innerHeight;
    const edge = view().rect.top;
    for (const el of floating) {
      if (hidden.has(el)) continue;
      const style = getComputedStyle(el);
      const fixed = style.position === 'fixed';
      const r = el.getBoundingClientRect();
      if (r.width * r.height > screen * (fixed ? 0.6 : 0.4)) continue;
      if (!fixed) {
        const stuck = parseFloat(style.top);
        if (Number.isNaN(stuck) || Math.abs(r.top - edge - stuck) > 2) continue;
      }
      hidden.set(el, [el.style.getPropertyValue('visibility'), el.style.getPropertyPriority('visibility')]);
      el.style.setProperty('visibility', 'hidden', 'important');
    }
  };

  const goTo = async (top, later) => {
    jump(top);
    await stopMoving(2500);
    if (later) hideFloating();
    await settle(1500);
    await stopMoving(1500);
    await painted();
    return view();
  };

  // ---------- Leaving the tab as it was ----------
  const end = async () => {
    for (const [el, [value, priority]] of hidden) {
      if (value) el.style.setProperty('visibility', value, priority);
      else el.style.removeProperty('visibility');
    }
    hidden.clear();
    jump(startScroll);
    await stopMoving(1500);
  };

  globalThis.__venaCapture = { probe, begin, goTo, view, end, element: () => scroller };
})();
