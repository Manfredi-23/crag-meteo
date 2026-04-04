// ═══════════════════════════════════════════
// BitWet — Storage Adapter
// ═══════════════════════════════════════════

import type { Crag } from './types';
import { DEFAULT_CRAGS } from '../data/crags';

const CRAGS_KEY = 'bitWet_v1';
const THEME_KEY = 'bitWet_theme';

export type Theme = 'dark' | 'light';

export interface StorageAdapter {
  getCrags(): Crag[];
  saveCrags(crags: Crag[]): void;
  getTheme(): Theme | null;
  setTheme(theme: Theme): void;
}

class LocalStorageAdapter implements StorageAdapter {
  getCrags(): Crag[] {
    if (typeof window === 'undefined') return DEFAULT_CRAGS;
    try {
      const raw = localStorage.getItem(CRAGS_KEY);
      if (!raw) return DEFAULT_CRAGS;
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed) || parsed.length === 0) return DEFAULT_CRAGS;
      return parsed as Crag[];
    } catch {
      return DEFAULT_CRAGS;
    }
  }

  saveCrags(crags: Crag[]): void {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(CRAGS_KEY, JSON.stringify(crags));
    } catch {
      // Storage full or unavailable — silently fail
    }
  }

  getTheme(): Theme | null {
    if (typeof window === 'undefined') return null;
    try {
      const val = localStorage.getItem(THEME_KEY);
      if (val === 'dark' || val === 'light') return val;
      return null;
    } catch {
      return null;
    }
  }

  setTheme(theme: Theme): void {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {
      // Storage full or unavailable — silently fail
    }
  }
}

export const storage: StorageAdapter = new LocalStorageAdapter();
