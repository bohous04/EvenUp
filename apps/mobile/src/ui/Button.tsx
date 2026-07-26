import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import type { ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { useTheme } from './theme';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

/**
 * Mirrors web's `Button` (`apps/web/src/components/ui.tsx`) variant for variant.
 * Web's `hover:` states become `pressed` here — touch has no hover, and a
 * latched hover colour is the classic mobile-web bug we don't want to inherit.
 */
export function Button({
  title,
  onPress,
  variant = 'primary',
  loading = false,
  disabled = false,
  icon,
  testID,
  style,
}: {
  title: string;
  onPress: () => void;
  variant?: Variant;
  loading?: boolean;
  disabled?: boolean;
  icon?: ReactNode;
  testID?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const c = useTheme();
  const off = disabled || loading;

  const fill = { primary: c.brand, danger: c.danger, secondary: c.card, ghost: 'transparent' }[
    variant
  ];
  const fillPressed = {
    primary: c.brand700,
    danger: c.dangerPressed,
    secondary: c.rowPressed,
    ghost: c.brandTint,
  }[variant];
  const fg =
    variant === 'primary' || variant === 'danger'
      ? c.onBrand
      : variant === 'secondary'
        ? c.text
        : c.brandText;

  return (
    <Pressable
      onPress={onPress}
      disabled={off}
      accessibilityRole="button"
      accessibilityState={{ disabled: off }}
      testID={testID}
      style={({ pressed }) => [
        styles.base,
        {
          minHeight: c.control.height,
          paddingHorizontal: c.control.paddingX,
          borderRadius: c.radii.lg,
          backgroundColor: pressed && !off ? fillPressed : fill,
          borderWidth: variant === 'secondary' ? c.control.hairline : 0,
          borderColor: c.borderInput,
        },
        off && styles.disabled,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <View style={styles.row}>
          {icon}
          <Text
            style={{
              color: fg,
              fontSize: c.type.bodySemibold.fontSize,
              fontWeight: c.type.bodySemibold.fontWeight,
            }}
          >
            {title}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  disabled: { opacity: 0.5 },
});
