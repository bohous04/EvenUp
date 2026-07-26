import { Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from './theme';

/**
 * Web's `iconButtonClass`: a circular `text-zinc-500` button that fills with
 * `zinc-100` on interaction. 40px here rather than web's 36 so it clears the
 * 44pt target once `hitSlop` is counted.
 */
export function IconButton({
  icon,
  onPress,
  accessibilityLabel,
  size = 22,
  color,
  testID,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  accessibilityLabel: string;
  size?: number;
  color?: string;
  testID?: string;
}) {
  const c = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      testID={testID}
      hitSlop={8}
      style={({ pressed }) => ({
        height: c.control.iconButton,
        width: c.control.iconButton,
        borderRadius: c.radii.full,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: pressed ? c.rowPressed : 'transparent',
      })}
    >
      <Ionicons name={icon} size={size} color={color ?? c.textMuted} />
    </Pressable>
  );
}
