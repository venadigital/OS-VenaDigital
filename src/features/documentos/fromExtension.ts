// What the Chrome extension captured reaches the OS here. The extension opens the OS with the
// capture's id; the OS asks for the pieces and stores them with its own session.
import { captureScale, encodeCapture, type CaptureImage } from './capture';

/** Fixed by the `key` in extension/manifest.json. */
export const EXTENSION_ID = 'kcnicbloecgnkjjahlfkhokliigkaflh';

export type ExtensionMeta = { id: string; kind: 'document' | 'capture'; title: string; url: string; count: number; truncated: boolean };
/** A word: text, then left, top, width and height from the stretch's top-left corner. */
export type WebWord = [string, number, number, number, number];
export type WebPart = { bytes: Uint8Array; type: string; width: number; height: number; words: WebWord[] };

type RuntimeWithExternal = {
  sendMessage: (id: string, message: unknown, callback: (response: unknown) => void) => void;
  lastError?: { message?: string };
};

const NO_ANSWER = 'La extensión de Chrome no responde. Comprueba que esté activa en este navegador.';

function ask<T>(message: unknown): Promise<T> {
  const runtime = (window as unknown as { chrome?: { runtime?: RuntimeWithExternal } }).chrome?.runtime;
  if (!runtime?.sendMessage) return Promise.reject(new Error(NO_ANSWER));
  return new Promise((resolve, reject) => {
    runtime.sendMessage(EXTENSION_ID, message, (response) => {
      if (runtime.lastError) return reject(new Error(NO_ANSWER));
      const failed = (response as { error?: string } | null)?.error;
      if (failed) return reject(new Error(failed));
      resolve(response as T);
    });
  });
}

export const readCapture = (id: string) => ask<ExtensionMeta | null>({ type: 'get', id });
export const forgetCapture = (id: string) => ask<{ ok: boolean }>({ type: 'done', id });

function fromBase64(data: string): Uint8Array {
  const raw = atob(data);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

export async function readParts(meta: ExtensionMeta, onProgress: (share: number) => void): Promise<WebPart[]> {
  const parts: WebPart[] = [];
  for (let index = 0; index < meta.count; index++) {
    const part = await ask<{ data: string; type: string; width: number; height: number; words: WebWord[] } | null>({ type: 'part', id: meta.id, index });
    if (!part) throw new Error('La captura está incompleta. Vuelve a hacerla.');
    parts.push({ bytes: fromBase64(part.data), type: part.type, width: part.width, height: part.height, words: part.words });
    onProgress((index + 1) / meta.count);
  }
  return parts;
}

/**
 * The PDF of a captured page, the same kind the Mac service makes: each stretch is a page with
 * its image and, on top, its words as invisible text. One page unit is one CSS pixel.
 */
export async function buildWebPdf(parts: WebPart[], title: string): Promise<Blob> {
  const lib = await import('pdf-lib');
  const { PDFDocument, StandardFonts, TextRenderingMode } = lib;
  const pdf = await PDFDocument.create();
  pdf.setTitle(title);
  const font = await pdf.embedFont(StandardFonts.Helvetica);

  // Helvetica only knows Latin-1-ish characters (all of Spanish); anything else becomes "?".
  const known = new Map<string, boolean>();
  const clean = (text: string) =>
    [...text]
      .map((ch) => {
        if (!known.has(ch)) {
          try {
            font.encodeText(ch);
            known.set(ch, true);
          } catch {
            known.set(ch, false);
          }
        }
        return known.get(ch) ? ch : '?';
      })
      .join('');

  for (const part of parts) {
    const page = pdf.addPage([part.width, part.height]);
    const image = await pdf.embedJpg(part.bytes);
    page.drawImage(image, { x: 0, y: 0, width: part.width, height: part.height });
    if (!part.words.length) continue;
    const key = page.node.newFontDictionary('VenaF', font.ref);
    const ops = [lib.beginText(), lib.setTextRenderingMode(TextRenderingMode.Invisible)];
    for (const [text, x, y, w, h] of part.words) {
      const word = clean(text);
      const size = h * 0.85;
      const natural = font.widthOfTextAtSize(word, size);
      if (!natural) continue;
      ops.push(
        lib.setFontAndSize(key, size),
        lib.setCharacterSqueeze((w / natural) * 100),
        lib.setTextMatrix(1, 0, 0, 1, x, part.height - (y + h * 0.8)),
        lib.showText(font.encodeText(word)),
      );
    }
    ops.push(lib.endText());
    page.pushOperators(...ops);
  }
  const bytes = await pdf.save({ useObjectStreams: false });
  return new Blob([bytes.slice().buffer as ArrayBuffer], { type: 'application/pdf' });
}

/** Stretches one under the other, as one image for the Capturas library. */
export async function stitchParts(parts: WebPart[]): Promise<CaptureImage> {
  const width = Math.max(...parts.map((p) => p.width));
  const height = parts.reduce((sum, p) => sum + p.height, 0);
  const bitmaps = await Promise.all(parts.map((p) => createImageBitmap(new Blob([p.bytes.slice().buffer as ArrayBuffer], { type: p.type }))));
  // As sharp as the photos are, unless the whole page wouldn't fit in one image.
  const scale = Math.min(bitmaps[0].width / parts[0].width, captureScale(width, height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('El navegador no pudo crear la imagen');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  let y = 0;
  parts.forEach((part, i) => {
    ctx.drawImage(bitmaps[i], 0, Math.round(y * scale), Math.round(part.width * scale), Math.round((y + part.height) * scale) - Math.round(y * scale));
    y += part.height;
    bitmaps[i].close();
  });
  return encodeCapture(canvas);
}
