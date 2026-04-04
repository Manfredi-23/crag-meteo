'use client';

import { useState, useCallback } from 'react';
import type { Crag, Forecast, ModelForecast } from '@/lib/types';
import type { PlannerFilters } from './PlannerForm';
import { useCragStore } from '@/stores/cragStore';
import { useForecastStore } from '@/stores/forecastStore';
import { ALL_EXPLORE_CRAGS } from '@/data/crags';
import { blendedScore, wxLabel } from '@/lib/scoring';
import { getScoreLabel, scorePillClass } from '@/lib/constants';
import WeatherIcon from '@/components/WeatherIcon';
import { fetchGeocodeApi } from '@/lib/api';

// ─── Haversine distance (km) ───
function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ─── Extract single day from daily arrays ───
function extractDay(fc: ModelForecast, i: number) {
  return {
    temperature_2m_max: fc.daily.temperature_2m_max[i],
    temperature_2m_min: fc.daily.temperature_2m_min[i],
    weather_code: fc.daily.weather_code[i],
  };
}

interface ScoredResult {
  crag: Crag;
  fc: Forecast;
  bestScore: number;
  bestDay: string;
  avgScore: number;
  dist: number | null;
  sortKey: number;
}

interface PlannerResultsProps {
  filters: PlannerFilters | null;
  searching: boolean;
  setSearching: (v: boolean) => void;
}

