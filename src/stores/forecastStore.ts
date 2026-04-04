// ═══════════════════════════════════════════
// BitWet — Zustand Forecast Store
// ═══════════════════════════════════════════

import { create } from 'zustand';
import type { Crag, Forecast } from '@/lib/types';
import { fetchForecastApi } from '@/lib/api';

/** 30-minute auto-refresh interval (ms) */
const REFRESH_INTERVAL = 30 * 60 * 1000;

interface ForecastState {
  /** Cached forecasts keyed by crag id (user's saved crags) */
  forecastCache: Record<string, Forecast>;
  /** Cached forecasts keyed by crag id (explore crags) */
  exploreFcCache: Record<string, Forecast>;
  /** Loading state for usuals forecasts */
  loading: boolean;
  /** Loading state for explore forecasts */
  exploreLoading: boolean;
  /** Timestamp of last usuals fetch */
  lastFetched: number | null;
  /** ID for the auto-refresh interval */
  _refreshInterval: ReturnType<typeof setInterval> | null;

  /** Fetch forecast for a single lat/lon */
  fetchForecast: (lat: number, lon: number) => Promise<Forecast>;
  /** Fetch forecasts for all given crags, update forecastCache */
  fetchAllForecasts: (crags: Crag[]) => Promise<void>;
  /** Fetch explore forecasts for given crags, update exploreFcCache */
  fetchExploreForecast: (crags: Crag[]) => Promise<void>;
  /** Start auto-refresh interval for the given crags */
  startAutoRefresh: (crags: Crag[]) => void;
  /** Stop auto-refresh interval */
  stopAutoRefresh: () => void;
}

async function apiFetchForecast(lat: number, lon: number): Promise<Forecast> {
  try {
    return (await fetchForecastApi(lat, lon)) as Forecast;
  } catch {
    return { best: null, ecmwf: null };
  }
}

export const useForecastStore = create<ForecastState>((set, get) => ({
  forecastCache: {},
  exploreFcCache: {},
  loading: false,
  exploreLoading: false,
  lastFetched: null,
  _refreshInterval: null,

  async fetchForecast(lat, lon) {
    return apiFetchForecast(lat, lon);
  },

  async fetchAllForecasts(crags) {
    set({ loading: true });
    const results = await Promise.all(
      crags.map(async (crag) => {
        const fc = await apiFetchForecast(crag.lat, crag.lon);
        return { id: crag.id, fc };
      })
    );

    const cache: Record<string, Forecast> = { ...get().forecastCache };
    for (const { id, fc } of results) {
      cache[id] = fc;
    }

    set({ forecastCache: cache, loading: false, lastFetched: Date.now() });
  },

  async fetchExploreForecast(crags) {
    set({ exploreLoading: true });
    const results = await Promise.all(
      crags.map(async (crag) => {
        const fc = await apiFetchForecast(crag.lat, crag.lon);
        return { id: crag.id, fc };
      })
    );

    const cache: Record<string, Forecast> = { ...get().exploreFcCache };
    for (const { id, fc } of results) {
      cache[id] = fc;
    }

    set({ exploreFcCache: cache, exploreLoading: false });
  },

  startAutoRefresh(crags) {
    const state = get();
    // Clear existing interval if any
    if (state._refreshInterval) {
      clearInterval(state._refreshInterval);
    }

    const interval = setInterval(() => {
      get().fetchAllForecasts(crags);
    }, REFRESH_INTERVAL);

    set({ _refreshInterval: interval });
  },

  stopAutoRefresh() {
    const interval = get()._refreshInterval;
    if (interval) {
      clearInterval(interval);
      set({ _refreshInterval: null });
    }
  },
}));
