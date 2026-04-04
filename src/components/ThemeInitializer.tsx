'use client';

import { useEffect } from 'react';
import { useUIStore } from '@/stores/uiStore';
import { storage } from '@/lib/storage';

/** Applies the stored theme to <html> on first render and listens for OS preference changes. */
export default function ThemeInitializer() {
  const theme = useUIStore((s) => s.theme);
  const setTheme = useUIStore((s) => s.setTheme);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  // Listen for OS color-scheme changes (only applies when user hasn't manually set a theme)
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e: MediaQueryListEvent) => {
      if (!storage.getTheme()) {
        setTheme(e.matches ? 'dark' : 'light');
      }
    };
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [setTheme]);

  return null;
}