export default function PlannerResults({ filters, searching, setSearching }: PlannerResultsProps) {
  const [results, setResults] = useState<ScoredResult[] | null>(null);
  const [progress, setProgress] = useState('');
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);
  const [searchDone, setSearchDone] = useState(false);

  const runSearch = useCallback(async (f: PlannerFilters) => {
    setSearching(true);
    setResults(null);
    setExpandedIdx(null);
    setSearchDone(false);
    setProgress('Searching crags');

    // Parse location
    let homeLoc: { lat: number; lon: number } | null = null;
    if (f.location.trim()) {
      try {
        const data = await fetchGeocodeApi(f.location.trim());
        if (data.results && data.results.length > 0) {
          homeLoc = { lat: data.results[0].lat, lon: data.results[0].lon };
        }
      } catch { /* ignore - distance just won't show */ }
    }

    if (f.selectedDays.length === 0) {
      setProgress('');
      setResults([]);
      setSearching(false);
      setSearchDone(true);
      return;
    }

    // Get candidates based on source
    const usualsCrags = useCragStore.getState().crags;
    let candidates: Crag[];
    if (f.source === 'usuals') {
      candidates = usualsCrags;
    } else if (f.source === 'explore') {
      candidates = ALL_EXPLORE_CRAGS;
    } else {
      // Deduplicate by id
      const seen = new Set(usualsCrags.map(c => c.id));
      candidates = [...usualsCrags, ...ALL_EXPLORE_CRAGS.filter(c => !seen.has(c.id))];
    }

    // Filter by rock, terrain, facing
    const filtered = candidates.filter(c => {
      if (f.selectedRocks.length > 0 && !f.selectedRocks.some(r => (c.rock || '').toLowerCase().includes(r.toLowerCase()))) return false;
      if (f.selectedTerrain.length > 0 && !f.selectedTerrain.includes(c.terrain || 'vertical')) return false;
      if (f.selectedFacing.length > 0) {
        const cragFaces = c.orientation || [];
        if (!f.selectedFacing.some(face => cragFaces.includes(face))) return false;
      }
      return true;
    });

    if (filtered.length === 0) {
      setProgress('');
      setResults([]);
      setSearching(false);
      setSearchDone(true);
      return;
    }

    // Fetch forecasts in batches of 6
    setProgress(`Checking weather for ${filtered.length} crags`);
    const fcMap: Record<string, Forecast> = {};
    const storeState = useForecastStore.getState();
    const batchSize = 6;

    for (let i = 0; i < filtered.length; i += batchSize) {
      const batch = filtered.slice(i, i + batchSize);
      await Promise.all(batch.map(async (c) => {
        // Check existing caches
        if (storeState.forecastCache[c.id]) {
          fcMap[c.id] = storeState.forecastCache[c.id];
          return;
        }
        if (storeState.exploreFcCache[c.id]) {
          fcMap[c.id] = storeState.exploreFcCache[c.id];
          return;
        }
        try {
          const fc = await useForecastStore.getState().fetchForecast(c.lat, c.lon);
          fcMap[c.id] = fc;
        } catch {
          fcMap[c.id] = { best: null, ecmwf: null };
        }
      }));
      const pct = Math.min(100, Math.round(((i + batchSize) / filtered.length) * 100));
      setProgress(`Checking weather... ${pct}%`);
    }

    // Score each crag for each selected day
    const scored: ScoredResult[] = [];
    for (const c of filtered) {
      const fc = fcMap[c.id];
      if (!fc) continue;
      const src = fc.best || fc.ecmwf;
      if (!src?.daily?.time) continue;

      let bestScore = -1;
      let bestDay = '';
      let totalDayScore = 0;
      let dayCount = 0;

      for (const ds of f.selectedDays) {
        const di = src.daily.time.indexOf(ds);
        if (di < 0) continue;
        const bl = blendedScore(fc, di, c);
        totalDayScore += bl.score;
        dayCount++;
        if (bl.score > bestScore) {
          bestScore = bl.score;
          bestDay = ds;
        }
      }

      if (bestScore < f.minScore) continue;
      const avgScore = dayCount > 0 ? Math.round(totalDayScore / dayCount) : bestScore;
      const dist = homeLoc ? Math.round(haversineKm(homeLoc.lat, homeLoc.lon, c.lat, c.lon)) : null;

      scored.push({
        crag: c,
        fc,
        bestScore,
        bestDay,
        avgScore,
        dist,
        sortKey: avgScore * 1000 - (dist || 0),
      });
    }

    // Sort: best score first, distance as tiebreaker
    scored.sort((a, b) => b.sortKey - a.sortKey);
    const topResults = scored.slice(0, f.maxResults);

    setProgress('');
    setResults(topResults);
    setSearching(false);
    setSearchDone(true);
  }, [setSearching]);

  // Trigger search when filters change
  // This is called from the parent via ref or effect
  // Actually we expose runSearch and parent calls it
  // We need to expose runSearch - use a different pattern
  // The parent will pass filters and we detect changes

  // Use key-based approach: when filters changes, run search
  const [lastFilters, setLastFilters] = useState<PlannerFilters | null>(null);
  if (filters && filters !== lastFilters) {
    setLastFilters(filters);
    runSearch(filters);
  }

  const toggleDetail = useCallback((idx: number) => {
    setExpandedIdx(prev => prev === idx ? null : idx);
  }, []);

  // Loading state
  if (searching && progress) {
    return <div className="planner-loading">{progress}</div>;
  }

  // No results yet (haven't searched)
  if (!searchDone) return null;

  // Empty results
  if (results && results.length === 0) {
    return (
      <div className="planner-empty">
        No crags match your criteria. Try broadening your filters or lowering the minimum score.
      </div>
    );
  }

  if (!results) return null;

  return (
    <div className="planner-results">
      {results.map((r, ri) => {
        const c = r.crag;
        const dayLabel = new Date(r.bestDay + 'T00:00:00').toLocaleDateString('en-US', {
          weekday: 'short', month: 'short', day: 'numeric',
        });
        const distLabel = r.dist != null ? r.dist + ' km' : '';
        const metaParts = [
          c.region,
          c.alt + 'm',
          c.rock,
          (c.orientation || []).join('\u00B7'),
          c.terrain,
        ].filter(Boolean);

        const isOpen = expandedIdx === ri;
        const src = r.fc.best || r.fc.ecmwf;

        return (
          <div
            key={c.id + ri}
            className="planner-result"
            style={{ animationDelay: `${ri * 0.06}s` }}
            onClick={() => toggleDetail(ri)}
          >
            <div className="planner-result-head">
              <div>
                <div className="planner-result-name">{c.name}</div>
                <div className="planner-result-meta">
                  {metaParts.map((m, i) => <span key={i}>{m}</span>)}
                </div>
              </div>
              <div className="planner-result-score">
                <div
                  className={`score-pill ${scorePillClass(r.avgScore)}`}
                  style={{ padding: '5px 14px', fontSize: '18px' }}
                >
                  {r.avgScore}
                </div>
              </div>
            </div>
            <div className="planner-result-best">
              {getScoreLabel(r.avgScore)}
              {distLabel ? ' \u00B7 ' + distLabel + ' away' : ''}
              {' \u00B7 Best: '}{dayLabel} ({r.bestScore})
            </div>
            <div className={`planner-result-detail${isOpen ? ' open' : ''}`}>
              {isOpen && filters && src && (
                <div className="forecast-area">
                  <div className="forecast-scroll">
                    <div className="forecast-track">
                      {filters.selectedDays.map(ds => {
                        // Find day index in whichever model has it
                        let di = -1;
                        let useSrc: ModelForecast | null = null;
                        if (r.fc.best?.daily?.time) {
                          const idx = r.fc.best.daily.time.indexOf(ds);
                          if (idx >= 0) { di = idx; useSrc = r.fc.best; }
                        }
                        if (di < 0 && r.fc.ecmwf?.daily?.time) {
                          const idx = r.fc.ecmwf.daily.time.indexOf(ds);
                          if (idx >= 0) { di = idx; useSrc = r.fc.ecmwf; }
                        }
                        if (di < 0 || !useSrc) return null;
                        const dd = extractDay(useSrc, di);
                        const bl = blendedScore(r.fc, di, c);
                        const dn = new Date(ds + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short' });
                        const num = new Date(ds + 'T00:00:00').getDate();
                        return (
                          <div key={ds} className="fday">
                            <div className="fday-name">{dn} {num}</div>
                            <div className="fday-icon"><WeatherIcon weatherCode={dd.weather_code} /></div>
                            <div className="fday-wx-label">{wxLabel(dd.weather_code)}</div>
                            <div className="fday-temp">
                              [ {dd.temperature_2m_min != null ? Math.round(dd.temperature_2m_min) : '?'}° / {dd.temperature_2m_max != null ? Math.round(dd.temperature_2m_max) : '?'}° ]
                            </div>
                            <div className={`score-pill ${scorePillClass(bl.score)}`}>{bl.score}</div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
