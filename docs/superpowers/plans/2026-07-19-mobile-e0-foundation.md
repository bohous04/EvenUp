# Mobile E0 — Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give `apps/mobile` the shared foundation every later epic needs — a test runner, a light/dark theme system, persisted locale, a small RN UI kit, and a tab-based navigation shell with deep links.

**Architecture:** Add a `ThemeProvider`/`useTheme()` layer and an `src/ui/` primitives module so screens stop inlining `StyleSheet`. Keep the existing static `theme` export as a back-compat alias so current screens keep working unchanged; new/rebuilt screens adopt `useTheme()`. Replace the flat expo-router `Stack` with a `(tabs)` group (Groups / Activity / Settings) plus modal routes, and add an `invite/[token]` deep-link route.

**Tech Stack:** Expo SDK 52, React Native 0.76, expo-router 4, TypeScript strict, jest-expo + @testing-library/react-native, expo-localization, expo-secure-store.

## Global Constraints

- Money is always integer **minor units**; never re-implement math — import from `@evenup/core`.
- All user-facing strings come from `@evenup/i18n` via `useI18n().t(key)`; no hard-coded copy. CZ is the default locale.
- UI uses **icon components** (`@expo/vector-icons`), never emoji glyphs.
- `noUncheckedIndexedAccess` is on — guard array/object index access.
- Path alias `@/*` → `apps/mobile/src/*`.
- Chips must not rely on color alone — always render initials + an accessible label.
- Keep existing screens behaviorally unchanged in this epic; per-screen kit/dark-mode migration happens in the screen's own epic.

---

### Task 1: Test infrastructure

**Files:**
- Modify: `apps/mobile/package.json` (add devDeps + `test` script)
- Create: `apps/mobile/jest.config.js`
- Create: `apps/mobile/jest.setup.js`
- Test: `apps/mobile/src/lib/__tests__/smoke.test.ts`

**Interfaces:**
- Produces: a working `pnpm --filter @evenup/mobile test` command using the `jest-expo` preset.

- [ ] **Step 1: Install dev dependencies**

Run (from repo root):
```bash
pnpm --filter @evenup/mobile add -D jest-expo jest @testing-library/react-native @types/jest react-test-renderer@18.3.1
```

- [ ] **Step 2: Add jest config**

Create `apps/mobile/jest.config.js`:
```js
module.exports = {
  preset: 'jest-expo',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@unimodules/.*|unimodules|sentry-expo|native-base|react-native-svg|@evenup/.*|superjson))',
  ],
  moduleNameMapper: { '^@/(.*)$': '<rootDir>/src/$1' },
};
```

Create `apps/mobile/jest.setup.js`:
```js
// Placeholder for future global mocks (SecureStore, expo-notifications, etc.).
```

- [ ] **Step 3: Add the test script**

In `apps/mobile/package.json` `scripts`, add:
```json
"test": "jest"
```

- [ ] **Step 4: Write a smoke test**

Create `apps/mobile/src/lib/__tests__/smoke.test.ts`:
```ts
import { minorToDecimalString } from '@evenup/core';

test('core is importable from the mobile jest env', () => {
  expect(minorToDecimalString(12345, 'CZK')).toBe('123,45');
});
```

- [ ] **Step 5: Run it**

Run: `pnpm --filter @evenup/mobile test`
Expected: 1 passing test. (If the CZK format assertion differs, adjust to the actual `@evenup/core` output — the point is that the import resolves.)

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/package.json apps/mobile/jest.config.js apps/mobile/jest.setup.js apps/mobile/src/lib/__tests__/smoke.test.ts pnpm-lock.yaml
git commit -m "test(mobile): add jest-expo + RN Testing Library runner"
```

---

### Task 2: Theme tokens (light/dark) + `useTheme()`

**Files:**
- Create: `apps/mobile/src/ui/tokens.ts`
- Create: `apps/mobile/src/ui/theme.tsx`
- Modify: `apps/mobile/src/theme.ts` (re-export light tokens as `theme` for back-compat)
- Modify: `apps/mobile/src/providers.tsx` (wrap children in `ThemeProvider`)
- Test: `apps/mobile/src/ui/__tests__/theme.test.tsx`

**Interfaces:**
- Produces:
  - `type ThemeTokens = { brand; bg; card; text; textMuted; border; green; red; radius; space; danger; overlay }`
  - `lightTokens: ThemeTokens`, `darkTokens: ThemeTokens`
  - `ThemeProvider({ children }): JSX.Element`
  - `useTheme(): ThemeTokens` (resolves via `useColorScheme()`)
  - `theme` (from `@/theme`) stays a valid `ThemeTokens` = `lightTokens`.

- [ ] **Step 1: Define tokens**

Create `apps/mobile/src/ui/tokens.ts`:
```ts
export interface ThemeTokens {
  brand: string;
  bg: string;
  card: string;
  text: string;
  textMuted: string;
  border: string;
  green: string;
  red: string;
  danger: string;
  overlay: string;
  radius: number;
  space: number;
}

