import { describe, expect, it } from 'vitest';
import { dayStaysPut, firstParagraph, normalizeUrl, parseFeed, parsePage, parseSitemap, sameTitleKey, stripSourceSuffix, toSummary } from '../functions/news-sync/parse';

describe('parseFeed', () => {
  it('reads RSS with CDATA, an image inside the HTML and boilerplate at the end', () => {
    const xml = `<rss><channel><title>Canal</title><link>https://site.test</link><item>
      <title><![CDATA[La IA &amp; el trabajo]]></title>
      <link>https://site.test/a</link>
      <pubDate>Thu, 05 Nov 2026 13:00:00 +0000</pubDate>
      <description><![CDATA[<p><img width="1376" src="https://cdn.test/a.png" alt="x"/></p><p>Texto de la noticia.</p><p>The post A appeared first on Site.</p>]]></description>
    </item></channel></rss>`;
    expect(parseFeed(xml, 10)).toEqual([
      {
        url: 'https://site.test/a',
        title: 'La IA & el trabajo',
        summary: 'Texto de la noticia.',
        image: 'https://cdn.test/a.png',
        published: new Date('2026-11-05T13:00:00Z'),
      },
    ]);
  });

  it('reads the enclosure image and entity-encoded titles', () => {
    const xml = `<item><title>Ben&#8217;s</title><link>https://b.test/p/1</link>
      <enclosure url="https://cdn.test/b.png" length="0" type="image/jpeg"/>
      <description>Corto</description></item>`;
    const [item] = parseFeed(xml, 10);
    expect(item.title).toBe('Ben’s');
    expect(item.image).toBe('https://cdn.test/b.png');
  });

  it('reads Atom', () => {
    const xml = `<feed><entry><title>Atom</title><link rel="self" href="https://a.test/self"/><link rel="alternate" href="https://a.test/post"/>
      <published>2026-11-01T10:00:00Z</published><summary>Resumen</summary></entry></feed>`;
    expect(parseFeed(xml, 10)[0]).toMatchObject({ url: 'https://a.test/post', summary: 'Resumen', published: new Date('2026-11-01T10:00:00Z') });
  });

  it('stops at the limit and ignores an article cut in half', () => {
    const one = (n: number) => `<item><title>T${n}</title><link>https://s.test/${n}</link></item>`;
    expect(parseFeed(one(1) + one(2) + one(3), 2).map((c) => c.title)).toEqual(['T1', 'T2']);
    expect(parseFeed(`${one(1)}<item><title>Cortado</title><link>https://s.test/x`, 10).map((c) => c.title)).toEqual(['T1']);
  });

  it('ignores http images and tracking pixels', () => {
    const xml = `<item><title>T</title><link>https://s.test/1</link><description><![CDATA[
      <img src="http://cdn.test/inseguro.png"><img src="https://cdn.test/pixel.gif"><img width="1" src="https://cdn.test/uno.png"><img src="https://cdn.test/buena.png">
    ]]></description></item>`;
    expect(parseFeed(xml, 10)[0].image).toBe('https://cdn.test/buena.png');
  });

  it('skips articles with no address or title', () => {
    expect(parseFeed('<item><title>Sin enlace</title></item><item><link>https://s.test/1</link></item>', 10)).toEqual([]);
  });
});

describe('parseSitemap', () => {
  const xml = `<urlset>
    <url><loc>https://s.test/news</loc><lastmod>2026-11-05</lastmod></url>
    <url><loc>https://s.test/news/</loc><lastmod>2026-11-05</lastmod></url>
    <url><loc>https://s.test/news/vieja</loc><lastmod>2026-01-01</lastmod></url>
    <url><loc>https://s.test/news/nueva</loc><lastmod>2026-11-04</lastmod></url>
    <url><loc>https://s.test/careers</loc><lastmod>2026-11-05</lastmod></url>
  </urlset>`;

  it('keeps articles of that path, newest first, and leaves out the listing', () => {
    expect(parseSitemap(xml, '/news/', 10).map((r) => r.url)).toEqual(['https://s.test/news/nueva', 'https://s.test/news/vieja']);
  });

  it('applies the limit after sorting', () => {
    expect(parseSitemap(xml, '/news/', 1).map((r) => r.url)).toEqual(['https://s.test/news/nueva']);
  });
});

describe('parsePage', () => {
  const html = `<html><head>
    <meta property="og:title" content="Titulo &amp; mas"/>
    <meta content="Descripción genérica" property="og:description"/>
    <meta property="og:image" content="/img/portada.png"/>
    <meta property="article:published_time" content="2026-10-27T00:00:00.000Z"/>
    </head><body><p>Published</p><p>Oct 27, 2026</p>
    <p>We are expanding our partnership with the General Services Administration through a new agreement for all agencies.</p></body></html>`;

  it('reads the meta tags whatever the attribute order and resolves relative images', () => {
    expect(parsePage(html, 'https://s.test/news/a')).toEqual({
      title: 'Titulo & mas',
      summary: 'Descripción genérica',
      image: 'https://s.test/img/portada.png',
      published: new Date('2026-10-27T00:00:00Z'),
    });
  });

  it('uses the first real paragraph when the description is generic', () => {
    expect(parsePage(html, 'https://s.test/news/a', { bodySummary: true }).summary).toMatch(/^We are expanding/);
    expect(firstParagraph('<p>Corto</p>')).toBeNull();
  });

  it('falls back to the JSON-LD date', () => {
    expect(parsePage('{"datePublished":"2026-11-04T23:36:20.628Z"}', 'https://s.test').published).toEqual(new Date('2026-11-04T23:36:20.628Z'));
  });
});

describe('helpers', () => {
  it('cuts a long summary at a word', () => {
    const out = toSummary('palabra '.repeat(100)) as string;
    expect(out.length).toBeLessThanOrEqual(321);
    expect(out.endsWith('palabra…')).toBe(true);
    expect(toSummary('   ')).toBeNull();
  });

  it('normalizes addresses', () => {
    expect(normalizeUrl('https://s.test/a?utm_source=x&id=2#top')).toBe('https://s.test/a?id=2');
    expect(normalizeUrl('javascript:alert(1)')).toBeNull();
    expect(normalizeUrl('no es una url')).toBeNull();
  });

  it('keeps date-only values on their day, and leaves real times alone', () => {
    expect(dayStaysPut(new Date('2026-10-27T00:00:00.000Z'))).toEqual(new Date('2026-10-27T12:00:00.000Z'));
    expect(dayStaysPut(new Date('2026-10-27T00:00:01.000Z'))).toEqual(new Date('2026-10-27T00:00:01.000Z'));
    expect(dayStaysPut(null)).toBeNull();
  });

  it('removes the publisher name from Google News headlines', () => {
    expect(stripSourceSuffix('Una noticia - VentureBeat', 'VentureBeat')).toBe('Una noticia');
    expect(stripSourceSuffix('Otra noticia', 'VentureBeat')).toBe('Otra noticia');
  });

  it('treats titles that differ only in punctuation as the same', () => {
    expect(sameTitleKey('¡La IA, hoy!')).toBe(sameTitleKey('la ia hoy'));
  });
});
