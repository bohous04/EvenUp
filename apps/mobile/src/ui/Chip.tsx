import type { ReactNode } from 'react';
import { Pressable, Text } from 'react-native';
import { useTheme } from './theme';

/**
 * Web's selectable pill:
 * selected `border-brand-600 bg-brand-50 font-medium text-brand-700`,
 * unselected `border-zinc-200`.
 *
 * Note this is a **tint**, not a solid brand fill — a row of solid indigo pills
 * reads as several primary actions competing for the tap.
 *
 * `leading` (an avatar) triggers web's asymmetric `pl-1 pr-3` so the avatar
 * sits flush against the left edge.
 */
export function Chip({
  label,
  active = false,
  onPress,
  leading,
  trailing,
  dimWhenInactive = false,
  testID,
}: {
  label: string;
  active?: boolean;
  onPress?: () => void;
  leading?: ReactNode;
  trailing?: ReactNode;
  /** Web adds `opacity-60` to unselected split chips. */
  dimWhenInactive?: boolean;
  testID?: string;
}) {
  const c = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      testID={testID}
      style={({ pressed }) => [
        {
          flexDirection: 'row',
          alignItems: 'center',
          gap: c.spacing[2],
          borderWidth: c.control.hairline,
          borderColor: active ? c.brand : c.borderInput,
          backgroundColor: active ? c.brandSurface : pressed ? c.rowPressed : 'transparent',
          borderRadius: c.radii.full,
          paddingVertical: leading ? c.spacing[1] : c.spacing[1.5],
          paddingLeft: leading ? c.spacing[1] : c.spacing[3],
          paddingRight: c.spacing[3],
          minHeight: 36,
        },
        !active && dimWhenInactive && { opacity: 0.6 },
      ]}
    >
      {leading}
      <Text
        style={{
          color: active ? c.brandTextStrong : c.text,
          fontSize: c.type.label.fontSize,
          fontWeight: active ? '500' : '400',
        }}
      >
        {label}
      </Text>
      {trailing}
    </Pressable>
  );
}
