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
    padded ? { padding: t.space, gap: 16 } : null,
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
