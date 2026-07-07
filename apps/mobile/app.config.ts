import type { ExpoConfig } from 'expo/config';

/** Expo app configuration (PRD §8.2 — Expo / React Native, iOS + Android). */
const config: ExpoConfig = {
  name: 'EvenUp',
  slug: 'evenup',
  scheme: 'evenup',
  version: '0.1.0',
  orientation: 'portrait',
  userInterfaceStyle: 'automatic',
  newArchEnabled: true,
  icon: './assets/icon.png',
  splash: {
    image: './assets/icon.png',
    resizeMode: 'contain',
    backgroundColor: '#2563eb',
  },
  ios: {
    bundleIdentifier: 'company.lnrt.evenup',
    supportsTablet: true,
    // Apple Sign In is required for App Store (PRD FR-1.2).
    usesAppleSignIn: true,
    infoPlist: {
      NSCameraUsageDescription: 'EvenUp uses the camera to scan receipts.',
      NSPhotoLibraryUsageDescription:
        'EvenUp uses your photo library to pick receipt images to scan.',
    },
  },
  android: {
    package: 'company.lnrt.evenup',
    adaptiveIcon: { foregroundImage: './assets/icon.png', backgroundColor: '#2563eb' },
    permissions: ['CAMERA'],
  },
  plugins: [
    'expo-router',
    'expo-secure-store',
    ['expo-camera', { cameraPermission: 'EvenUp uses the camera to scan receipts.' }],
    [
      'expo-image-picker',
      { photosPermission: 'EvenUp uses your photo library to pick receipt images to scan.' },
    ],
    'expo-notifications',
  ],
  extra: {
    apiUrl: process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000',
    eas: { projectId: process.env.EAS_PROJECT_ID ?? '00000000-0000-0000-0000-000000000000' },
  },
};

export default config;
