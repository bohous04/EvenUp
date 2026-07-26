import type { ReactNode } from 'react';
import { ScrollView, View, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme } from './theme';

/** Web's page shell: `px-4 py-6` on a `bg-zinc-50` body. */
export function Screen({
  children,
  scroll = false,
  padded = true,
  fabClearance = false,
  style,
  testID,
}: {
  children: ReactNode;
  scroll?: boolean;
  padded?: boolean;
  /** Reserves web's `pb-24` so a FAB never covers the last row. */
  fabClearance?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}) {
  const c = useTheme();
  const inner: StyleProp<ViewStyle> = [
    { flex: scroll ? undefined : 1, backgroundColor: c.bg },
    padded ? { padding: c.spacing[4], gap: c.spacing[4] } : null,
    fabClearance ? { paddingBottom: c.spacing[24] } : null,
    style,
  ];

  if (scroll) {
    return (
      <ScrollView
        testID={testID}
        style={{ backgroundColor: c.bg }}
        contentContainerStyle={inner}
        keyboardShouldPersistTaps="handled"
      >
        {children}
      </ScrollView>
    );
  }
  return (
    <View testID={testID} style={inner}>
      {children}
    </View>
  );
}
