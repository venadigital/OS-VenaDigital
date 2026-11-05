// Styles of the bar and its marks. They live in a shadow root, so the page and the bar don't
// affect each other, and in a constructed sheet, which strict sites' CSP doesn't block.
export const OVERLAY_CSS = `
:host {
  --surface: #ffffff; --ink: #1f1e1c; --ink-2: #6b6864; --line: #e4e1dc; --fill: #f1efeb; --fill-2: #e8e5e0;
  --accent: #6d4bd6; --accent-soft: #efeafc; --crit: #c92a2a; --good: #2f9e44;
}
@media (prefers-color-scheme: dark) {
  :host {
    --surface: #242322; --ink: #f1efeb; --ink-2: #a5a29d; --line: #3a3835; --fill: #2f2d2b; --fill-2: #3a3835;
    --accent: #b39dff; --accent-soft: #33294f; --crit: #ff8787; --good: #69db7c;
  }
}
* { box-sizing: border-box; }
.surface { position: fixed; overflow: hidden; pointer-events: auto; touch-action: none; user-select: none; -webkit-user-select: none; }
.surface.off { pointer-events: none; }
.surface.pen, .surface.marker, .surface.shape, .surface.capture { cursor: crosshair; }
.surface.text { cursor: text; }
.surface.eraser { cursor: cell; }
.marks { position: absolute; left: 0; top: 0; width: 1px; height: 1px; overflow: visible; pointer-events: none; }
.editor {
  position: absolute; margin: 0; padding: 0; border: 0; resize: none; overflow: hidden; background: transparent; white-space: pre;
  outline: 1.5px dashed var(--accent); outline-offset: 3px; border-radius: 2px; user-select: text; -webkit-user-select: text; cursor: text;
}
.marquee { position: fixed; border: 1.5px solid var(--accent); border-radius: 2px; box-shadow: 0 0 0 100vmax rgb(0 0 0 / 0.28); pointer-events: none; }
.dock {
  position: fixed; left: 50%; bottom: 14px; transform: translateX(-50%); display: flex; flex-direction: column; align-items: center; gap: 8px;
  max-width: calc(100vw - 16px); pointer-events: none; color: var(--ink);
  font: 500 13px/1.3 -apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", Arial, sans-serif;
}
.dock > * { pointer-events: auto; }
.dock.hidden, .toast.hidden { visibility: hidden; }
.bar {
  display: flex; align-items: center; background: var(--surface); border: 1px solid var(--line); max-width: 100%;
  box-shadow: 0 10px 30px rgb(0 0 0 / 0.16), 0 1px 2px rgb(0 0 0 / 0.08);
}
.tools { gap: 2px; padding: 5px; border-radius: 16px; }
.styles { gap: 8px; padding: 6px 10px; border-radius: 14px; flex-wrap: wrap; justify-content: center; }
button { all: unset; box-sizing: border-box; display: inline-flex; align-items: center; justify-content: center; cursor: pointer; color: inherit; flex-shrink: 0; }
button:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
button[disabled] { opacity: 0.35; cursor: default; }
.tool { width: 38px; height: 38px; border-radius: 11px; color: var(--ink-2); }
.tool:hover:not([disabled]) { background: var(--fill); }
.tool[aria-pressed="true"] { background: var(--accent-soft); color: var(--accent); }
.mini { width: 30px; height: 30px; border-radius: 8px; color: var(--ink-2); }
.mini:hover { background: var(--fill); }
.mini[aria-pressed="true"] { background: var(--fill-2); color: var(--ink); box-shadow: inset 0 0 0 1.5px var(--line); }
.dot { display: block; border-radius: 999px; background: currentColor; }
.sep { width: 1px; align-self: stretch; margin: 4px 0; background: var(--line); flex-shrink: 0; }
.swatches, .group { display: flex; align-items: center; gap: 4px; }
.swatch { position: relative; width: 24px; height: 24px; border-radius: 999px; cursor: pointer; box-shadow: inset 0 0 0 1px rgb(0 0 0 / 0.12); }
.swatch[aria-pressed="true"] { box-shadow: 0 0 0 2px var(--surface), 0 0 0 3.5px var(--accent); }
.swatch.custom { background: conic-gradient(#e03131, #f08c00, #ffd43b, #2f9e44, #1971c2, #7048e8, #e64980, #e03131); overflow: hidden; display: inline-block; }
.swatch.custom input { position: absolute; inset: 0; width: 100%; height: 100%; opacity: 0; cursor: pointer; margin: 0; padding: 0; border: 0; }
.action { gap: 6px; height: 30px; padding: 0 10px; border-radius: 8px; color: var(--ink-2); white-space: nowrap; }
.action:hover { background: var(--fill); }
.action.primary { background: var(--ink); color: var(--surface); }
.toast { display: flex; align-items: center; gap: 8px; padding: 6px 12px; border-radius: 12px; white-space: nowrap; color: var(--ink-2); }
.toast .link { color: var(--ink); text-decoration: underline; }
.good { color: var(--good); }
.crit { color: var(--crit); }
.spin { animation: spin 0.9s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
`;
