import { Pressable, Text, View } from 'react-native';
import { useTheme } from './theme';

/**
 * Web's `Segmented` (`apps/web/src/components/add-expense-form.tsx`): a bordered
 * `rounded-lg` track with `p-1`, holding `rounded-md` items where the selected
 * one takes a solid brand fill.
 *
 * This used to render a plain wrapped row of `Chip`s, which read as filters
 * rather than a single-choice control.
 */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  testID,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  testID?: string;
}) {
  const c = useTheme();
  return (
    <View
      accessibilityRole="radiogroup"
      testID={testID}
      style={{
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'center',
        gap: c.spacing[1],
        borderWidth: c.control.hairline,
        borderColor: c.borderInput,
        borderRadius: c.radii.md,
        padding: c.spacing[1],
      }}
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable
            key={o.value}
            onPress={() => onChange(o.value)}
            accessibilityRole="radio"
            accessibilityState={{ selected: active }}
            style={({ pressed }) => ({
              borderRadius: c.radii.sm,
              paddingHorizontal: c.spacing[3],
              paddingVertical: c.spacing[2],
              minHeight: 36,
              justifyContent: 'center',
              backgroundColor: active ? c.brand : pressed ? c.rowPressed : 'transparent',
            })}
          >
            <Text
              style={{
                color: active ? c.onBrand : c.textSecondary,
                fontSize: c.type.label.fontSize,
                fontWeight: '500',
              }}
            >
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
