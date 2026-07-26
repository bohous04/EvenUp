// Native modules that have no JS implementation under jest — stub the surface
// the app touches so provider-rendering component tests stay deterministic.
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(async () => {}),
  deleteItemAsync: jest.fn(async () => {}),
}));

// `useSafeAreaInsets` throws outside a <SafeAreaProvider>. The real app always
// has one at the root, but component tests render subtrees in isolation — this
// package ships no jest mock of its own, so stub zero insets.
jest.mock('react-native-safe-area-context', () => {
  const actual = jest.requireActual('react-native-safe-area-context');
  const inset = { top: 0, right: 0, bottom: 0, left: 0 };
  return {
    ...actual,
    useSafeAreaInsets: () => inset,
    useSafeAreaFrame: () => ({ x: 0, y: 0, width: 390, height: 844 }),
  };
});

// @expo/vector-icons pulls in expo-font, which throws under jest
// ("loadedNativeFonts.forEach is not a function"). Stub icon sets as no-op views.
jest.mock('@expo/vector-icons', () => {
  const React = require('react');
  const { View } = require('react-native');
  const Icon = (props) => React.createElement(View, props);
  return new Proxy({}, { get: () => Icon });
});
