// Client avatar: its photo or logo when there is one, else initials on the project color.
import { useClientLogos } from '@/data/hooks';
import type { Client } from '@/data/types';
import { initials } from './model';

export function avatarStyle(color?: string) {
  return { background: color ? `color-mix(in srgb, ${color} 38%, var(--color-surface))` : 'var(--stay-lilac)' };
}

export function ClientAvatar({ client, color, large, src }: { client: Pick<Client, 'name' | 'logo_path'>; color?: string; large?: boolean; src?: string | null }) {
  const logos = useClientLogos(!src && client.logo_path ? [client.logo_path] : []);
  const url = src ?? (client.logo_path ? logos.data?.[client.logo_path] : undefined);
  const cls = large ? 'cl-avatar is-lg' : 'cl-avatar';
  if (url) {
    return (
      <span className={`${cls} has-logo`}>
        <img src={url} alt="" />
      </span>
    );
  }
  return (
    <span className={cls} style={avatarStyle(color)}>
      {initials(client.name)}
    </span>
  );
}

/**
 * Shrinks a chosen photo or logo to at most `max` px per side (WebP, or PNG where the
 * browser can't write WebP), so avatars load fast and stay under the bucket limit.
 */
export async function prepareLogo(file: File, max = 400): Promise<Blob> {
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
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/webp', 0.9));
  if (!blob) throw new Error('el navegador no pudo procesar la imagen');
  return blob;
}
