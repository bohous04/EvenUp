import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useI18n } from '@/lib/i18n';
import { useTheme } from './theme';

/** Web's `Label`: `mb-1 block text-sm font-medium text-zinc-700`. */
export function Label({ children }: { children: string }) {
  const c = useTheme();
  return (
    <Text
      style={{
        color: c.textSecondary,
        fontSize: c.type.label.fontSize,
        fontWeight: c.type.label.fontWeight,
      }}
    >
      {children}
    </Text>
  );
}

type Props = TextInputProps & { label?: string; error?: boolean };

/**
 * Web's `Input`: `rounded-xl border border-zinc-200 bg-white px-3 py-2`, focus
 * `border-brand-500 ring-2 ring-brand-500/25`.
 *
 * RN has no `ring`, so the halo is a 2px wrapper sitting outside the border —
 * same optical result. Text is 16px rather than web's 14 so focusing a field
 * never triggers zoom on iOS.
 */
export function Input({ label, error, style, onFocus, onBlur, ...props }: Props) {
  const c = useTheme();
  const [focused, setFocused] = useState(false);

  return (
    <View style={{ gap: c.spacing[1] }}>
      {label ? <Label>{label}</Label> : null}
      <View
        style={{
          borderRadius: c.radii.lg + 2,
          padding: 2,
          backgroundColor: focused && !error ? 'rgba(99,102,241,0.25)' : 'transparent',
        }}
      >
        <TextInput
          placeholderTextColor={c.textMuted}
          accessibilityLabel={label}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
          style={[
            styles.input,
            {
              minHeight: c.control.inputHeight,
              paddingHorizontal: c.control.inputPaddingX,
              borderRadius: c.radii.lg,
              borderWidth: c.control.hairline,
              borderColor: error ? c.danger : focused ? c.brand500 : c.borderInput,
              backgroundColor: c.inputBg,
              color: c.text,
              fontSize: c.type.body.fontSize,
            },
            style,
          ]}
          {...props}
        />
      </View>
    </View>
  );
}

/** Web's `PasswordInput` — an `Input` with an eye toggle pinned right. */
export function PasswordInput({ label, ...props }: Omit<Props, 'secureTextEntry'>) {
  const c = useTheme();
  const { t } = useI18n();
  const [shown, setShown] = useState(false);

  return (
    <View style={{ position: 'relative' }}>
      <Input
        {...props}
        label={label}
        secureTextEntry={!shown}
        style={{ paddingRight: 44 }}
      />
      <Pressable
        onPress={() => setShown((s) => !s)}
        accessibilityRole="button"
        accessibilityState={{ checked: shown }}
        accessibilityLabel={shown ? t('auth.hidePassword') : t('auth.showPassword')}
        hitSlop={8}
        style={[styles.eye, { top: label ? c.type.label.fontSize + c.spacing[1] : 0 }]}
      >
        <Ionicons
          name={shown ? 'eye-off-outline' : 'eye-outline'}
          size={20}
          color={c.textMuted}
        />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  input: { justifyContent: 'center' },
  eye: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
