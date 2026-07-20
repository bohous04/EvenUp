// Native modules that have no JS implementation under jest — stub the surface
// the app touches so provider-rendering component tests stay deterministic.
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(async () => {}),
  deleteItemAsync: jest.fn(async () => {}),
}));

// @expo/vector-icons pulls in expo-font, which throws under jest
// ("loadedNativeFonts.forEach is not a function"). Stub icon sets as no-op views.
jest.mock('@expo/vector-icons', () => {
  const React = require('react');
  const { View } = require('react-native');
  const Icon = (props) => React.createElement(View, props);
  return new Proxy({}, { get: () => Icon });
});
