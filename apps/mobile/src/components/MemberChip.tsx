import { Pressable, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { readableTextColor } from '@evenup/core';

/**
 * Colored member chip with initials. Color is never the only signal (the
 * initials + accessibility label accompany it) and the text color is computed
 * for contrast (PRD §9.4).
 */
export function MemberChip({
  initials,
  color,
  name,
  selected,
  size = 36,
  onPress,
  style,
}: {
  initials: string;
  color: string;
  name?: string;
  selected?: boolean;
  size?: number;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  const textColor = readableTextColor(color);
  const inner = (
    <View
      style={[
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: color,
          alignItems: 'center',
          justifyContent: 'center',
          borderWidth: selected ? 3 : 0,
          borderColor: '#171717',
        },
        style,
      ]}
    >
      <Text style={{ color: textColor, fontWeight: '700', fontSize: size * 0.36 }}>{initials}</Text>
    </View>
  );

  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityState={{ selected }}
        accessibilityLabel={name ?? initials}
      >
        {inner}
      </Pressable>
    );
  }
  return (
    <View accessibilityRole="image" accessibilityLabel={name ?? initials}>
      {inner}
    </View>
  );
}