export const lightTokens: ThemeTokens = {
  brand: '#2563eb',
  bg: '#f5f5f5',
  card: '#ffffff',
  text: '#171717',
  textMuted: '#737373',
  border: '#e5e5e5',
  green: '#15803d',
  red: '#b91c1c',
  danger: '#b91c1c',
  overlay: 'rgba(0,0,0,0.4)',
  radius: 14,
  space: 16,
};

export const darkTokens: ThemeTokens = {
  brand: '#3b82f6',
  bg: '#0a0a0a',
  card: '#171717',
  text: '#fafafa',
  textMuted: '#a3a3a3',
  border: '#262626',
  green: '#4ade80',
  red: '#f87171',
  danger: '#f87171',
  overlay: 'rgba(0,0,0,0.6)',
  radius: 14,
  space: 16,
};
```

- [ ] **Step 2: Provider + hook**

Create `apps/mobile/src/ui/theme.tsx`:
```tsx
import { createContext, useContext, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';
import { darkTokens, lightTokens, type ThemeTokens } from './tokens';

const ThemeContext = createContext<ThemeTokens>(lightTokens);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const scheme = useColorScheme();
  const tokens = scheme === 'dark' ? darkTokens : lightTokens;
  return <ThemeContext.Provider value={tokens}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeTokens {
  return useContext(ThemeContext);
}
```

- [ ] **Step 3: Back-compat `theme`**

Replace `apps/mobile/src/theme.ts` contents with:
```ts
import { lightTokens } from './ui/tokens';

// Back-compat: existing screens import a static light `theme`. New/rebuilt
// screens should use `useTheme()` from '@/ui/theme' for dark-mode support.
export const theme = lightTokens;
```

- [ ] **Step 4: Wrap providers**

In `apps/mobile/src/providers.tsx`, import `ThemeProvider` and wrap the innermost content:
```tsx
import { ThemeProvider } from './ui/theme';
```
Change the `I18nProvider` line to:
```tsx
<I18nProvider>
  <ThemeProvider>{children}</ThemeProvider>
</I18nProvider>
```

- [ ] **Step 5: Write the test**

Create `apps/mobile/src/ui/__tests__/theme.test.tsx`:
```tsx
import { Text } from 'react-native';
import { render } from '@testing-library/react-native';
import { ThemeProvider, useTheme } from '../theme';
import { lightTokens } from '../tokens';

function Probe() {
  const t = useTheme();
  return <Text>{t.brand}</Text>;
}

test('useTheme provides light tokens by default', () => {
  const { getByText } = render(
    <ThemeProvider>
      <Probe />
    </ThemeProvider>,
  );
  expect(getByText(lightTokens.brand)).toBeTruthy();
});
```

- [ ] **Step 6: Run tests + typecheck**

Run: `pnpm --filter @evenup/mobile test && pnpm --filter @evenup/mobile typecheck`
Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add apps/mobile/src/ui/tokens.ts apps/mobile/src/ui/theme.tsx apps/mobile/src/theme.ts apps/mobile/src/providers.tsx apps/mobile/src/ui/__tests__/theme.test.tsx
git commit -m "feat(mobile): light/dark theme tokens + useTheme() provider"
```

---

### Task 3: Locale persistence + device detection

**Files:**
- Modify: `apps/mobile/package.json` (add `expo-localization`)
- Create: `apps/mobile/src/lib/resolve-locale.ts`
- Modify: `apps/mobile/src/lib/i18n.tsx` (load persisted/device locale, persist on change)
- Test: `apps/mobile/src/lib/__tests__/resolve-locale.test.ts`

**Interfaces:**
- Consumes: `DEFAULT_LOCALE`, `type Locale` from `@evenup/i18n`.
- Produces: `resolveInitialLocale(stored: string | null, deviceTag: string | null): Locale` — pure.

- [ ] **Step 1: Install expo-localization**

Run: `pnpm --filter @evenup/mobile exec expo install expo-localization`

- [ ] **Step 2: Pure resolver + test (write test first)**

Create `apps/mobile/src/lib/__tests__/resolve-locale.test.ts`:
```ts
import { resolveInitialLocale } from '../resolve-locale';

test('prefers a valid stored locale', () => {
  expect(resolveInitialLocale('en', 'cs-CZ')).toBe('en');
});
test('falls back to device language when nothing stored', () => {
  expect(resolveInitialLocale(null, 'en-US')).toBe('en');
});
test('defaults to Czech for unknown/empty inputs', () => {
  expect(resolveInitialLocale(null, null)).toBe('cs');
  expect(resolveInitialLocale('xx', 'fr-FR')).toBe('cs');
});
```

- [ ] **Step 3: Run test to confirm it fails**

Run: `pnpm --filter @evenup/mobile test resolve-locale`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement the resolver**

Create `apps/mobile/src/lib/resolve-locale.ts`:
```ts
import { DEFAULT_LOCALE, type Locale } from '@evenup/i18n';

const SUPPORTED: readonly Locale[] = ['cs', 'en'];

function normalize(tag: string | null): Locale | null {
  if (!tag) return null;
  const lang = tag.toLowerCase().split(/[-_]/)[0];
  return SUPPORTED.find((l) => l === lang) ?? null;
}

/** Choose the startup locale: stored preference → device language → default (cs). */
export function resolveInitialLocale(stored: string | null, deviceTag: string | null): Locale {
  return normalize(stored) ?? normalize(deviceTag) ?? DEFAULT_LOCALE;
}
```

- [ ] **Step 5: Run test to confirm it passes**

Run: `pnpm --filter @evenup/mobile test resolve-locale`
Expected: PASS. (If `DEFAULT_LOCALE` is not `'cs'`, adjust the third test to the real default.)

- [ ] **Step 6: Wire persistence into the provider**

In `apps/mobile/src/lib/i18n.tsx`, replace the `useState`/`useMemo` body so it loads and persists:
```tsx
import { useEffect, useMemo, useState, createContext, useContext, type ReactNode } from 'react';
import * as SecureStore from 'expo-secure-store';
import * as Localization from 'expo-localization';
import {
  DEFAULT_LOCALE,
  createTranslator,
  formatCurrency as fmtCurrency,
  type Locale,
  type MessageKey,
  type InterpolationValues,
} from '@evenup/i18n';
import { resolveInitialLocale } from './resolve-locale';

const LOCALE_KEY = 'evenup.locale';
```
Inside `I18nProvider`, replace the `const [locale, setLocale] = useState(...)` line and add an effect:
```tsx
const [locale, setLocaleState] = useState<Locale>(DEFAULT_LOCALE);

useEffect(() => {
  void (async () => {
    const stored = await SecureStore.getItemAsync(LOCALE_KEY).catch(() => null);
    const device = Localization.getLocales()[0]?.languageTag ?? null;
    setLocaleState(resolveInitialLocale(stored, device));
  })();
}, []);

const setLocale = (l: Locale) => {
  setLocaleState(l);
  void SecureStore.setItemAsync(LOCALE_KEY, l).catch(() => {});
};
```
Keep the existing `value`/`translator` `useMemo` (it already depends on `locale`), and pass `setLocale` through unchanged.

- [ ] **Step 7: Run tests + typecheck**

Run: `pnpm --filter @evenup/mobile test && pnpm --filter @evenup/mobile typecheck`
Expected: all pass.

- [ ] **Step 8: Commit**

```bash
git add apps/mobile/src/lib/resolve-locale.ts apps/mobile/src/lib/i18n.tsx apps/mobile/src/lib/__tests__/resolve-locale.test.ts apps/mobile/package.json pnpm-lock.yaml
git commit -m "feat(mobile): persist locale to SecureStore + detect device language"
```

---

### Task 4: UI kit primitives

**Files:**
- Create: `apps/mobile/src/ui/Screen.tsx`
- Create: `apps/mobile/src/ui/Button.tsx`
- Create: `apps/mobile/src/ui/Card.tsx`
- Create: `apps/mobile/src/ui/Input.tsx`
- Create: `apps/mobile/src/ui/Chip.tsx`
- Create: `apps/mobile/src/ui/SegmentedControl.tsx`
- Create: `apps/mobile/src/ui/index.ts`
- Test: `apps/mobile/src/ui/__tests__/kit.test.tsx`

**Interfaces:**
- Produces (all consume `useTheme()`):
  - `Screen({ children, scroll?, padded?, style? })`
  - `Button({ title, onPress, variant?: 'primary'|'secondary'|'ghost'|'danger', loading?, disabled?, icon?, testID? })`
  - `Card({ children, style? })`
  - `Input({ value, onChangeText, placeholder?, label?, ...TextInputProps })`
  - `Chip({ label, active?, onPress? })` (text pill; distinct from member color chip)
  - `SegmentedControl<T extends string>({ options: {value:T,label:string}[], value, onChange })`
  - `index.ts` re-exports all of the above.

- [ ] **Step 1: Screen**

Create `apps/mobile/src/ui/Screen.tsx`:
```tsx
import type { ReactNode } from 'react';
import { ScrollView, View, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme } from './theme';

export function Screen({
  children,
  scroll = false,
  padded = true,
  style,
}: {
  children: ReactNode;
  scroll?: boolean;
  padded?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const t = useTheme();
  const inner: StyleProp<ViewStyle> = [
    { flex: scroll ? undefined : 1, backgroundColor: t.bg },
    padded && { padding: t.space, gap: 16 },
    style,
  ];
  if (scroll) {
    return (
      <ScrollView style={{ backgroundColor: t.bg }} contentContainerStyle={inner}>
        {children}
      </ScrollView>
    );
  }
  return <View style={inner}>{children}</View>;
}
```

- [ ] **Step 2: Button**

Create `apps/mobile/src/ui/Button.tsx`:
```tsx
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import type { ReactNode } from 'react';
import { useTheme } from './theme';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

export function Button({
  title,
  onPress,
  variant = 'primary',
  loading = false,
  disabled = false,
  icon,
  testID,
}: {
  title: string;
  onPress: () => void;
  variant?: Variant;
  loading?: boolean;
  disabled?: boolean;
  icon?: ReactNode;
  testID?: string;
}) {
  const t = useTheme();
  const solid = variant === 'primary' || variant === 'danger';
  const bg = variant === 'primary' ? t.brand : variant === 'danger' ? t.danger : 'transparent';
  const fg = solid ? '#fff' : t.brand;
  const border = variant === 'secondary' ? t.border : 'transparent';
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      accessibilityRole="button"
      testID={testID}
      style={[
        styles.base,
        { backgroundColor: bg, borderColor: border, borderWidth: variant === 'secondary' ? 1 : 0, borderRadius: t.radius },
        (disabled || loading) && styles.disabled,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <View style={styles.row}>
          {icon}
          <Text style={[styles.text, { color: fg }]}>{title}</Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { padding: 14, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  text: { fontWeight: '700', fontSize: 16 },
  disabled: { opacity: 0.5 },
});
```

- [ ] **Step 3: Card**

Create `apps/mobile/src/ui/Card.tsx`:
```tsx
import type { ReactNode } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme } from './theme';

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const t = useTheme();
  return (
    <View
      style={[
        { backgroundColor: t.card, borderRadius: t.radius, borderWidth: 1, borderColor: t.border, padding: t.space, gap: 10 },
        style,
      ]}
    >
      {children}
    </View>
  );
}
```

- [ ] **Step 4: Input**

Create `apps/mobile/src/ui/Input.tsx`:
```tsx
import { StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';
import { useTheme } from './theme';

export function Input({ label, style, ...props }: TextInputProps & { label?: string }) {
  const t = useTheme();
  return (
    <View style={{ gap: 6 }}>
      {label ? <Text style={{ color: t.textMuted, fontSize: 13 }}>{label}</Text> : null}
      <TextInput
        placeholderTextColor={t.textMuted}
        accessibilityLabel={label}
        style={[
          styles.input,
          { borderColor: t.border, backgroundColor: t.bg, color: t.text, borderRadius: t.radius },
          style,
        ]}
        {...props}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  input: { borderWidth: 1, padding: 12, fontSize: 16 },
});
```

- [ ] **Step 5: Chip + SegmentedControl**

Create `apps/mobile/src/ui/Chip.tsx`:
```tsx
import { Pressable, Text } from 'react-native';
import { useTheme } from './theme';

export function Chip({ label, active = false, onPress }: { label: string; active?: boolean; onPress?: () => void }) {
  const t = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      style={{
        borderWidth: 1,
        borderColor: active ? t.brand : t.border,
        backgroundColor: active ? t.brand : t.bg,
        borderRadius: 999,
        paddingVertical: 6,
        paddingHorizontal: 12,
      }}
    >
      <Text style={{ color: active ? '#fff' : t.text, fontWeight: active ? '700' : '600' }}>{label}</Text>
    </Pressable>
  );
}
```

Create `apps/mobile/src/ui/SegmentedControl.tsx`:
```tsx
import { View } from 'react-native';
import { Chip } from './Chip';

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      {options.map((o) => (
        <Chip key={o.value} label={o.label} active={o.value === value} onPress={() => onChange(o.value)} />
      ))}
    </View>
  );
}
```

- [ ] **Step 6: Barrel export**

Create `apps/mobile/src/ui/index.ts`:
```ts
export { Screen } from './Screen';
export { Button } from './Button';
export { Card } from './Card';
export { Input } from './Input';
export { Chip } from './Chip';
export { SegmentedControl } from './SegmentedControl';
export { useTheme, ThemeProvider } from './theme';
export { AmountInput } from './AmountInput';
export { BottomSheet } from './BottomSheet';
```
> Note: `AmountInput` and `BottomSheet` are added in Tasks 5–6; if executing strictly in order, add their exports when those files exist (or create empty stubs first). The barrel is finalized in Task 6.

- [ ] **Step 7: Kit render test**

Create `apps/mobile/src/ui/__tests__/kit.test.tsx`:
```tsx
import { render, fireEvent } from '@testing-library/react-native';
import { ThemeProvider } from '../theme';
import { Button } from '../Button';
import { SegmentedControl } from '../SegmentedControl';

const wrap = (ui: React.ReactElement) => render(<ThemeProvider>{ui}</ThemeProvider>);

test('Button fires onPress and shows title', () => {
  const onPress = jest.fn();
  const { getByText } = wrap(<Button title="Save" onPress={onPress} />);
  fireEvent.press(getByText('Save'));
  expect(onPress).toHaveBeenCalledTimes(1);
});

test('SegmentedControl selects a value', () => {
  const onChange = jest.fn();
  const { getByText } = wrap(
    <SegmentedControl
      options={[{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }]}
      value="a"
      onChange={onChange}
    />,
  );
  fireEvent.press(getByText('B'));
  expect(onChange).toHaveBeenCalledWith('b');
});
```

- [ ] **Step 8: Run tests (defer barrel typecheck until Task 6)**

Run: `pnpm --filter @evenup/mobile test kit`
Expected: PASS. (Full `typecheck` runs green at the end of Task 6 once the barrel's referenced files exist.)

- [ ] **Step 9: Commit**

```bash
git add apps/mobile/src/ui
git commit -m "feat(mobile): core UI kit (Screen, Button, Card, Input, Chip, SegmentedControl)"
```

---

### Task 5: AmountInput

**Files:**
- Create: `apps/mobile/src/ui/AmountInput.tsx`
- Test: `apps/mobile/src/ui/__tests__/amount-input.test.tsx`

**Interfaces:**
- Consumes: `useTheme()`, `Input`, `currencyExponent` from `@evenup/core`.
- Produces: `AmountInput({ value, onChangeText, currency, label?, testID? })` — a numeric TextInput that clamps fraction digits to the currency exponent, plus the pure helper `clampAmountDecimals(raw, currency)`.

- [ ] **Step 1: Write the failing test**

Create `apps/mobile/src/ui/__tests__/amount-input.test.tsx`:
```tsx
import { clampAmountDecimals } from '../AmountInput';

test('clamps CZK to 2 decimals', () => {
  expect(clampAmountDecimals('12,345', 'CZK')).toBe('12,34');
});
test('accepts a dot separator and a trailing separator mid-type', () => {
  expect(clampAmountDecimals('12.', 'CZK')).toBe('12.');
});
test('zero-decimal currency drops the separator', () => {
  expect(clampAmountDecimals('12,5', 'JPY')).toBe('12');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @evenup/mobile test amount-input`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement (port from web `lib/amount-input.ts`)**

Create `apps/mobile/src/ui/AmountInput.tsx`:
```tsx
import { currencyExponent } from '@evenup/core';
import { Input } from './Input';

/** Clamp a free-typed amount to the currency's decimal places (ported from web). */
export function clampAmountDecimals(raw: string, currency: string): string {
  const sepIndex = raw.search(/[.,]/);
  if (sepIndex === -1) return raw;
  const intPart = raw.slice(0, sepIndex);
  const exp = currencyExponent(currency);
  if (exp === 0) return intPart;
  const sep = raw[sepIndex]!;
  const fraction = raw.slice(sepIndex + 1).replace(/[.,]/g, '');
  return `${intPart}${sep}${fraction.slice(0, exp)}`;
}

export function AmountInput({
  value,
  onChangeText,
  currency,
  label,
  testID,
}: {
  value: string;
  onChangeText: (v: string) => void;
  currency: string;
  label?: string;
  testID?: string;
}) {
  return (
    <Input
      value={value}
      onChangeText={(v) => onChangeText(clampAmountDecimals(v, currency))}
      keyboardType="decimal-pad"
      placeholder={`0 ${currency}`}
      label={label}
      testID={testID}
    />
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @evenup/mobile test amount-input`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/ui/AmountInput.tsx apps/mobile/src/ui/__tests__/amount-input.test.tsx
git commit -m "feat(mobile): AmountInput with currency-aware decimal clamping"
```

---

### Task 6: BottomSheet

**Files:**
- Create: `apps/mobile/src/ui/BottomSheet.tsx`
- Modify: `apps/mobile/src/ui/index.ts` (ensure barrel exports resolve)
- Test: `apps/mobile/src/ui/__tests__/bottom-sheet.test.tsx`

**Interfaces:**
- Consumes: `useTheme()`.
- Produces: `BottomSheet({ visible, onClose, title?, children })` — a themed modal sheet over a scrim (RN `Modal`, no extra native deps).

- [ ] **Step 1: Implement**

Create `apps/mobile/src/ui/BottomSheet.tsx`:
```tsx
import type { ReactNode } from 'react';
import { Modal, Pressable, Text, View } from 'react-native';
import { useTheme } from './theme';

export function BottomSheet({
  visible,
  onClose,
  title,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
}) {
  const t = useTheme();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable
        style={{ flex: 1, backgroundColor: t.overlay, justifyContent: 'flex-end' }}
        onPress={onClose}
        accessibilityLabel="Close"
      >
        <Pressable
          onPress={() => {}}
          style={{
            backgroundColor: t.card,
            borderTopLeftRadius: 20,
            borderTopRightRadius: 20,
            padding: t.space,
            paddingBottom: 32,
            gap: 12,
          }}
        >
          <View style={{ alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: t.border }} />
          {title ? <Text style={{ fontSize: 18, fontWeight: '700', color: t.text }}>{title}</Text> : null}
          {children}
        </Pressable>
      </Pressable>
    </Modal>
  );
}
```

- [ ] **Step 2: Test open/close**

Create `apps/mobile/src/ui/__tests__/bottom-sheet.test.tsx`:
```tsx
import { Text } from 'react-native';
import { render } from '@testing-library/react-native';
import { ThemeProvider } from '../theme';
import { BottomSheet } from '../BottomSheet';

test('renders children when visible', () => {
  const { getByText } = render(
    <ThemeProvider>
      <BottomSheet visible onClose={() => {}} title="Settle">
        <Text>Body</Text>
      </BottomSheet>
    </ThemeProvider>,
  );
  expect(getByText('Body')).toBeTruthy();
});
```

- [ ] **Step 3: Run tests + full typecheck (barrel now complete)**

Run: `pnpm --filter @evenup/mobile test && pnpm --filter @evenup/mobile typecheck && pnpm --filter @evenup/mobile lint`
Expected: all green.

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/src/ui/BottomSheet.tsx apps/mobile/src/ui/index.ts apps/mobile/src/ui/__tests__/bottom-sheet.test.tsx
git commit -m "feat(mobile): BottomSheet primitive"
```

---

### Task 7: Tab navigation shell

**Files:**
- Create: `apps/mobile/app/(tabs)/_layout.tsx`
- Move: `apps/mobile/app/index.tsx` → `apps/mobile/app/(tabs)/index.tsx`
- Create: `apps/mobile/app/(tabs)/activity.tsx`
- Create: `apps/mobile/app/(tabs)/settings.tsx`
- Modify: `apps/mobile/app/_layout.tsx` (register `(tabs)` + keep modal/stack routes)
- Test: `apps/mobile/app/__tests__/tabs-layout.test.tsx`

**Interfaces:**
- Consumes: `useTheme()`, `useI18n()`, `useSession()`.
- Produces: a `Tabs` layout with three tabs (Groups / Activity / Settings) using `nav.*` i18n keys; `activity` and `settings` are placeholder screens filled by E6/E2.

- [ ] **Step 1: Confirm the `nav.*` i18n keys exist**

Run: `grep -E "'nav\." packages/i18n/src/locales/en.ts`
Expected: keys like `nav.groups`, `nav.activity`, `nav.settings` (or similar). Use the actual keys returned; if a needed label is missing, add it to **both** `cs.ts` and `en.ts` (typed catalog requires parity) in this step and commit with the task.

- [ ] **Step 2: Tabs layout**

Create `apps/mobile/app/(tabs)/_layout.tsx`:
```tsx
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useI18n } from '@/lib/i18n';
import { useTheme } from '@/ui/theme';

export default function TabsLayout() {
  const { t } = useI18n();
  const c = useTheme();
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: c.brand },
        headerTintColor: '#fff',
        tabBarActiveTintColor: c.brand,
        tabBarStyle: { backgroundColor: c.card, borderTopColor: c.border },
        sceneStyle: { backgroundColor: c.bg },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: t('nav.groups'),
          tabBarIcon: ({ color, size }) => <Ionicons name="people-outline" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="activity"
        options={{
          title: t('nav.activity'),
          tabBarIcon: ({ color, size }) => <Ionicons name="pulse-outline" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: t('nav.settings'),
          tabBarIcon: ({ color, size }) => <Ionicons name="settings-outline" color={color} size={size} />,
        }}
      />
    </Tabs>
  );
}
```
> If `sceneStyle` is not supported by the installed expo-router version, drop it (the tab screens set their own background via `Screen`).

- [ ] **Step 3: Move the groups screen**

Move `apps/mobile/app/index.tsx` to `apps/mobile/app/(tabs)/index.tsx` (unchanged content — it keeps its own header via the tabs layout now; remove any `Stack.Screen`-specific title reliance). Update its relative imports if needed (paths use `@/` alias, so no change expected).

```bash
git mv apps/mobile/app/index.tsx apps/mobile/app/(tabs)/index.tsx
```

- [ ] **Step 4: Placeholder Activity + Settings screens**

Create `apps/mobile/app/(tabs)/activity.tsx`:
```tsx
import { Text } from 'react-native';
import { Screen } from '@/ui';
import { useI18n } from '@/lib/i18n';
import { useTheme } from '@/ui/theme';

export default function ActivityScreen() {
  const { t } = useI18n();
  const c = useTheme();
  return (
    <Screen>
      <Text style={{ color: c.textMuted }}>{t('activity.empty')}</Text>
    </Screen>
  );
}
```
> If `activity.empty` does not exist, use an existing neutral key (e.g. `common.loading`) or add `activity.empty` to both catalogs. Grep first: `grep "'activity\." packages/i18n/src/locales/en.ts`.

Create `apps/mobile/app/(tabs)/settings.tsx`:
```tsx
import { Text } from 'react-native';
import { Screen } from '@/ui';
import { useI18n } from '@/lib/i18n';
import { useTheme } from '@/ui/theme';

export default function SettingsScreen() {
  const { t } = useI18n();
  const c = useTheme();
  return (
    <Screen>
      <Text style={{ color: c.textMuted }}>{t('nav.settings')}</Text>
    </Screen>
  );
}
```

- [ ] **Step 5: Update the root layout**

In `apps/mobile/app/_layout.tsx`, replace the `<Stack.Screen name="index" ... />` line with a `(tabs)` group entry and keep the rest (sign-in, sign-up, forgot-password, group/[id], scan):
```tsx
<Stack.Screen name="(tabs)" options={{ headerShown: false }} />
```
Remove the now-duplicated `index` screen registration. Leave `group/[id]` and `scan` (modal) as-is.

- [ ] **Step 6: Smoke-test the tabs layout renders**

Create `apps/mobile/app/__tests__/tabs-layout.test.tsx`:
```tsx
import { render } from '@testing-library/react-native';
import { I18nProvider } from '@/lib/i18n';
import { ThemeProvider } from '@/ui/theme';
import TabsLayout from '../(tabs)/_layout';

test('tabs layout renders without crashing', () => {
  const tree = render(
    <I18nProvider>
      <ThemeProvider>
        <TabsLayout />
      </ThemeProvider>
    </I18nProvider>,
  );
  expect(tree).toBeTruthy();
});
```
> expo-router `Tabs` may need a navigation context in tests; if this render throws in jest, downgrade this to a `jest.mock('expo-router', ...)` shallow test that asserts the component is a function — do not block the task on router internals.

- [ ] **Step 7: Run tests + typecheck + start Metro sanity**

Run: `pnpm --filter @evenup/mobile test && pnpm --filter @evenup/mobile typecheck`
Expected: green. Optionally `pnpm --filter @evenup/mobile exec expo start -c` and confirm the three tabs appear (manual).

- [ ] **Step 8: Commit**

```bash
git add apps/mobile/app
git commit -m "feat(mobile): tab navigation shell (Groups / Activity / Settings)"
```

---

### Task 8: Invite deep-link route

**Files:**
- Create: `apps/mobile/app/invite/[token].tsx`
- Modify: `apps/mobile/app/_layout.tsx` (register the route)
- Test: `apps/mobile/app/__tests__/invite-route.test.tsx`

**Interfaces:**
- Consumes: `useLocalSearchParams`, `useI18n()`, `useTheme()`.
- Produces: a route that reads the `token` param and renders an invite preview placeholder. The actual `invite.preview`/`invite.claim` wiring lands in **E1**; this task only proves the deep link resolves and surfaces the token.

- [ ] **Step 1: Route screen**

Create `apps/mobile/app/invite/[token].tsx`:
```tsx
import { Text } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Screen, Card } from '@/ui';
import { useI18n } from '@/lib/i18n';
import { useTheme } from '@/ui/theme';

export default function InviteScreen() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const { t } = useI18n();
  const c = useTheme();
  return (
    <Screen>
      <Card>
        <Text style={{ color: c.text, fontWeight: '700', fontSize: 16 }}>{t('invite.title')}</Text>
        <Text style={{ color: c.textMuted }} testID="invite-token">
          {String(token)}
        </Text>
      </Card>
    </Screen>
  );
}
```
> Grep `grep "'invite\." packages/i18n/src/locales/en.ts` and use a real key for the heading; if none fits, add `invite.title` to both catalogs.

- [ ] **Step 2: Register the route + verify the scheme**

In `apps/mobile/app/_layout.tsx` add inside the `Stack`:
```tsx
<Stack.Screen name="invite/[token]" options={{ title: 'Invite', presentation: 'modal' }} />
```
The `scheme: 'evenup'` in `app.config.ts` already makes `evenup://invite/<token>` resolve to this route via expo-router's file-based linking — no extra linking config needed.

- [ ] **Step 3: Test the param renders**

Create `apps/mobile/app/__tests__/invite-route.test.tsx`:
```tsx
import { render } from '@testing-library/react-native';
import { I18nProvider } from '@/lib/i18n';
import { ThemeProvider } from '@/ui/theme';

jest.mock('expo-router', () => ({ useLocalSearchParams: () => ({ token: 'abc123' }) }));

// eslint-disable-next-line @typescript-eslint/no-var-requires
import InviteScreen from '../invite/[token]';

test('invite route surfaces the token from the deep link', () => {
  const { getByTestId } = render(
    <I18nProvider>
      <ThemeProvider>
        <InviteScreen />
      </ThemeProvider>
    </I18nProvider>,
  );
  expect(getByTestId('invite-token').props.children).toBe('abc123');
});
```

- [ ] **Step 4: Run the full gate**

Run: `pnpm --filter @evenup/mobile test && pnpm --filter @evenup/mobile typecheck && pnpm --filter @evenup/mobile lint`
Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/app/invite apps/mobile/app/_layout.tsx apps/mobile/app/__tests__/invite-route.test.tsx
git commit -m "feat(mobile): evenup://invite/<token> deep-link route (preview stub)"
```

---

## Self-Review

**Spec coverage (E0 slice of the design doc §3):**
- UI kit → Tasks 4–6 ✓
- Light/dark theming → Task 2 ✓
- Locale persistence + device detection → Task 3 ✓
- Tab navigation shell → Task 7 ✓
- Deep-link routing (invite) → Task 8 ✓
- Test runner (prereq for cross-cutting tests) → Task 1 ✓
- OAuth callback deep link → already wired via Better Auth Expo client `scheme: 'evenup'`; no task needed.

**Placeholder scan:** No "TBD"/"handle edge cases" — every code step has concrete code. The `activity`/`settings` tab bodies are intentional placeholders **owned by later epics** (E6/E2), flagged as such, not plan gaps.

**Type consistency:** `ThemeTokens` fields are referenced consistently (`brand`, `bg`, `card`, `text`, `textMuted`, `border`, `overlay`, `radius`, `space`, `danger`). `useTheme()` returns `ThemeTokens` everywhere. `clampAmountDecimals` signature matches web. Barrel export finalized in Task 6 (noted in Task 4 to avoid a mid-plan typecheck failure).

**Risk notes for the executor:** expo-router `Tabs`/`Modal` internals can be awkward under jest — Tasks 7–8 tests include documented shallow-mock fallbacks so router internals never block the epic. Verify i18n keys by grep before use; add to **both** `cs.ts` and `en.ts` when missing (typed catalog enforces parity).
