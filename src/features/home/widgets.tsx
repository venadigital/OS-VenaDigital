// The calm row of Inicio: photo with the quote of the day, the time and the weather.
import { Link } from 'react-router-dom';
import { Skeleton } from '@/components/ui';
import { useHomePhotos, useHomeSettings, useNow } from '@/data/hooks';
import { dayMonth, hhmm, weekdayName } from '@/lib/format';
import { pickDaily, quoteSize } from './daily';
import { arcPoint, sunState } from './sun';
import { degrees, describeWeather, rangePosition, useWeather } from './weather';

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

/** The time over a sky that follows the day: the sun crosses an arc from sunrise to sunset, then the moon. */
export function ClockWidget() {
  const now = useNow(5_000);
  const settings = useHomeSettings();
  const s = settings.data;
  const weather = useWeather(s?.city_lat ?? null, s?.city_lon ?? null);
  const sky = sunState(now, weather.data?.sun);
  const orb = arcPoint(sky.t);
  const label = sky.next && `${sky.next.kind === 'sunset' ? 'Atardece' : 'Amanece'} ${hhmm(sky.next.at)}`;

  return (
    <section className={`widget widget-clock is-${sky.phase}`} aria-label="Hora">
      <div className="widget-clock-date">
        <strong>{weekdayName(now)}</strong>
        <span>{dayMonth(now)}</span>
      </div>
      <div className="sun-arc" aria-hidden="true">
        <svg viewBox="0 0 232 124" preserveAspectRatio="none">
          <path d="M 8 116 A 108 108 0 0 1 224 116" />
          <line x1="0" y1="116" x2="232" y2="116" />
        </svg>
        <span className={sky.isDay ? 'sun-orb' : 'sun-orb is-moon'} style={{ left: `${orb.x}%`, top: `${orb.y}%` }}>
          <i />
        </span>
      </div>
      <div className="widget-clock-time">
        <time className="tnum" dateTime={now.toISOString()}>
          {hhmm(now)}
        </time>
        {label && <span>{label}</span>}
      </div>
    </section>
  );
}

/** Today's low-to-high bar with the current temperature on it, and the chance of rain. */
export function WeatherWidget() {
  const settings = useHomeSettings();
  const s = settings.data;
  const hasCity = s != null && s.city_lat != null && s.city_lon != null;
  const weather = useWeather(hasCity ? s.city_lat : null, hasCity ? s.city_lon : null);
  // "Bogotá, Bogotá D.C., Colombia" → "Bogotá"
  const city = s?.city_name?.split(',')[0].trim() || 'Clima';
  const w = weather.data;
  const label = w ? describeWeather(w.code).label : '';

  return (
    <section className="widget widget-weather" aria-label="Clima">
      <div className="widget-weather-top">
        <span>{city}</span>
        {label && <small>{label}</small>}
      </div>
      {settings.isLoading || (hasCity && weather.isLoading) ? (
        <Skeleton className="h-24" />
      ) : !hasCity ? (
        <Link to="/ajustes" className="text-link">
          Elige tu ciudad
        </Link>
      ) : !w ? (
        <p className="widget-weather-off">Sin datos del clima por ahora.</p>
      ) : (
        <>
          <div className="widget-weather-temp">{degrees(w.temp)}</div>
          {w.max != null && w.min != null && (
            <div className="weather-range">
              <div className="weather-range-bar">
                <span className="weather-range-mark" style={{ left: `${rangePosition(w.temp, w.min, w.max)}%` }}>
                  <i />
                </span>
              </div>
              <div className="weather-range-ends">
                <span>Mín {degrees(w.min)}</span>
                <span>Máx {degrees(w.max)}</span>
              </div>
            </div>
          )}
          {w.rain != null && (
            <div className="weather-rain">
              <svg aria-hidden="true" width="14" height="16" viewBox="0 0 14 16">
                <path d="M7 1C4.5 5 2 7.6 2 10.2a5 5 0 0 0 10 0C12 7.6 9.5 5 7 1z" />
              </svg>
              Lluvia {w.rain} % en la próxima hora
            </div>
          )}
        </>
      )}
    </section>
  );
}
