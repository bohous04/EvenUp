import { Pressable, Text } from 'react-native';
import { useTheme } from './theme';

export function Chip({
  label,
  active = false,
  onPress,
}: {
  label: string;
  active?: boolean;
  onPress?: () => void;
}) {
  const t = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      style={{
        borderWidth: 1,
        borderColor: active ? t.brand : t.border,
        backgroundColor: active ? t.brand : t.bg,
        borderRadius: 999,
        paddingVertical: 6,
        paddingHorizontal: 12,
      }}
    >
      <Text style={{ color: active ? '#fff' : t.text, fontWeight: active ? '700' : '600' }}>
        {label}
      </Text>
    </Pressable>
  );
}
