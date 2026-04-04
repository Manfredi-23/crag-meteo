import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.bitwet.app',
  appName: 'BitWet',
  webDir: 'out',
  server: {
    // Allow loading from the local static export
    androidScheme: 'https',
  },
  plugins: {
    StatusBar: {
      style: 'dark',
      backgroundColor: '#0a0a0a',
    },
    SplashScreen: {
      launchAutoHide: true,
      launchShowDuration: 2000,
      backgroundColor: '#0a0a0a',
      showSpinner: false,
    },
  },
};

export default config;
