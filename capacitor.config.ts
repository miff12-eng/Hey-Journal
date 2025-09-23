import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.voicejournal.app',
  appName: 'Voice Journal',
  webDir: 'dist/public', // Vite builds to 'dist/public' directory
  server: {
    androidScheme: 'https',
    // Enable live reload for development - connect directly to dev server
    url: 'https://20d6502d-bd0d-49a0-81b5-48a789e7beaa-00-190ybovf3mjps.worf.replit.dev',
    cleartext: true
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      launchAutoHide: true,
      backgroundColor: "#ffffff",
      androidSplashResourceName: "splash",
      androidScaleType: "CENTER_CROP",
      showSpinner: false,
      iosSpinnerStyle: "small",
      spinnerColor: "#999999"
    }
  }
};

export default config;
