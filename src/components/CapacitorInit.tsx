'use client';

import { useEffect } from 'react';
import { getPlatform } from '@/lib/platform';

/**
 * Initializes Capacitor plugins (StatusBar, SplashScreen) on iOS.
 * Renders nothing — purely a side-effect component.
 */
export default function CapacitorInit() {
  useEffect(() => {
    if (getPlatform() !== 'ios') return;

    // Dynamic imports so these only load on native
    (async () => {
      try {
        const { StatusBar, Style } = await import('@capacitor/status-bar');
        await StatusBar.setStyle({ style: Style.Dark });
        await StatusBar.setOverlaysWebView({ overlay: false });
      } catch {
        // StatusBar plugin not available
      }

      try {
        const { SplashScreen } = await import('@capacitor/splash-screen');
        await SplashScreen.hide();
      } catch {
        // SplashScreen plugin not available
      }
    })();
  }, []);

  return null;
}
