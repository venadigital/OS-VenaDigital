import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import type { Readable, Writable } from 'node:stream';
import { buildWebPdf, type PdfPage, type PdfWord } from './webPdf.ts';

/**
 * Turns a web address into a PDF the OS can annotate. The Chrome already on this Mac opens
 * the page without a window and goes down it stretch by stretch, so lazy images and scroll
 * animations are in place when each stretch is photographed. It is driven over a private
 * pipe: no debugging port is opened, so nothing else on the Mac can reach its sessions.
 */

export type CaptureCode = 'invalid_url' | 'not_found' | 'not_page' | 'blocked' | 'busy' | 'timeout' | 'cancelled' | 'unavailable' | 'too_large';

export const CAPTURE_MESSAGES: Record<CaptureCode, string> = {
  invalid_url: 'Eso no parece la dirección de una web.',
  not_found: 'No se pudo abrir esa web. Revisa la dirección.',
  not_page: 'Esa dirección no es una página, es un archivo.',
  blocked: 'Esa web no dejó capturarla.',
  busy: 'Ya hay una web cargándose. Espera a que termine.',
  timeout: 'La web tardó demasiado en cargar.',
  cancelled: 'Carga cancelada.',
  unavailable: 'No se pudo abrir Chrome en este Mac.',
  too_large: 'La página es demasiado grande para guardarla.',
};

export const CAPTURE_STATUS: Record<CaptureCode, number> = {
  invalid_url: 400,
  not_found: 422,
  not_page: 422,
  blocked: 422,
  busy: 429,
  timeout: 504,
  cancelled: 499,
  unavailable: 503,
  too_large: 413,
};

export class CaptureError extends Error {
  readonly code: CaptureCode;
  constructor(code: CaptureCode, detail?: string) {
    super(detail ?? code);
    this.name = 'CaptureError';
    this.code = code;
  }
}

const PRIVATE_HOST =
  /^(localhost|0\.0\.0\.0|127\.\d+\.\d+\.\d+|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+|169\.254\.\d+\.\d+|\[.*\])$|\.(local|localhost|internal|lan)$/i;

/** What was typed, as a public http(s) address. Devices on this Mac's network stay out of reach. */
export function parseCaptureUrl(input: string): string {
  const raw = input.trim();
  if (!raw || /\s/.test(raw) || raw.length > 2048) throw new CaptureError('invalid_url');
  let url: URL;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    throw new CaptureError('invalid_url');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new CaptureError('invalid_url');
  if (url.username || url.password || !url.hostname.includes('.') || PRIVATE_HOST.test(url.hostname)) throw new CaptureError('invalid_url');
  return url.href;
}

/** Which capture error a failed navigation or a main-document status means. */
export function navigationError(errorText?: string, status?: number): CaptureError | null {
  if (status !== undefined && status >= 400) {
    return new CaptureError(status === 401 || status === 403 || status === 429 || status === 451 || status === 503 ? 'blocked' : 'not_found', `HTTP ${status}`);
  }
  if (errorText) return new CaptureError(/ABORTED|BLOCKED_BY_RESPONSE|DOWNLOAD/.test(errorText) ? 'not_page' : 'not_found', errorText);
  return null;
}

const VIEW_W = 1440;
const VIEW_H = 900;
/**
 * What each photo keeps: the middle of the screen. Many sites slide things into place as
 * they enter the screen and undo it as they leave, so whatever touches its edges is caught
 * halfway and two stretches would not line up.
 */
const STRETCH_H = 600;
const STRETCH_MARGIN = 150;
/** Long enough for a very long article; the rest of a bottomless feed stays out. */
const MAX_HEIGHT = 60_000;
/** Under the 50 MB the document library accepts for one file. */
const MAX_BYTES = 48 * 1024 * 1024;

/** Sharpness that still fits the library: the longer the page, the fewer pixels per point. */
export const scaleFor = (height: number) => (height <= 15_000 ? 2 : height <= 30_000 ? 1.5 : 1);

