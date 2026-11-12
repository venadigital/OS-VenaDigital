/**
 * Shrinks a chosen photo to at most `max` px per side as JPEG, so the photo widget
 * loads fast on the phone and every file stays under the bucket limit.
 */
export async function preparePhoto(file: File, max = 2200): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('el navegador no pudo procesar la imagen');
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.86));
  if (!blob) throw new Error('el navegador no pudo procesar la imagen');
  return blob;
}
