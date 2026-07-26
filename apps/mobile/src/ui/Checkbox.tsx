import { Pressable, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from './theme';

/**
 * Web's checkbox row: `flex items-center gap-2 text-sm text-zinc-600`.
 *
 * Uses a real icon rather than `☑`/`☐` glyphs — those render at inconsistent
 * sizes across fonts, don't inherit tint, and are read aloud literally
 * ("ballot box with check") by screen readers.
 */
export function Checkbox({
  label,
  checked,
  onChange,
  disabled = false,
  testID,
}: {
  label: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  /**
   * Use while the backing value is loading or a save is in flight. Without it,
   * a control whose `checked` falls back to a default can be toggled against a
   * value that was never real.
   */
  disabled?: boolean;
  testID?: string;
}) {
  const c = useTheme();
  return (
    <Pressable
      onPress={() => onChange(!checked)}
      disabled={disabled}
      accessibilityRole="checkbox"
      accessibilityState={{ checked, disabled }}
      accessibilityLabel={label}
      testID={testID}
      hitSlop={8}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: c.spacing[2],
        minHeight: 44,
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <Ionicons
        name={checked ? 'checkbox' : 'square-outline'}
        size={22}
        color={checked ? c.brand : c.textMuted}
      />
      <Text
        style={{
          color: c.textSecondary,
          fontSize: c.type.label.fontSize,
          flexShrink: 1,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}
