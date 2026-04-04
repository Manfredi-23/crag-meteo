'use client';

import { useMemo } from 'react';
import { getPlatform, type Platform } from '@/lib/platform';

export function usePlatform(): Platform {
  return useMemo(() => getPlatform(), []);
}
