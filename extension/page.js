// Injected into every frame of the tab when a capture starts. It defines what the service
// worker calls in the frame that scrolls. This is the tab being read, so whatever it changes
// (scroll position, hidden headers) is put back at the end.
(() => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const root = () => document.scrollingElement || document.documentElement;

  let scroller = null; // null: the document
  let startScroll = 0;
  const hidden = new Map();

  // ---------- Finding what scrolls ----------
  const bestInner = () => {
    let best = null;
    let bestScore = 0;
    for (const el of document.querySelectorAll('body *')) {
      if (el.clientHeight < 150 || el.scrollHeight <= el.clientHeight + 40) continue;
      const overflow = getComputedStyle(el).overflowY;
      if (overflow !== 'auto' && overflow !== 'scroll') continue;
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

  const probe = () => {
    const doc = root();
    const inner = bestInner();
    return {
      vw: innerWidth,
      vh: innerHeight,
      doc: { scrollable: doc.scrollHeight - doc.clientHeight, width: doc.clientWidth, height: doc.clientHeight },
      inner: inner && { scrollable: inner.scrollHeight - inner.clientHeight, ...rectOf(inner) },
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
    rect: scroller ? rectOf(scroller) : { left: 0, top: 0, width: root().clientWidth, height: root().clientHeight },
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
    if (later) hideFloating();
    await settle(1500);
    return view();
  };

  // ---------- Text, so the OS can select it ----------
  let texts = [];
  let textsAt = -1;
  const indexTexts = (rect) => {
    const total = target().scrollHeight;
    if (textsAt === total) return;
    textsAt = total;
    texts = [];
    const walkFrom = scroller ?? document.body;
    if (!walkFrom) return;
    const walker = document.createTreeWalker(walkFrom, NodeFilter.SHOW_TEXT);
    const here = scrollTop();
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const parent = node.parentElement;
      if (!parent || !/\S/.test(node.data) || /^(SCRIPT|STYLE|NOSCRIPT|TEMPLATE)$/.test(parent.tagName)) continue;
      const box = parent.getBoundingClientRect();
      if (box.width > 0) texts.push({ node, parent, top: box.top - rect.top + here, bottom: box.bottom - rect.top + here });
    }
  };
  /** Words of the stretch [top, top + h], from its top-left corner. */
  const harvest = (top, h) => {
    const words = [];
    const { rect } = view();
    indexTexts(rect);
    const range = document.createRange();
    const y0 = rect.top + top - scrollTop();
    const round = (n) => Math.round(n * 100) / 100;
    const reach = innerHeight; // sections that were still sliding in when they were indexed
    for (const { node, parent, top: textTop, bottom: textBottom } of texts) {
      if (textBottom < top - reach || textTop > top + h + reach || !node.isConnected) continue;
      const style = getComputedStyle(parent);
      if (style.visibility !== 'visible' || style.opacity === '0') continue;
      for (const m of node.data.matchAll(/\S+/g)) {
        range.setStart(node, m.index);
        range.setEnd(node, m.index + m[0].length);
        const r = range.getClientRects()[0];
        if (!r || r.width < 1 || r.height < 1) continue;
        const cy = r.top + r.height / 2;
        if (cy < y0 || cy >= y0 + h || r.right <= rect.left || r.left >= rect.left + rect.width) continue;
        words.push([m[0], round(r.left - rect.left), round(r.top - y0), round(r.width), round(r.height)]);
      }
    }
    return words;
  };

  // ---------- Leaving the tab as it was ----------
  const end = () => {
    for (const [el, [value, priority]] of hidden) {
      if (value) el.style.setProperty('visibility', value, priority);
      else el.style.removeProperty('visibility');
    }
    hidden.clear();
    jump(startScroll);
    delete globalThis.__venaCapture;
  };

  globalThis.__venaCapture = { probe, begin, goTo, harvest, end };
})();
