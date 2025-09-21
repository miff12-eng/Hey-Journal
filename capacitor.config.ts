import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.voicejournal.app',
  appName: 'Voice Journal',
  webDir: 'dist', // Vite builds to 'dist' directory
  server: {
    androidScheme: 'https',
    // Enable live reload for development
    hostname: 'localhost',
    iosScheme: 'ionic'
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      backgroundColor: "#ffffffff",
      androidSplashResourceName: "splash",
      androidScaleType: "CENTER_CROP",
      showSpinner: false
    }
  }
};

export default config;
