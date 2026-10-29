// PDF.js setup. The worker, fonts, character maps and image decoders are served by the app
// itself (vite.config: pdfjsAssets), so PDFs open without calling any other server.
import { getDocument, GlobalWorkerOptions, type PDFDocumentProxy, type PDFPageProxy } from 'pdfjs-dist';
import workerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

GlobalWorkerOptions.workerSrc = workerSrc;

const BASE = `${import.meta.env.BASE_URL}pdfjs/`;

export type { PDFDocumentProxy, PDFPageProxy };

export function openPdf(data: Uint8Array): Promise<PDFDocumentProxy> {
  return getDocument({
    data,
    cMapUrl: `${BASE}cmaps/`,
    standardFontDataUrl: `${BASE}standard_fonts/`,
    wasmUrl: `${BASE}wasm/`,
    iccUrl: `${BASE}iccs/`,
  }).promise;
}

/** iOS refuses canvases above ~16 MP; stay well under it. */
export const MAX_CANVAS_PIXELS = 8_000_000;

/** Small JPEG of the first page for the document cards. */
export async function firstPageThumbnail(pdf: PDFDocumentProxy, width = 360): Promise<string | null> {
  try {
    const page = await pdf.getPage(1);
    const base = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: width / base.width });
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    await page.render({ canvas, viewport }).promise;
    const url = canvas.toDataURL('image/jpeg', 0.8);
    canvas.width = canvas.height = 0;
    return url;
  } catch {
    return null;
  }
}

/** Reads a picked file: whether it is a PDF, its pages and its thumbnail. */
export async function inspectPdf(file: Blob): Promise<{ pageCount: number; thumbnail: string | null }> {
  const pdf = await openPdf(new Uint8Array(await file.arrayBuffer()));
  try {
    return { pageCount: pdf.numPages, thumbnail: await firstPageThumbnail(pdf) };
  } finally {
    void pdf.loadingTask.destroy();
  }
}

/** Message for a PDF that could not be opened. */
export function pdfErrorMessage(err: unknown): string {
  const name = (err as { name?: string })?.name;
  if (name === 'PasswordException') return 'El PDF tiene contraseña. Quítasela y vuelve a subirlo.';
  if (name === 'InvalidPDFException') return 'El archivo no es un PDF válido.';
  return err instanceof Error ? err.message : String(err);
}
