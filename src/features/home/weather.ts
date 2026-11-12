// Weather for Inicio, straight from Open-Meteo (free, no key): the forecast for the
// saved city and the city search used in Ajustes.
import { useQuery } from '@tanstack/react-query';

const FORECAST = 'https://api.open-meteo.com/v1/forecast';
const GEOCODING = 'https://geocoding-api.open-meteo.com/v1/search';

export type Weather = {
  temp: number;
  /** WMO weather code. */
  code: number;
  isDay: boolean;
  max: number | null;
  min: number | null;
  /** Local times ("2026-11-12T05:50") for today and tomorrow, in the city's time zone. */
  sun: { sunrise: string; sunset: string }[];
};

export type WeatherKind = 'clear' | 'partly' | 'cloudy' | 'fog' | 'drizzle' | 'rain' | 'snow' | 'storm';

export type City = { name: string; lat: number; lon: number };

export function forecastUrl(lat: number, lon: number): string {
  const q = new URLSearchParams({
    latitude: lat.toFixed(4),
    longitude: lon.toFixed(4),
    current: 'temperature_2m,weather_code,is_day',
    daily: 'temperature_2m_max,temperature_2m_min,sunrise,sunset',
    timezone: 'auto',
    forecast_days: '2',
  });
  return `${FORECAST}?${q}`;
}

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** The forecast response reduced to what the widget shows; null when it is not a forecast. */
export function parseWeather(json: unknown): Weather | null {
  const body = json as { current?: Record<string, unknown>; daily?: Record<string, unknown> } | null;
  const current = body?.current;
  if (!current || !finite(current.temperature_2m) || !finite(current.weather_code)) return null;
  const first = (v: unknown) => (Array.isArray(v) && finite(v[0]) ? v[0] : null);
  return {
    temp: current.temperature_2m,
    code: current.weather_code,
    isDay: current.is_day !== 0,
    max: first(body?.daily?.temperature_2m_max),
    min: first(body?.daily?.temperature_2m_min),
    sun: sunTimes(body?.daily?.sunrise, body?.daily?.sunset),
  };
}

function sunTimes(rises: unknown, sets: unknown): Weather['sun'] {
  if (!Array.isArray(rises) || !Array.isArray(sets)) return [];
  const out: Weather['sun'] = [];
  for (let i = 0; i < Math.min(rises.length, sets.length); i++) {
    if (typeof rises[i] === 'string' && typeof sets[i] === 'string') out.push({ sunrise: rises[i], sunset: sets[i] });
  }
  return out;
}

const CODES: Record<number, [label: string, kind: WeatherKind]> = {
  0: ['Despejado', 'clear'],
  1: ['Mayormente despejado', 'clear'],
  2: ['Parcialmente nublado', 'partly'],
  3: ['Nublado', 'cloudy'],
  45: ['Niebla', 'fog'],
  48: ['Niebla con escarcha', 'fog'],
  51: ['Llovizna ligera', 'drizzle'],
  53: ['Llovizna', 'drizzle'],
  55: ['Llovizna intensa', 'drizzle'],
  56: ['Llovizna helada', 'drizzle'],
  57: ['Llovizna helada', 'drizzle'],
  61: ['Lluvia ligera', 'rain'],
  63: ['Lluvia', 'rain'],
  65: ['Lluvia fuerte', 'rain'],
  66: ['Lluvia helada', 'rain'],
  67: ['Lluvia helada', 'rain'],
  71: ['Nevada ligera', 'snow'],
  73: ['Nevada', 'snow'],
  75: ['Nevada fuerte', 'snow'],
  77: ['Nieve granulada', 'snow'],
  80: ['Chubascos ligeros', 'rain'],
  81: ['Chubascos', 'rain'],
  82: ['Chubascos fuertes', 'rain'],
  85: ['Chubascos de nieve', 'snow'],
  86: ['Chubascos de nieve', 'snow'],
  95: ['Tormenta', 'storm'],
  96: ['Tormenta con granizo', 'storm'],
  97: ['Tormenta fuerte', 'storm'],
  99: ['Tormenta con granizo', 'storm'],
};

/** Spanish label and icon family for a WMO code; unknown codes read as cloudy with no label. */
export function describeWeather(code: number): { label: string; kind: WeatherKind } {
  const [label, kind] = CODES[code] ?? ['', 'cloudy'];
  return { label, kind };
}

/** "18°": whole degrees, never "-0". */
export function degrees(value: number): string {
  const n = Math.round(value);
  return `${n === 0 ? 0 : n}°`;
}

export function useWeather(lat: number | null, lon: number | null) {
  return useQuery({
    queryKey: ['weather', lat, lon],
    enabled: lat != null && lon != null,
    queryFn: async () => {
      const res = await fetch(forecastUrl(lat as number, lon as number));
      if (!res.ok) throw new Error(`Open-Meteo respondió ${res.status}`);
      const weather = parseWeather(await res.json());
      if (!weather) throw new Error('Open-Meteo respondió algo inesperado');
      return weather;
    },
    staleTime: 15 * 60_000,
    refetchInterval: 30 * 60_000,
    retry: 1,
  });
}

type Place = { name?: unknown; latitude?: unknown; longitude?: unknown; admin1?: unknown; country?: unknown };

/** Search results as cities, named "Ciudad, Región, País" without repeating a part. */
export function parseCities(json: unknown): City[] {
  const results = (json as { results?: Place[] } | null)?.results;
  if (!Array.isArray(results)) return [];
  const cities: City[] = [];
  for (const r of results) {
    if (typeof r.name !== 'string' || !finite(r.latitude) || !finite(r.longitude)) continue;
    const parts: string[] = [];
    for (const part of [r.name, r.admin1, r.country]) if (typeof part === 'string' && part && !parts.includes(part)) parts.push(part);
    cities.push({ name: parts.join(', '), lat: r.latitude, lon: r.longitude });
  }
  return cities;
}

export async function searchCities(name: string): Promise<City[]> {
  const q = new URLSearchParams({ name: name.trim(), count: '6', language: 'es', format: 'json' });
  const res = await fetch(`${GEOCODING}?${q}`);
  if (!res.ok) throw new Error(`Open-Meteo respondió ${res.status}`);
  return parseCities(await res.json());
}
