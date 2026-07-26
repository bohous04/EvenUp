import type { ReactNode } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme } from './theme';

/**
 * Web's `Card`: `rounded-2xl border border-zinc-200 bg-white p-5`.
 *
 * Deliberately **no shadow** — the design spec defines cards by a hairline
 * border and reserves elevation for the FAB and sheets alone.
 */
export function Card({
  children,
  style,
  gap,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  gap?: number;
}) {
  const c = useTheme();
  return (
    <View
      style={[
        {
          backgroundColor: c.card,
          borderRadius: c.radii.xl,
          borderWidth: c.control.hairline,
          borderColor: c.border,
          padding: c.spacing[5],
          gap: gap ?? c.spacing[3],
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}
