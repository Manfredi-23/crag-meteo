import { Capacitor } from '@capacitor/core';

export type Platform = 'ios' | 'web';

export function getPlatform(): Platform {
  try {
    if (Capacitor.isNativePlatform()) {
      return 'ios';
    }
  } catch {
    // Capacitor not available — running in browser
  }
  return 'web';
}
