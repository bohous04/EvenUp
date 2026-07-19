// pnpm stores packages under node_modules/.pnpm/<name>@<ver>/node_modules/<name>.
// jest-expo's default transformIgnorePatterns assume a hoisted layout, so we
// allow-list the RN/Expo packages that ship untranspiled (Flow/ESM) *inside*
// the .pnpm segment — anything else in node_modules stays ignored (fast).
const transformAllow = [
  'react-native',
  '@react-native',
  '@react-native-community',
  'react-navigation',
  '@react-navigation',
  'expo',
  '@expo',
  '@unimodules',
  'unimodules',
  'sentry-expo',
  'native-base',
  'react-native-svg',
  'react-native-qrcode-svg',
  'superjson',
  'better-auth',
  '@better-auth',
  '@trpc',
  '@tanstack',
];

module.exports = {
  preset: 'jest-expo',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  transformIgnorePatterns: [
    `node_modules/.pnpm/(?!(${transformAllow.join('|')})[^/]*/)`,
  ],
  moduleNameMapper: {
    // @evenup/* packages are consumed as TS source with NodeNext ".js" import
    // specifiers; strip the extension so jest resolves the ".ts" file.
    '^(\\.{1,2}/.*)\\.js$': '$1',
    '^@/(.*)$': '<rootDir>/src/$1',
  },
};
