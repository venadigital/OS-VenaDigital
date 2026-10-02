import { DownloadError, type DetectedUrl, type Platform } from './types.ts';

const PLATFORMS: { platform: Platform; label: string; hosts: RegExp }[] = [
  { platform: 'youtube', label: 'YouTube', hosts: /^((www|m|music)\.)?youtube\.com$|^youtu\.be$|^(www\.)?youtube-nocookie\.com$/ },
  { platform: 'instagram', label: 'Instagram', hosts: /^((www|m)\.)?instagram\.com$|^instagr\.am$/ },
  { platform: 'tiktok', label: 'TikTok', hosts: /^((www|m|vm|vt)\.)?tiktok\.com$/ },
  { platform: 'x', label: 'X', hosts: /^((www|mobile)\.)?(x|twitter)\.com$/ },
];

/** Query params that only track the share; dropping them keeps URLs canonical. */
const TRACKING = /^(utm_.*|si|igsh|igshid|feature|pp|is_from_webapp|sender_device|_r|_t|s|ref|ref_src|ref_url)$/i;

/**
 * Finds the first link in pasted text ("Mira esto https://…" works too),
 * checks it belongs to a supported platform and cleans it.
 * Only these platforms are accepted: the service is not an open proxy.
 */
export function detectUrl(input: string): DetectedUrl {
  const match = /https?:\/\/[^\s<>"']+/i.exec(input.trim());
  if (!match) throw new DownloadError('invalid_url');
  let url: URL;
  try {
    url = new URL(match[0].replace(/[.,;:)\]]+$/, ''));
  } catch {
    throw new DownloadError('invalid_url');
  }
  const host = url.hostname.toLowerCase();
  const found = PLATFORMS.find((p) => p.hosts.test(host));
  if (!found) throw new DownloadError('unsupported');

  for (const key of [...url.searchParams.keys()]) if (TRACKING.test(key)) url.searchParams.delete(key);
  url.hash = '';
  url.protocol = 'https:';

  const label = found.platform === 'youtube' && url.pathname.startsWith('/shorts/') ? 'YouTube Shorts' : found.label;
  return { url: url.toString(), platform: found.platform, label };
}
