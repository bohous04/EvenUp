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
    buildNumber: '1',
    supportsTablet: true,
    // Apple Sign In is required for App Store (PRD FR-1.2).
    usesAppleSignIn: true,
    // Universal links so an invite / password-reset link opens the app when
    // installed (needs an Apple-App-Site-Association file served at the domain).
    associatedDomains: ['applinks:evenup.lnrt.cz'],
    infoPlist: {
      NSCameraUsageDescription: 'EvenUp uses the camera to scan receipts.',
      NSPhotoLibraryUsageDescription:
        'EvenUp uses your photo library to pick receipt images to scan.',
      // Standard HTTPS only — no non-exempt/custom crypto — so the app is exempt
      // from US export-compliance documentation (declared here to skip the
      // per-build App Store Connect prompt).
      ITSAppUsesNonExemptEncryption: false,
    },
  },
  android: {
    package: 'company.lnrt.evenup',
    versionCode: 1,
    adaptiveIcon: { foregroundImage: './assets/icon.png', backgroundColor: '#2563eb' },
    permissions: ['CAMERA'],
    intentFilters: [
      {
        action: 'VIEW',
        autoVerify: true,
        data: [{ scheme: 'https', host: 'evenup.lnrt.cz', pathPrefix: '/invite' }],
        category: ['BROWSABLE', 'DEFAULT'],
      },
    ],
  },
  plugins: [
    'expo-router',
    'expo-secure-store',
    'expo-apple-authentication',
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