/** Runs inside the page. Defines the helpers the capture calls at each stretch. */
const PAGE_HELPERS = String.raw`(() => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const height = () => Math.max(document.documentElement.scrollHeight, document.body ? document.body.scrollHeight : 0);
  const jump = (top) => scrollTo({ top, left: 0, behavior: 'instant' });
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
    for (const el of floating) {
      const style = getComputedStyle(el);
      const fixed = style.position === 'fixed';
      const r = el.getBoundingClientRect();
      if (r.width * r.height > screen * (fixed ? 0.6 : 0.4)) continue;
      if (!fixed) {
        const stuck = parseFloat(style.top);
        if (Number.isNaN(stuck) || Math.abs(r.top - stuck) > 2) continue;
      }
      el.style.setProperty('visibility', 'hidden', 'important');
    }
  };
  // Where each text sits, so a stretch only measures the words near it.
  let texts = [];
  let textsAt = -1;
  const indexTexts = () => {
    if (textsAt === height()) return;
    textsAt = height();
    texts = [];
    if (!document.body) return;
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const parent = node.parentElement;
      if (!parent || !/\S/.test(node.data) || /^(SCRIPT|STYLE|NOSCRIPT|TEMPLATE)$/.test(parent.tagName)) continue;
      const box = parent.getBoundingClientRect();
      if (box.width > 0) texts.push({ node, parent, top: box.top + scrollY, bottom: box.bottom + scrollY });
    }
  };
  const harvest = (top, h) => {
    const words = [];
    indexTexts();
    const range = document.createRange();
    const y0 = top - scrollY;
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
        if (cy < y0 || cy >= y0 + h || r.right <= 0 || r.left >= innerWidth) continue;
        words.push([m[0], round(r.left), round(r.top - y0), round(r.width), round(r.height)]);
      }
    }
    return words;
  };
  // A first pass brings in what only loads when it gets close to the screen.
  const wakeUp = async (limit) => {
    for (let y = 0; y < Math.min(height(), limit); y += innerHeight) {
      jump(y);
      await sleep(120);
    }
    jump(0);
    await settle(2000);
    if (document.fonts) await Promise.race([document.fonts.ready, sleep(3000)]);
    return { title: document.title, height: height(), url: location.href };
  };
  const goTo = async (top, later) => {
    jump(top);
    if (later) hideFloating();
    await settle(1500);
  };
  window.__capture = { wakeUp, goTo, harvest };
})()`;

type Message = { id?: number; method?: string; params?: Record<string, unknown>; sessionId?: string; result?: unknown; error?: { message: string } };

/** Chrome DevTools Protocol over Chrome's debugging pipe: JSON messages ended by a NUL byte. */
class Pipe {
  private nextId = 0;
  private buffer: Buffer[] = [];
  private readonly waiting = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();
  private readonly input: Writable;
  private closedError: Error | null = null;
  onEvent: (m: Message) => void = () => undefined;

  constructor(input: Writable, output: Readable) {
    this.input = input;
    input.on('error', (err: Error) => this.close(err));
    output.on('error', (err: Error) => this.close(err));
    output.on('close', () => this.close(new CaptureError('unavailable', 'Chrome se cerró')));
    output.on('data', (chunk: Buffer) => {
      let start = 0;
      for (let end = chunk.indexOf(0); end >= 0; end = chunk.indexOf(0, start)) {
        this.buffer.push(chunk.subarray(start, end));
        this.receive(Buffer.concat(this.buffer).toString('utf8'));
        this.buffer = [];
        start = end + 1;
      }
      if (start < chunk.length) this.buffer.push(chunk.subarray(start));
    });
  }

  private receive(raw: string) {
    const m = JSON.parse(raw) as Message;
    const pending = m.id === undefined ? undefined : this.waiting.get(m.id);
    if (!pending) return this.onEvent(m);
    this.waiting.delete(m.id as number);
    if (m.error) pending.reject(new Error(m.error.message));
    else pending.resolve(m.result);
  }

  close(err: Error) {
    this.closedError ??= err;
    for (const p of this.waiting.values()) p.reject(this.closedError);
    this.waiting.clear();
  }

  send<T>(method: string, params: Record<string, unknown> = {}, sessionId?: string): Promise<T> {
    if (this.closedError) return Promise.reject(this.closedError);
    return new Promise<T>((resolve, reject) => {
      const id = ++this.nextId;
      this.waiting.set(id, { resolve: resolve as (v: unknown) => void, reject });
      this.input.write(`${JSON.stringify({ id, method, params, sessionId })}\0`);
    });
  }
}

export interface CaptureResult {
  pdf: Buffer;
  title: string;
  url: string;
  pages: number;
  truncated: boolean;
}

export interface WebCaptureOptions {
  chrome: string;
  profileDir: string;
  log?: (msg: string) => void;
}

export class WebCapture {
  private readonly opts: WebCaptureOptions;
  private running = false;

  constructor(opts: WebCaptureOptions) {
    this.opts = opts;
  }

  available(): boolean {
    return existsSync(this.opts.chrome);
  }

