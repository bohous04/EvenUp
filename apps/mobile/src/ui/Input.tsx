import { StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';
import { useTheme } from './theme';

export function Input({ label, style, ...props }: TextInputProps & { label?: string }) {
  const t = useTheme();
  return (
    <View style={{ gap: 6 }}>
      {label ? <Text style={{ color: t.textMuted, fontSize: 13 }}>{label}</Text> : null}
      <TextInput
        placeholderTextColor={t.textMuted}
        accessibilityLabel={label}
        style={[
          styles.input,
          { borderColor: t.border, backgroundColor: t.bg, color: t.text, borderRadius: t.radius },
          style,
        ]}
        {...props}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  input: { borderWidth: 1, padding: 12, fontSize: 16 },
});
