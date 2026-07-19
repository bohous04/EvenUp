import type { ReactNode } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme } from './theme';

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const t = useTheme();
  return (
    <View
      style={[
        {
          backgroundColor: t.card,
          borderRadius: t.radius,
          borderWidth: 1,
          borderColor: t.border,
          padding: t.space,
          gap: 10,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}
