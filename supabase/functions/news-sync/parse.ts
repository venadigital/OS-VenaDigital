// Vena OS · Noticias
// Lectura de RSS/Atom, sitemaps y metadatos de página. Sin dependencias, para probarlo
// con vitest y para no tener que interpretar un feed entero: algunos pesan casi 1 MB y
// solo interesan los primeros artículos.

export type Candidate = {
  url: string;
  title: string;
  summary: string | null;
  image: string | null;
  published: Date | null;
};

export type PageInfo = {
  title: string | null;
  summary: string | null;
  image: string | null;
  published: Date | null;
};

const NAMED: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', hellip: '…', mdash: '—', ndash: '–',
  lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', laquo: '«', raquo: '»', iexcl: '¡', iquest: '¿',
  aacute: 'á', eacute: 'é', iacute: 'í', oacute: 'ó', uacute: 'ú', ntilde: 'ñ', uuml: 'ü',
  Aacute: 'Á', Eacute: 'É', Iacute: 'Í', Oacute: 'Ó', Uacute: 'Ú', Ntilde: 'Ñ',
};

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, code: string) => {
    if (code[0] !== '#') return NAMED[code] ?? whole;
    const n = code[1] === 'x' || code[1] === 'X' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
    return Number.isFinite(n) && n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : whole;
  });
}

const CDATA = /<!\[CDATA\[([\s\S]*?)\]\]>/g;

/** The HTML inside an XML element, whether it came in CDATA or entity-encoded. */
function innerHtml(raw: string): string {
  return raw.includes('<![CDATA[') ? raw.replace(CDATA, '$1') : decodeEntities(raw);
}

