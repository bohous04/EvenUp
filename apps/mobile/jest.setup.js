// Native modules that have no JS implementation under jest — stub the surface
// the app touches so provider-rendering component tests stay deterministic.
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(async () => {}),
  deleteItemAsync: jest.fn(async () => {}),
}));

jest.mock('expo-localization', () => ({
  getLocales: () => [{ languageTag: 'cs-CZ', languageCode: 'cs' }],
}));
