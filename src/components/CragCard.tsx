'use client';

import React, { useState, useCallback, useEffect, useRef } from 'react';
import type { Crag, Forecast, BlendedScoreResult } from '@/lib/types';
import { scorePillClass } from '@/lib/constants';
import { blendedScore, wxLabel, confTag } from '@/lib/scoring';
import WeatherIcon from '@/components/WeatherIcon';
import { useUIStore } from '@/stores/uiStore';
import DayDetail from '@/components/DayDetail';

interface CragCardProps {
  crag: Crag;
  forecast: Forecast | undefined;
  /** Index for staggered card-in animation */
  index?: number;
  onEdit?: (cragId: string) => void;
  onRemove?: (cragId: string) => void;
}

/** Extract single day from daily arrays */
function extractDay(src: NonNullable<Forecast['best']>, i: number) {
  return {
    weather_code: src.daily.weather_code[i],
    temperature_2m_min: src.daily.temperature_2m_min[i],
    temperature_2m_max: src.daily.temperature_2m_max[i],
  };
}

export default function CragCard({ crag, forecast, index = 0, onEdit, onRemove }: CragCardProps) {
  const toggleDayExpanded = useUIStore((s) => s.toggleDayExpanded);
  const expandedDayIdx = useUIStore((s) => s.expandedDays[crag.id]);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu on outside click
  useEffect(() => {
    if (!menuOpen) return;
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, [menuOpen]);

  const handleToggleMenu = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setMenuOpen((prev) => !prev);
  }, []);

  const handleEdit = useCallback(() => {
    setMenuOpen(false);
    onEdit?.(crag.id);
  }, [crag.id, onEdit]);

  const handleRemove = useCallback(() => {
    setMenuOpen(false);
    onRemove?.(crag.id);
  }, [crag.id, onRemove]);

  const handleDayClick = useCallback((dayIdx: number) => {
    toggleDayExpanded(crag.id, dayIdx);
  }, [crag.id, toggleDayExpanded]);

  // Meta info
  const metaParts = [
    crag.region,
    crag.alt ? crag.alt + 'm' : '',
    crag.rock,
    crag.orientation?.length ? crag.orientation.join(' · ') : '',
  ].filter(Boolean);

  // Forecast rendering
  const src = forecast ? (forecast.best || forecast.ecmwf) : null;
  const todayStr = new Date().toISOString().slice(0, 10);

  let forecastContent: React.ReactNode;
  if (!forecast) {
    forecastContent = <div className="card-loading">fetching forecast</div>;
  } else if (!src?.daily) {
    forecastContent = <div className="card-loading">no data available</div>;
  } else {
    const days = src.daily.time.map((ds, di) => {
      if (ds < todayStr) return null;
      const dd = extractDay(src, di);
      const bl: BlendedScoreResult = blendedScore(forecast, di, crag);
      const dayName = new Date(ds + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short' });
      const dayNum = new Date(ds + 'T00:00:00').getDate();
      const isSelected = expandedDayIdx === di;
      const isFaded = expandedDayIdx != null && !isSelected;
      const conf = confTag(bl.confidence);

      return (
        <div
          key={ds}
          className={`fday${isSelected ? ' selected' : ''}${isFaded ? ' faded' : ''}`}
          onClick={() => handleDayClick(di)}
        >
          <div className="fday-name">{dayName} {dayNum}</div>
          <div className="fday-icon">
            <WeatherIcon weatherCode={dd.weather_code} />
          </div>
          <div className="fday-wx-label">{wxLabel(dd.weather_code)}</div>
          <div className="fday-temp">
            [ {dd.temperature_2m_min != null ? Math.round(dd.temperature_2m_min) : '?'}° / {dd.temperature_2m_max != null ? Math.round(dd.temperature_2m_max) : '?'}° ]
          </div>
          <div className={`score-pill ${scorePillClass(bl.score)}`}>{bl.score}</div>
          {conf && <div className="conf-tag">{conf}</div>}
        </div>
      );
    });

    forecastContent = (
      <div className="forecast-area">
        <div className="forecast-scroll">
          <div className="forecast-track">{days}</div>
        </div>
        {expandedDayIdx != null && src.daily.time[expandedDayIdx] && (
          <DayDetail forecast={forecast} dayIndex={expandedDayIdx} crag={crag} />
        )}
      </div>
    );
  }

  return (
    <div className="crag-card" style={{ animationDelay: `${index * 0.06}s` }}>
      <div className="card-head">
        <div className="card-head-row">
          <div className="crag-name">{crag.name}</div>
          <div className="meta-pipe">
            {metaParts.map((m, i) => (
              <span key={i}>{m}</span>
            ))}
          </div>
          <div className="card-actions" ref={menuRef}>
            <button
              className="card-overflow"
              onClick={handleToggleMenu}
              aria-label="Options"
            >
              ···
            </button>
            <div className={`card-menu${menuOpen ? ' open' : ''}`}>
              <button onClick={handleEdit}>Edit crag</button>
              <button className="card-menu-danger" onClick={handleRemove}>Remove</button>
            </div>
          </div>
        </div>
      </div>
      <hr className="card-hr" />
      {crag.notes && <div className="card-notes">{crag.notes}</div>}
      {forecastContent}
    </div>
  );
}
