// Vena OS · Noticias
// Las fuentes del panel. Para agregar una: una línea aquí y volver a desplegar la función;
// la tabla news_sources se actualiza sola.

export type Source = {
  slug: string;
  name: string;
  /** Dominio, para el logo cuando un artículo no trae imagen. */
  site: string;
  /** RSS o Atom. */
  feed?: string;
  /** Si el feed falla: Google News, que solo da título, fecha y enlace. */
  fallbackNews?: string;
  /** Sin RSS: el sitemap y, de ahí, las rutas de artículo que contienen `path`. */
  sitemap?: string;
  path?: string;
  /** Su descripción es genérica: usar el primer párrafo del artículo. */
  bodySummary?: boolean;
  /** Su web rechaza lectores automáticos: quedarse con lo que trae el feed. */
  noPages?: boolean;
};

const googleNews = (query: string) =>
  `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`;

export const SOURCES: Source[] = [
  { slug: 'xataka', name: 'Xataka', site: 'xataka.com', feed: 'https://www.xataka.com/tag/inteligencia-artificial/rss2.xml' },
  { slug: 'genbeta', name: 'Genbeta', site: 'genbeta.com', feed: 'https://www.genbeta.com/categoria/inteligencia-artificial/rss2.xml' },
  { slug: 'openai', name: 'OpenAI', site: 'openai.com', feed: 'https://openai.com/news/rss.xml', noPages: true },
  { slug: 'anthropic', name: 'Anthropic', site: 'anthropic.com', sitemap: 'https://www.anthropic.com/sitemap.xml', path: '/news/', bodySummary: true },
  { slug: 'the-decoder', name: 'The Decoder', site: 'the-decoder.com', feed: 'https://the-decoder.com/feed/' },
  { slug: 'techcrunch', name: 'TechCrunch', site: 'techcrunch.com', feed: 'https://techcrunch.com/category/artificial-intelligence/feed/' },
  {
    slug: 'venturebeat',
    name: 'VentureBeat',
    site: 'venturebeat.com',
    feed: 'https://venturebeat.com/category/ai/feed/',
    fallbackNews: googleNews('site:venturebeat.com AI when:7d'),
  },
  { slug: 'mit-tech-review', name: 'MIT Technology Review', site: 'technologyreview.com', feed: 'https://www.technologyreview.com/topic/artificial-intelligence/feed/' },
  { slug: 'the-rundown', name: 'The Rundown', site: 'therundown.ai', feed: 'https://www.therundown.ai/feed' },
  { slug: 'superhuman', name: 'Superhuman', site: 'superhuman.ai', sitemap: 'https://www.superhuman.ai/sitemap.xml', path: '/p/' },
  { slug: 'awa', name: 'AWA', site: 'awa-newsletter.beehiiv.com', sitemap: 'https://awa-newsletter.beehiiv.com/sitemap.xml', path: '/p/' },
  { slug: 'bens-bites', name: "Ben's Bites", site: 'bensbites.com', feed: 'https://www.bensbites.com/feed' },
  { slug: 'one-useful-thing', name: 'One Useful Thing', site: 'oneusefulthing.org', feed: 'https://www.oneusefulthing.org/feed' },
];
