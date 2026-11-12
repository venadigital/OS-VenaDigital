// The calm row of Inicio: photo with the quote of the day, the time and the weather.
import { Link } from 'react-router-dom';
import { Cloud, CloudDrizzle, CloudFog, CloudLightning, CloudMoon, CloudRain, CloudSnow, CloudSun, Moon, Sun, type LucideIcon } from 'lucide-react';
import { Skeleton } from '@/components/ui';
import { useHomePhotos, useHomeSettings, useNow } from '@/data/hooks';
import { dayMonth, hhmm, weekdayName } from '@/lib/format';
import { pickDaily, quoteSize } from './daily';
import { degrees, describeWeather, useWeather, type WeatherKind } from './weather';

export function PhotoWidget({ now }: { now: Date }) {
  const settings = useHomeSettings();
  const path = pickDaily(settings.data?.photos ?? [], now);
  const urls = useHomePhotos(path ? [path] : []);
  const url = path ? urls.data?.[path] : undefined;
  const quote = pickDaily(settings.data?.quotes ?? [], now);
  // Wait for the person's own photo instead of flashing the drawn landscape first.
  const waiting = settings.isLoading || Boolean(path && urls.isLoading);
  const empty = !waiting && !path && !quote;

  return (
    <figure className={`widget widget-photo${quote ? ' has-quote' : ''}`}>
      {!waiting && (url ? <img src={url} alt="" /> : <Landscape />)}
      {quote && (
        <>
          <blockquote data-size={quoteSize(quote.text)}>{quote.text}</blockquote>
          {quote.author && <figcaption>{quote.author}</figcaption>}
        </>
      )}
      {empty && (
        <Link to="/ajustes" className="widget-photo-hint">
          Elige tus fotos y frases
        </Link>
      )}
    </figure>
  );
}

/** Drawn stand-in shown until the person adds photos of their own. */
function Landscape() {
  return (
    <div className="widget-landscape" aria-hidden="true">
      <i />
      <svg viewBox="0 0 800 300" preserveAspectRatio="none">
        <path d="M0 120 C 120 70, 240 60, 360 100 S 600 150, 800 80 V300 H0 Z" fill="#b9835c" />
        <path d="M0 170 C 140 130, 300 180, 440 150 S 680 100, 800 140 V300 H0 Z" fill="#8f5836" />
        <path d="M0 220 C 180 180, 330 250, 520 210 S 720 190, 800 215 V300 H0 Z" fill="#5f3823" />
        <path d="M0 268 C 200 240, 420 290, 800 250 V300 H0 Z" fill="#33200f" />
      </svg>
    </div>
  );
}

export function ClockWidget() {
  const now = useNow(5_000);
  return (
    <section className="widget widget-clock" aria-label="Hora">
      <div className="widget-clock-date">
        <strong>{weekdayName(now)}</strong>
        <span>{dayMonth(now)}</span>
      </div>
      <time className="tnum" dateTime={now.toISOString()}>
        {hhmm(now)}
      </time>
    </section>
  );
}

const ICONS: Record<WeatherKind, LucideIcon> = {
  clear: Sun,
  partly: CloudSun,
  cloudy: Cloud,
  fog: CloudFog,
  drizzle: CloudDrizzle,
  rain: CloudRain,
  snow: CloudSnow,
  storm: CloudLightning,
};
const NIGHT_ICONS: Partial<Record<WeatherKind, LucideIcon>> = { clear: Moon, partly: CloudMoon };

export function WeatherWidget() {
  const settings = useHomeSettings();
  const s = settings.data;
  const hasCity = s != null && s.city_lat != null && s.city_lon != null;
  const weather = useWeather(hasCity ? s.city_lat : null, hasCity ? s.city_lon : null);
  // "Bogotá, Bogotá D.C., Colombia" → "Bogotá"
  const city = s?.city_name?.split(',')[0].trim() || 'Clima';
  const w = weather.data;
  const { label, kind } = describeWeather(w?.code ?? -1);
  const Icon = (w && !w.isDay && NIGHT_ICONS[kind]) || ICONS[kind];

  return (
    <section className="widget widget-weather" aria-label="Clima">
      {settings.isLoading ? (
        <Skeleton className="h-full min-h-24" />
      ) : !hasCity ? (
        <>
          <div className="widget-weather-top">
            <span>Clima</span>
            <Sun size={24} strokeWidth={1.75} aria-hidden="true" />
          </div>
          <Link to="/ajustes" className="text-link">
            Elige tu ciudad
          </Link>
        </>
      ) : (
        <>
          <div className="widget-weather-top">
            <span>{city}</span>
            {w && <Icon size={24} strokeWidth={1.75} aria-hidden="true" />}
          </div>
          {w ? (
            <div>
              <div className="widget-weather-temp">{degrees(w.temp)}</div>
              <div className="widget-weather-now">
                {label}
                {w.max != null && w.min != null && (
                  <small>
                    Máx {degrees(w.max)} · Mín {degrees(w.min)}
                  </small>
                )}
              </div>
            </div>
          ) : weather.isLoading ? (
            <Skeleton className="h-20" />
          ) : (
            <p className="widget-weather-off">Sin datos del clima por ahora.</p>
          )}
        </>
      )}
    </section>
  );
}
