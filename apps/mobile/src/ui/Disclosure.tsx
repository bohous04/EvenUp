import { useState, type ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from './theme';

/**
 * Web's `DisclosureRow` from the expense form: a full-width row showing the
 * setting's name on the left and its *current value* on the right, expanding to
 * reveal the control.
 *
 * This is what keeps the form short — split type, category, date and recurrence
 * all collapse to a single line each until you need them.
 */
export function DisclosureRow({
  label,
  value,
  children,
  disabled = false,
  defaultOpen = false,
  testID,
}: {
  label: string;
  /** Current selection, shown on the right when collapsed. */
  value?: string;
  children: ReactNode;
  disabled?: boolean;
  defaultOpen?: boolean;
  testID?: string;
}) {
  const c = useTheme();
  const [open, setOpen] = useState(defaultOpen);

  return (
    <View style={{ borderBottomWidth: 1, borderBottomColor: c.divider }}>
      <Pressable
        onPress={() => setOpen((o) => !o)}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityState={{ expanded: open, disabled }}
        accessibilityLabel={label}
        testID={testID}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: c.spacing[3],
          minHeight: 48,
          opacity: disabled ? 0.6 : 1,
        }}
      >
        <Text
          style={{
            color: c.textSecondary,
            fontSize: c.type.label.fontSize,
            fontWeight: c.type.label.fontWeight,
          }}
        >
          {label}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: c.spacing[1] }}>
          {value ? (
            <Text
              numberOfLines={1}
              style={{
                color: c.brandText,
                fontSize: c.type.label.fontSize,
                fontWeight: '600',
                maxWidth: 180,
              }}
            >
              {value}
            </Text>
          ) : null}
          <Ionicons
            name={open ? 'chevron-up' : 'chevron-down'}
            size={16}
            color={c.brandText}
          />
        </View>
      </Pressable>
      {open ? <View style={{ paddingBottom: c.spacing[3], gap: c.spacing[2] }}>{children}</View> : null}
    </View>
  );
}
