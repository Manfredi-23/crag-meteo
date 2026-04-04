'use client';

import React from 'react';
import type { Crag, Forecast, BlendedScoreResult } from '@/lib/types';
import {
  blendedScore,
  getScoreLabel,
  getTimeSlots,
  getDayTrend,
  estimateRockTemp,
  frictionLabel,
  dryingLabel,
  dryingClass,
  windDirLabel,
} from '@/lib/scoring';

interface DayDetailProps {
  forecast: Forecast;
  dayIndex: number;
  crag: Crag;
}

/** Extract single day from daily arrays */
function extractDay(src: NonNullable<Forecast['best']>, i: number) {
  return {
    precipitation_sum: src.daily.precipitation_sum[i],
    precipitation_probability_max: src.daily.precipitation_probability_max[i],
    temperature_2m_min: src.daily.temperature_2m_min[i],
    temperature_2m_max: src.daily.temperature_2m_max[i],
    wind_speed_10m_max: src.daily.wind_speed_10m_max[i],
    wind_gusts_10m_max: src.daily.wind_gusts_10m_max[i],
    sunshine_duration: src.daily.sunshine_duration?.[i],
    uv_index_max: src.daily.uv_index_max?.[i],
  };
}

export default function DayDetail({ forecast, dayIndex, crag }: DayDetailProps) {
  const src = forecast.best || forecast.ecmwf;
  if (!src?.daily?.time[dayIndex]) return null;

  const dd = extractDay(src, dayIndex);
  const bl: BlendedScoreResult = blendedScore(forecast, dayIndex, crag);

  const p = dd.precipitation_sum || 0;
  const pp = dd.precipitation_probability_max || 0;
  const w = dd.wind_speed_10m_max || 0;
  const g = dd.wind_gusts_10m_max || 0;
  const sh = dd.sunshine_duration ? (dd.sunshine_duration / 3600).toFixed(1) : '—';
  const uv = dd.uv_index_max != null ? dd.uv_index_max.toFixed(0) : '—';
  const wc = g > 50 ? 'bad' : g > 35 || w > 25 ? 'warn' : '';
  const rc = p > 0.5 ? 'rain' : '';

  const dl = new Date(src.daily.time[dayIndex] + 'T00:00:00').toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  });

  const slots = getTimeSlots(forecast, dayIndex, crag);
  const trend = getDayTrend(slots);
  const trendClass = trend === 'Improving' ? 'improving' : trend === 'Getting worse' ? 'worsening' : '';
  const rockTemp = estimateRockTemp(forecast, dayIndex, crag);
  const friction = frictionLabel(rockTemp);
  const streakLabel = bl.dryStreak >= 2 ? `${bl.dryStreak} days dry` : '';

  return (
    <div className="detail-panel">
      <div className="detail-header">
        <span className="detail-date">{dl}</span>
      </div>
      <div className="detail-verdict">{getScoreLabel(bl.score)}</div>

      {slots && (
        <div className="detail-times">
          {slots.map((sl) => (
            <div key={sl.label} className="detail-time-row">
              <span className="detail-time-label">{sl.label}</span>
              <span className="detail-time-wx">
                {sl.wx} <span className="detail-time-score">({sl.score})</span>
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="detail-stats">
        <div className="detail-stat">
          <div className="detail-stat-label">Wind</div>
          <div className={`detail-stat-val ${wc}`}>{Math.round(w)} Km/h</div>
        </div>
        <div className="detail-stat">
          <div className="detail-stat-label">Wind Dir.</div>
          <div className="detail-stat-val">
            {bl.windDeg != null ? `${bl.windDeg}° (${windDirLabel(bl.windDeg)})` : '—'}
          </div>
        </div>
        <div className="detail-stat">
          <div className="detail-stat-label">Shelter</div>
          <div
            className={`detail-stat-val ${
              bl.windShelter?.label === 'Exposed'
                ? 'bad'
                : bl.windShelter?.label === 'Crosswind'
                  ? 'warn'
                  : ''
            }`}
          >
            {bl.windShelter?.label || '—'}
          </div>
        </div>
        <div className="detail-stat">
          <div className="detail-stat-label">Temperature</div>
          <div className="detail-stat-val">
            {dd.temperature_2m_min != null ? Math.round(dd.temperature_2m_min) : '?'}° /{' '}
            {dd.temperature_2m_max != null ? Math.round(dd.temperature_2m_max) : '?'}°
          </div>
        </div>
        <div className="detail-stat">
          <div className="detail-stat-label">UV Index</div>
          <div className="detail-stat-val">{uv}</div>
        </div>
        <div className="detail-stat">
          <div className="detail-stat-label">Sunshine</div>
          <div className="detail-stat-val">{sh} h</div>
        </div>
        <div className="detail-stat">
          <div className="detail-stat-label">Rain</div>
          <div className={`detail-stat-val ${rc}`}>
            {p.toFixed(1)}mm ({pp}%)
          </div>
        </div>
        <div className="detail-stat">
          <div className="detail-stat-label">Drying</div>
          <div className={`detail-stat-val ${dryingClass(bl.dryHours)}`}>
            {dryingLabel(bl.dryHours)}
            {streakLabel ? ' · ' + streakLabel : ''}
          </div>
        </div>
        <div className="detail-stat">
          <div className="detail-stat-label">Rock ~</div>
          <div className={`detail-stat-val ${friction.cls}`}>
            {rockTemp != null ? `~${rockTemp}°` : '—'}
          </div>
        </div>
      </div>

      <div className={`detail-trend ${trendClass}`}>{trend}</div>

      {bl.sB != null && bl.sE != null && (
        <div className="model-row">
          <div className="model-box">
            <strong>MeteoSwiss CH2</strong>
            Score: {bl.sB}
          </div>
          <div className="model-box">
            <strong>ECMWF IFS</strong>
            Score: {bl.sE}
          </div>
        </div>
      )}
    </div>
  );
}
