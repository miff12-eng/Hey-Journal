import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.voicejournal.app',
  appName: 'Voice Journal',
  webDir: 'dist/public', // Vite builds to 'dist/public' directory
  server: {
    androidScheme: 'https',
    // Enable live reload for development
    hostname: 'localhost'
  },
  ios: {
    contentInset: 'automatic'
  },
  // Configure URL schemes for OAuth redirect handling
  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      launchAutoHide: true,
      backgroundColor: "#FAFAFA",
      androidSplashResourceName: "splash",
      androidScaleType: "CENTER_CROP",
      showSpinner: false,
      iosSpinnerStyle: "small",
      spinnerColor: "#999999",
      splashFullScreen: true,
      splashImmersive: true
    }
  }
};

export default config;
