'use client';

import { useEffect } from 'react';
import { useUIStore } from '@/stores/uiStore';

/** Applies the stored theme to <html> on first render (SSR-safe). */
export default function ThemeInitializer() {
  const theme = useUIStore((s) => s.theme);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  return null;
}
