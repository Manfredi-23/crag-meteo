import { NextRequest, NextResponse } from 'next/server';

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

const BASE = 'https://api.open-meteo.com/v1/forecast';

function buildUrl(
  lat: string,
  lon: string,
  forecastDays: number,
  model: string,
): string {
  return (
    `${BASE}?latitude=${lat}&longitude=${lon}` +
    `&hourly=${HOURLY_VARS}&daily=${DAILY_VARS}` +
    `&timezone=auto&past_days=2` +
    `&forecast_days=${forecastDays}&models=${model}`
  );
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const lat = searchParams.get('lat');
  const lon = searchParams.get('lon');

  if (!lat || !lon) {
    return NextResponse.json(
      { error: 'lat and lon query parameters are required' },
      { status: 400 },
    );
  }

  const ch2Url = buildUrl(lat, lon, 5, 'meteoswiss_icon_ch2');
  const ecmwfUrl = buildUrl(lat, lon, 7, 'ecmwf_ifs');

  const [ch2Result, ecmwfResult] = await Promise.allSettled([
    fetch(ch2Url).then(async (res) => {
      if (!res.ok) return null;
      const data = await res.json();
      if (data.error) return null;
      return data;
    }),
    fetch(ecmwfUrl).then(async (res) => {
      if (!res.ok) return null;
      const data = await res.json();
      if (data.error) return null;
      return data;
    }),
  ]);

  const best =
    ch2Result.status === 'fulfilled' ? ch2Result.value : null;
  const ecmwf =
    ecmwfResult.status === 'fulfilled' ? ecmwfResult.value : null;

  return NextResponse.json({ best, ecmwf });
}