export function htmlToText(html: string): string {
  const noTags = html
    .replace(/<(script|style|figure|figcaption)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ');
  return decodeEntities(noTags).replace(/\s+/g, ' ').trim();
}

const BOILERPLATE = [
  /\s*The post\b.{0,300}\bappeared first on\b.*$/i,
  /\s*(Continue reading|Read more|Seguir leyendo|Leer más)\b.{0,120}$/i,
];

const SUMMARY_MAX = 320;

/** Short, plain text. Some feeds carry the whole article; two lines are all that's shown. */
export function toSummary(text: string | null | undefined): string | null {
  if (!text) return null;
  let out = text;
  for (const re of BOILERPLATE) out = out.replace(re, '');
  out = out.trim();
  if (!out) return null;
  if (out.length <= SUMMARY_MAX) return out;
  const cut = out.slice(0, SUMMARY_MAX);
  const space = cut.lastIndexOf(' ');
  return `${(space > 200 ? cut.slice(0, space) : cut).replace(/[\s,;:.–—-]+$/, '')}…`;
}

function element(block: string, tag: string): string | null {
  const m = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`, 'i').exec(block);
  return m ? m[1] : null;
}

function attr(tag: string, name: string): string | null {
  const m = new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, 'i').exec(tag);
  return m ? decodeEntities(m[2] ?? m[3] ?? '') : null;
}

function toDate(s: string | null | undefined): Date | null {
  if (!s) return null;
  const d = new Date(s.trim());
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Only https images, so the page never gets mixed content, and no tracking pixels. */
function usableImage(url: string | null | undefined, base?: string): string | null {
  if (!url) return null;
  let abs: string;
  try {
    abs = new URL(url.trim(), base).toString();
  } catch {
    return null;
  }
  if (!abs.startsWith('https://') || abs.length > 2048) return null;
  if (/pixel|beacon|tracker|feedburner|wp-stats|spacer|\/1x1\b/i.test(abs)) return null;
  return abs;
}

function imageOf(block: string): string | null {
  for (const m of block.matchAll(/<(media:content|media:thumbnail|enclosure)\b[^>]*>/gi)) {
    const type = attr(m[0], 'type');
    const medium = attr(m[0], 'medium');
    if (m[1].toLowerCase() !== 'media:thumbnail' && type && !type.startsWith('image/') && medium !== 'image') continue;
    const url = usableImage(attr(m[0], 'url'));
    if (url) return url;
  }
  for (const name of ['description', 'content:encoded', 'content', 'summary']) {
    const raw = element(block, name);
    if (!raw) continue;
    for (const m of innerHtml(raw).matchAll(/<img\b[^>]*>/gi)) {
      if (attr(m[0], 'width') === '1') continue;
      const url = usableImage(attr(m[0], 'src'));
      if (url) return url;
    }
  }
  return null;
}

function linkOf(block: string): string | null {
  const text = element(block, 'link');
  if (text && text.trim()) return decodeEntities(text.replace(CDATA, '$1')).trim();
  // Atom: <link rel="alternate" href="…"/>
  for (const m of block.matchAll(/<link\b[^>]*>/gi)) {
    const rel = attr(m[0], 'rel');
    const href = attr(m[0], 'href');
    if (href && (!rel || rel === 'alternate')) return href;
  }
  return null;
}

/** The first `limit` articles of an RSS or Atom feed; a truncated last one is ignored. */
export function parseFeed(xml: string, limit: number): Candidate[] {
  const out: Candidate[] = [];
  const re = /<(item|entry)\b[^>]*>([\s\S]*?)<\/\1>/g;
  let m: RegExpExecArray | null;
  while (out.length < limit && (m = re.exec(xml))) {
    const block = m[2];
    const url = linkOf(block);
    const title = htmlToText(innerHtml(element(block, 'title') ?? ''));
    if (!url || !title) continue;
    const description = element(block, 'description') ?? element(block, 'summary') ?? element(block, 'content:encoded') ?? element(block, 'content');
    out.push({
      url,
      title,
      summary: description ? toSummary(htmlToText(innerHtml(description))) : null,
      image: imageOf(block),
      published: toDate(element(block, 'pubDate') ?? element(block, 'published') ?? element(block, 'dc:date') ?? element(block, 'updated')),
    });
  }
  return out;
}

/** Articles of a sitemap whose path contains `path`, most recently changed first. */
export function parseSitemap(xml: string, path: string, limit: number): { url: string; lastmod: Date | null }[] {
  const rows: { url: string; lastmod: Date | null }[] = [];
  for (const m of xml.matchAll(/<url>([\s\S]*?)<\/url>/g)) {
    const url = element(m[1], 'loc')?.trim();
    if (!url) continue;
    let pathname: string;
    try {
      pathname = new URL(url).pathname;
    } catch {
      continue;
    }
    const at = pathname.indexOf(path);
    // The listing itself (/news/) isn't an article.
    if (at < 0 || pathname.length <= at + path.length) continue;
    rows.push({ url: decodeEntities(url), lastmod: toDate(element(m[1], 'lastmod')) });
  }
  rows.sort((a, b) => (b.lastmod?.getTime() ?? 0) - (a.lastmod?.getTime() ?? 0));
  return rows.slice(0, limit);
}

/** First real paragraph of a page, for sites whose description is the same on every article. */
export function firstParagraph(html: string, minLength = 80): string | null {
  for (const m of html.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)) {
    const text = htmlToText(m[1]);
    if (text.length >= minLength) return text;
  }
  return null;
}

/** Title, description, image and date from a page's meta tags. */
export function parsePage(html: string, url: string, opts: { bodySummary?: boolean } = {}): PageInfo {
  const metas = new Map<string, string>();
  for (const m of html.matchAll(/<meta\b[^>]*>/gi)) {
    const key = (attr(m[0], 'property') ?? attr(m[0], 'name'))?.toLowerCase();
    const content = attr(m[0], 'content');
    if (key && content && !metas.has(key)) metas.set(key, content);
  }
  const pick = (...keys: string[]) => {
    for (const k of keys) {
      const v = metas.get(k);
      if (v) return v;
    }
    return null;
  };
  const description = pick('og:description', 'twitter:description', 'description');
  const fromBody = opts.bodySummary ? firstParagraph(html) : null;
  const jsonLdDate = /"datePublished"\s*:\s*"([^"]+)"/.exec(html)?.[1];
  const title = pick('og:title', 'twitter:title');
  return {
    title: title ? htmlToText(title) : null,
    summary: toSummary(fromBody ?? (description ? htmlToText(description) : null)),
    image: usableImage(pick('og:image:secure_url', 'og:image', 'twitter:image', 'twitter:image:src'), url),
    published: toDate(pick('article:published_time') ?? jsonLdDate),
  };
}

const TRACKING = /^(utm_[a-z]+|ref|ref_src|source|mc_cid|mc_eid|_hsenc|_hsmi)$/i;

/** The same article always ends up with the same address. */
export function normalizeUrl(raw: string): string | null {
  try {
    const u = new URL(raw.trim());
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
    u.hash = '';
    for (const key of [...u.searchParams.keys()]) if (TRACKING.test(key)) u.searchParams.delete(key);
    const out = u.toString();
    return out.length <= 2048 ? out : null;
  } catch {
    return null;
  }
}

/**
 * Some sites publish a date with no time, which arrives as midnight UTC: in America that
 * would fall on the previous day. Noon UTC keeps it on the right day.
 */
export function dayStaysPut(d: Date | null): Date | null {
  if (!d) return null;
  return d.getTime() % 86_400_000 === 0 ? new Date(d.getTime() + 43_200_000) : d;
}

/** Google News appends the publisher's name to every headline. */
export function stripSourceSuffix(title: string, source: string): string {
  const suffix = ` - ${source}`;
  return title.toLowerCase().endsWith(suffix.toLowerCase()) ? title.slice(0, -suffix.length).trim() : title;
}

export const sameTitleKey = (title: string) => title.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
