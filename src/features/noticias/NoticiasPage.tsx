import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Newspaper, TriangleAlert } from 'lucide-react';
import { Page, PageHeader } from '@/components/Shell';
import { Button, Empty, Select, Skeleton } from '@/components/ui';
import { useNews, useNewsSources, useNow } from '@/data/hooks';
import type { NewsItem, NewsSource } from '@/data/types';
import { ago, groupByDay, lastUpdate, staleSources } from './model';
import './noticias.css';

const PAGE_SIZE = 100;
const SOURCE_PARAM = 'fuente';

export function NoticiasPage() {
  const [params, setParams] = useSearchParams();
  const source = params.get(SOURCE_PARAM);
  const [limit, setLimit] = useState(PAGE_SIZE);
  const newsQ = useNews(source, limit);
  const sourcesQ = useNewsSources();
  const now = useNow(60_000);

  const sources = useMemo(() => sourcesQ.data ?? [], [sourcesQ.data]);
  const bySlug = useMemo(() => new Map(sources.map((s) => [s.slug, s])), [sources]);
  const items = useMemo(() => newsQ.data ?? [], [newsQ.data]);
  const days = useMemo(() => groupByDay(items, now), [items, now]);
  const updated = lastUpdate(sources);
  const stale = staleSources(sources, now);

  const pick = (slug: string) => {
    setLimit(PAGE_SIZE);
    setParams(slug ? { [SOURCE_PARAM]: slug } : {}, { replace: true });
  };

  return (
    <Page>
      <PageHeader eyebrow={updated ? `Actualizado ${ago(updated, now)}` : undefined} title="Noticias" />
      <div className="collection-toolbar">
        <div className="w-full sm:w-60">
          <Select aria-label="Filtrar por fuente" value={source ?? ''} onChange={(e) => pick(e.target.value)} className="h-[34px] rounded-lg text-[13.5px]">
            <option value="">Todas las fuentes</option>
            {sources.map((s) => (
              <option key={s.slug} value={s.slug}>
                {s.name}
              </option>
            ))}
          </Select>
        </div>
        {stale.length > 0 && (
          <span className="news-stale" title={stale.map((s) => `${s.name}: ${s.last_error}`).join('\n')}>
            <TriangleAlert size={14} />
            Sin actualizar: {stale.map((s) => s.name).join(', ')}
          </span>
        )}
      </div>

      {newsQ.isLoading ? (
        <div className="news-grid">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-[124px] rounded-[14px]" />
          ))}
        </div>
      ) : newsQ.isError ? (
        <Empty icon={<Newspaper size={28} />} title="No se pudieron cargar las noticias" action={<Button onClick={() => void newsQ.refetch()}>Reintentar</Button>} />
      ) : items.length === 0 ? (
        <Empty
          icon={<Newspaper size={28} />}
          title={source ? 'Esta fuente no tiene noticias recientes' : 'Aún no hay noticias'}
          action={source ? <Button onClick={() => pick('')}>Ver todas</Button> : undefined}
        />
      ) : (
        <>
          {days.map((day) => (
            <section key={day.key} className="news-day" aria-label={day.label}>
              <h2 className="section-title">{day.label}</h2>
              <div className="news-grid">
                {day.items.map((item) => (
                  <NewsCard key={item.id} item={item} source={bySlug.get(item.source)} showAge={day.label === 'Hoy'} now={now} />
                ))}
              </div>
            </section>
          ))}
          {items.length >= limit && (
            <div className="flex justify-center">
              <Button disabled={newsQ.isFetching} onClick={() => setLimit((n) => n + PAGE_SIZE)}>
                {newsQ.isFetching ? 'Cargando…' : 'Ver más'}
              </Button>
            </div>
          )}
        </>
      )}
    </Page>
  );
}

function NewsCard({ item, source, showAge, now }: { item: NewsItem; source: NewsSource | undefined; showAge: boolean; now: Date }) {
  return (
    <a href={item.url} target="_blank" rel="noopener noreferrer" className="news-card">
      <NewsThumb image={item.image_url} source={source} />
      <div className="news-card-body">
        <h3 className="news-card-title">{item.title}</h3>
        {item.summary && <p className="news-card-summary">{item.summary}</p>}
        <div className="news-card-meta">
          <span className="truncate">{source?.name ?? item.source}</span>
          {showAge && (
            <>
              <span aria-hidden>·</span>
              <span className="shrink-0">{ago(new Date(item.published_at), now)}</span>
            </>
          )}
        </div>
      </div>
    </a>
  );
}

/** The article's picture; if it has none or it won't load, the logo of the source. */
function NewsThumb({ image, source }: { image: string | null; source: NewsSource | undefined }) {
  const [failed, setFailed] = useState<'image' | 'logo' | null>(null);
  const initial = (source?.name ?? '?').slice(0, 1).toUpperCase();

  if (image && !failed) {
    return (
      <span className="news-thumb">
        <img src={image} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setFailed('image')} />
      </span>
    );
  }
  return (
    <span className="news-thumb news-thumb--logo" aria-hidden>
      {source && failed !== 'logo' ? (
        <img src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(source.site)}&sz=128`} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed('logo')} />
      ) : (
        initial
      )}
    </span>
  );
}