  /** One at a time: Chrome's profile only opens once. */
  async run(input: string, signal: AbortSignal): Promise<CaptureResult> {
    const url = parseCaptureUrl(input);
    if (!this.available()) throw new CaptureError('unavailable', `No está ${this.opts.chrome}`);
    if (this.running) throw new CaptureError('busy');
    this.running = true;
    let proc: ChildProcess | null = null;
    try {
      mkdirSync(this.opts.profileDir, { recursive: true });
      proc = spawn(
        this.opts.chrome,
        [
          '--headless=new',
          '--remote-debugging-pipe',
          `--user-data-dir=${this.opts.profileDir}`,
          `--window-size=${VIEW_W},${VIEW_H}`,
          '--hide-scrollbars',
          '--mute-audio',
          '--no-first-run',
          '--no-default-browser-check',
          '--disable-sync',
          '--disable-extensions',
          'about:blank',
        ],
        { stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe'] },
      );
      const started = proc;
      const pipe = new Pipe(started.stdio[3] as Writable, started.stdio[4] as Readable);
      started.on('error', (err) => pipe.close(new CaptureError('unavailable', err.message)));
      const stop = () => pipe.close(signal.reason?.name === 'TimeoutError' ? new CaptureError('timeout') : new CaptureError('cancelled'));
      if (signal.aborted) stop();
      signal.addEventListener('abort', stop, { once: true });
      try {
        return await this.capture(pipe, url);
      } finally {
        signal.removeEventListener('abort', stop);
      }
    } catch (err) {
      if (err instanceof CaptureError) throw err;
      throw new CaptureError('unavailable', err instanceof Error ? err.message : String(err));
    } finally {
      this.running = false;
      if (proc) await closeChrome(proc);
    }
  }

  private async capture(pipe: Pipe, url: string): Promise<CaptureResult> {
    const { targetId } = await pipe.send<{ targetId: string }>('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await pipe.send<{ sessionId: string }>('Target.attachToTarget', { targetId, flatten: true });
    const page = <T>(method: string, params: Record<string, unknown> = {}) => pipe.send<T>(method, params, sessionId);
    const run = async <T>(expression: string): Promise<T> => {
      const res = await page<{ result: { value: T }; exceptionDetails?: { text: string } }>('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
      if (res.exceptionDetails) throw new Error(res.exceptionDetails.text);
      return res.result.value;
    };

    let status: number | undefined;
    let mainFrame = '';
    let onLoad = () => {};
    const loaded = new Promise<void>((resolve) => (onLoad = resolve));
    pipe.onEvent = (m) => {
      if (m.sessionId !== sessionId) return;
      if (m.method === 'Page.loadEventFired') onLoad();
      if (m.method === 'Page.javascriptDialogOpening') void page('Page.handleJavaScriptDialog', { accept: false }).catch(() => undefined);
      if (m.method === 'Network.responseReceived') {
        const p = m.params as { type: string; frameId: string; response: { status: number } };
        if (p.type === 'Document' && p.frameId === mainFrame) status = p.response.status;
      }
    };
    await Promise.all([page('Page.enable'), page('Runtime.enable'), page('Network.enable')]);
    await pipe.send('Browser.setDownloadBehavior', { behavior: 'deny' });
    await page('Emulation.setDeviceMetricsOverride', { width: VIEW_W, height: VIEW_H, deviceScaleFactor: 2, mobile: false });

    const frames = await page<{ frameTree: { frame: { id: string } } }>('Page.getFrameTree');
    mainFrame = frames.frameTree.frame.id;
    const nav = await page<{ errorText?: string }>('Page.navigate', { url });
    const navError = navigationError(nav.errorText, status);
    if (navError) throw navError;
    await Promise.race([loaded, sleep(25_000)]);
    const httpError = navigationError(undefined, status);
    if (httpError) throw httpError;

    await run(PAGE_HELPERS);
    const info = await run<{ title: string; height: number; url: string }>(`__capture.wakeUp(${MAX_HEIGHT})`);
    parseCaptureUrl(info.url); // it may have redirected somewhere it shouldn't go
    const total = Math.min(Math.max(1, Math.ceil(info.height)), MAX_HEIGHT);
    const scale = scaleFor(total);
    await page('Emulation.setDeviceMetricsOverride', { width: VIEW_W, height: VIEW_H, deviceScaleFactor: scale, mobile: false });

    const pages: PdfPage[] = [];
    const count = Math.ceil(total / STRETCH_H);
    let bytes = 0;
    let quality = 82;
    for (let i = 0; i < count; i++) {
      const top = i * STRETCH_H;
      const height = Math.min(STRETCH_H, total - top);
      await run(`__capture.goTo(${Math.max(0, Math.min(top - STRETCH_MARGIN, total - VIEW_H))}, ${i > 0})`);
      const shot = await page<{ data: string }>('Page.captureScreenshot', {
        format: 'jpeg',
        quality,
        clip: { x: 0, y: top, width: VIEW_W, height, scale: 1 },
      });
      const jpeg = Buffer.from(shot.data, 'base64');
      const words = await run<PdfWord[]>(`__capture.harvest(${top}, ${height})`);
      pages.push({ jpeg, width: VIEW_W, height, words });
      bytes += jpeg.length;
      // Heavy page: trade quality for the rest of it before it overflows the library.
      if ((bytes / (i + 1)) * count > MAX_BYTES && quality > 50) quality -= 8;
    }

    const title = info.title.trim() || new URL(info.url).hostname;
    const pdf = buildWebPdf(pages, title);
    if (pdf.length > MAX_BYTES) throw new CaptureError('too_large', `${pdf.length} bytes`);
    this.opts.log?.(`captura: ${new URL(info.url).hostname}, ${count} tramos, ${Math.round(pdf.length / 1024)} KB`);
    return { pdf, title, url: info.url, pages: count, truncated: info.height > MAX_HEIGHT };
  }
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Lets Chrome save its profile, and makes sure it is gone. */
async function closeChrome(proc: ChildProcess) {
  if (proc.exitCode !== null || proc.signalCode !== null) return;
  const gone = new Promise<void>((r) => proc.once('exit', () => r()));
  proc.kill('SIGTERM');
  await Promise.race([gone, sleep(4000)]);
  if (proc.exitCode === null && proc.signalCode === null) {
    proc.kill('SIGKILL');
    await gone;
  }
}
