// ═══════════════════════════════════════════
// BitWet — API URL helpers
// ═══════════════════════════════════════════
// On web (Vercel), calls go through Next.js Route Handlers (/api/*).
// On iOS (Capacitor static export), Route Handlers are unavailable,
// so calls go directly to Open-Meteo APIs.

import { getPlatform } from './platform';

const OPEN_METEO_BASE = 'https://api.open-meteo.com/v1/forecast';
const GEOCODING_BASE = 'https://geocoding-api.open-meteo.com/v1/search';

const HOURLY_VARS = [
  'precipitation',
  'wind_direction_10m',
  'weather_code',
  'temperature_2m',
  'wind_speed_10m',
  'wind_gusts_10m',
].join(',');

const DAILY_VARS = [
  'temperature_2m_max',
  'temperature_2m_min',
  'precipitation_sum',
  'precipitation_probability_max',
  'wind_speed_10m_max',
  'wind_gusts_10m_max',
  'weather_code',
  'sunshine_duration',
  'uv_index_max',
].join(',');

function buildOpenMeteoUrl(lat: number, lon: number, forecastDays: number, model: string): string {
  return (
    `${OPEN_METEO_BASE}?latitude=${lat}&longitude=${lon}` +
    `&hourly=${HOURLY_VARS}&daily=${DAILY_VARS}` +
    `&timezone=auto&past_days=2` +
    `&forecast_days=${forecastDays}&models=${model}`
  );
}

/**
 * Returns true when running inside a Capacitor native shell
 * (i.e. the static-exported build), so API calls must go direct.
 */
function isNativeApp(): boolean {
  return getPlatform() === 'ios';
}

/** Fetch forecast — routes through /api on web, direct on iOS */
export async function fetchForecastApi(
  lat: number,
  lon: number,
): Promise<{ best: unknown; ecmwf: unknown }> {
  if (!isNativeApp()) {
    // Web: use Next.js route handler
    const res = await fetch(`/api/forecast?lat=${lat}&lon=${lon}`);
    if (!res.ok) throw new Error(`Forecast API ${res.status}`);
    return res.json();
  }

  // iOS: call Open-Meteo directly
  const ch2Url = buildOpenMeteoUrl(lat, lon, 5, 'meteoswiss_icon_ch2');
  const ecmwfUrl = buildOpenMeteoUrl(lat, lon, 7, 'ecmwf_ifs');

  const [ch2Result, ecmwfResult] = await Promise.allSettled([
    fetch(ch2Url).then(async (res) => {
      if (!res.ok) return null;
      const data = await res.json();
      return data.error ? null : data;
    }),
    fetch(ecmwfUrl).then(async (res) => {
      if (!res.ok) return null;
      const data = await res.json();
      return data.error ? null : data;
    }),
  ]);

  return {
    best: ch2Result.status === 'fulfilled' ? ch2Result.value : null,
    ecmwf: ecmwfResult.status === 'fulfilled' ? ecmwfResult.value : null,
  };
}

/** Geocode a query — routes through /api on web, direct on iOS */
export async function fetchGeocodeApi(
  q: string,
): Promise<{ results: Array<{ lat: number; lon: number; name: string }> }> {
  if (!isNativeApp()) {
    const res = await fetch(`/api/geocode?q=${encodeURIComponent(q)}`);
    if (!res.ok) return { results: [] };
    return res.json();
  }

  // iOS: direct geocoding
  const trimmed = q.trim();

  // Try parsing as coordinates
  const parts = trimmed.split(/[,\s]+/).map(Number);
  if (
    parts.length >= 2 &&
    !isNaN(parts[0]) &&
    !isNaN(parts[1]) &&
    Math.abs(parts[0]) <= 90 &&
    Math.abs(parts[1]) <= 180
  ) {
    return { results: [{ lat: parts[0], lon: parts[1], name: trimmed }] };
  }

  try {
    const url = `${GEOCODING_BASE}?name=${encodeURIComponent(trimmed)}&count=1&language=en&format=json`;
    const res = await fetch(url);
    if (!res.ok) return { results: [] };

    const data = await res.json();
    if (!data.results?.length) return { results: [] };

    return {
      results: data.results.map(
        (r: { latitude: number; longitude: number; name: string }) => ({
          lat: r.latitude,
          lon: r.longitude,
          name: r.name,
        }),
      ),
    };
  } catch {
    return { results: [] };
  }
}
