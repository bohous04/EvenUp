import { Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from './theme';

/**
 * Web's `Fab`: a 56px brand circle pinned bottom-right, `shadow-lg
 * shadow-brand-600/30`. The one place the design spec allows elevation.
 *
 * Pair with `Screen`'s `fabClearance` so the last row can scroll clear of it.
 */
export function Fab({
  onPress,
  accessibilityLabel,
  icon = 'add',
  testID,
}: {
  onPress: () => void;
  accessibilityLabel: string;
  icon?: keyof typeof Ionicons.glyphMap;
  testID?: string;
}) {
  const c = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      testID={testID}
      style={({ pressed }) => ({
        position: 'absolute',
        right: c.spacing[5],
        // No tab-bar offset: a tab screen's content area already ends above the
        // tab bar, so adding one on top of the inset pushed the button visibly
        // higher than the same FAB on a plain stack screen.
        bottom: Math.max(c.spacing[5], insets.bottom),
        height: c.control.fab,
        width: c.control.fab,
        borderRadius: c.radii.full,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: pressed ? c.brand700 : c.brand,
        shadowColor: c.brand,
        shadowOpacity: 0.3,
        shadowRadius: 15,
        shadowOffset: { width: 0, height: 10 },
        elevation: 6,
      })}
    >
      <Ionicons name={icon} size={26} color={c.onBrand} />
    </Pressable>
  );
}
