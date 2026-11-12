import { describe, expect, it } from 'vitest';
import { degrees, describeWeather, forecastUrl, parseCities, parseWeather, rangePosition } from './weather';

// A real response from api.open-meteo.com for the request built by forecastUrl.
const FORECAST = {
  latitude: 4.6045694,
  longitude: -74.05252,
  timezone: 'America/Bogota',
  current_units: { time: 'iso8601', interval: 'seconds', temperature_2m: '°C', weather_code: 'wmo code', is_day: '' },
  current: { time: '2026-11-12T14:45', interval: 900, temperature_2m: 18.0, weather_code: 3, is_day: 1 },
  hourly_units: { time: 'iso8601', precipitation_probability: '%' },
  hourly: { time: ['2026-11-12T14:00', '2026-11-12T15:00'], precipitation_probability: [60, 75] },
  daily_units: { time: 'iso8601', temperature_2m_max: '°C', temperature_2m_min: '°C', sunrise: 'iso8601', sunset: 'iso8601' },
  daily: {
    time: ['2026-11-12', '2026-11-13'],
    temperature_2m_max: [18.3, 19.1],
    temperature_2m_min: [10.5, 11.2],
    sunrise: ['2026-11-12T05:50', '2026-11-13T05:50'],
    sunset: ['2026-11-12T17:41', '2026-11-13T17:41'],
  },
};

describe('forecastUrl', () => {
  it('asks for the current weather, today’s range and the sun times for two days, in the city’s own time zone', () => {
    const url = new URL(forecastUrl(4.6097, -74.0818));
    expect(url.origin + url.pathname).toBe('https://api.open-meteo.com/v1/forecast');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      latitude: '4.6097',
      longitude: '-74.0818',
      current: 'temperature_2m,weather_code,is_day',
      hourly: 'precipitation_probability',
      forecast_hours: '2',
      daily: 'temperature_2m_max,temperature_2m_min,sunrise,sunset',
      timezone: 'auto',
      forecast_days: '2',
    });
  });
});

describe('parseWeather', () => {
  it('keeps what the widget shows', () => {
    expect(parseWeather(FORECAST)).toEqual({
      temp: 18,
      code: 3,
      isDay: true,
      max: 18.3,
      min: 10.5,
      rain: 75,
      sun: [
        { sunrise: '2026-11-12T05:50', sunset: '2026-11-12T17:41' },
        { sunrise: '2026-11-13T05:50', sunset: '2026-11-13T17:41' },
      ],
    });
  });

  it('reads the night flag', () => {
    expect(parseWeather({ ...FORECAST, current: { ...FORECAST.current, is_day: 0 } })?.isDay).toBe(false);
  });

  it('still works without the daily range', () => {
    expect(parseWeather({ current: FORECAST.current })).toEqual({ temp: 18, code: 3, isDay: true, max: null, min: null, rain: null, sun: [] });
  });

  it('refuses anything that is not a forecast', () => {
    expect(parseWeather(null)).toBeNull();
    expect(parseWeather({ error: true, reason: 'Latitude must be in range of -90 to 90°' })).toBeNull();
    expect(parseWeather({ current: { temperature_2m: '18', weather_code: 3 } })).toBeNull();
  });
});

describe('rain over the next hour', () => {
  it('takes the higher chance of this hour and the next one', () => {
    expect(parseWeather({ ...FORECAST, hourly: { precipitation_probability: [94, 89] } })?.rain).toBe(94);
  });

  it('is unknown when the hourly list is missing or empty', () => {
    expect(parseWeather({ ...FORECAST, hourly: { precipitation_probability: [null, null] } })?.rain).toBeNull();
  });
});

describe('rangePosition', () => {
  it('places the current temperature between the low and the high', () => {
    expect(rangePosition(20, 12, 24)).toBeCloseTo(66.67, 1);
    expect(rangePosition(12, 12, 24)).toBe(0);
  });

  it('stays on the bar when the temperature is outside the forecast range, and centers a flat day', () => {
    expect(rangePosition(26, 12, 24)).toBe(100);
    expect(rangePosition(10, 12, 24)).toBe(0);
    expect(rangePosition(18, 18, 18)).toBe(50);
  });
});

describe('describeWeather', () => {
  it('names the usual codes in Spanish', () => {
    expect(describeWeather(0)).toEqual({ label: 'Despejado', kind: 'clear' });
    expect(describeWeather(2)).toEqual({ label: 'Parcialmente nublado', kind: 'partly' });
    expect(describeWeather(63)).toEqual({ label: 'Lluvia', kind: 'rain' });
    expect(describeWeather(95)).toEqual({ label: 'Tormenta', kind: 'storm' });
  });

  it('shows an unknown code as clouds with no label', () => {
    expect(describeWeather(42)).toEqual({ label: '', kind: 'cloudy' });
  });
});

describe('degrees', () => {
  it('rounds to whole degrees and never shows a negative zero', () => {
    expect(degrees(18.4)).toBe('18°');
    expect(degrees(17.5)).toBe('18°');
    expect(degrees(-0.2)).toBe('0°');
    expect(degrees(-3.6)).toBe('-4°');
  });
});

describe('parseCities', () => {
  it('names each place by city, region and country', () => {
    const json = {
      results: [
        { id: 1, name: 'Bogotá', latitude: 4.60971, longitude: -74.08175, country: 'Colombia', admin1: 'Bogotá D.C.' },
        { id: 2, name: 'Bogota', latitude: 40.87621, longitude: -74.02986, country: 'Estados Unidos', admin1: 'Nueva Jersey' },
      ],
    };
    expect(parseCities(json)).toEqual([
      { name: 'Bogotá, Bogotá D.C., Colombia', lat: 4.60971, lon: -74.08175 },
      { name: 'Bogota, Nueva Jersey, Estados Unidos', lat: 40.87621, lon: -74.02986 },
    ]);
  });

  it('does not repeat a part and skips places without coordinates', () => {
    const json = { results: [{ name: 'Singapur', latitude: 1.28967, longitude: 103.85007, country: 'Singapur' }, { name: 'Sin lugar' }] };
    expect(parseCities(json)).toEqual([{ name: 'Singapur', lat: 1.28967, lon: 103.85007 }]);
  });

  it('returns nothing when the search finds nothing', () => {
    expect(parseCities({ generationtime_ms: 0.3 })).toEqual([]);
  });
});
