import type { ReactNode } from 'react';
import { Modal, Pressable, Text, View } from 'react-native';
import { useTheme } from './theme';

export function BottomSheet({
  visible,
  onClose,
  title,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
}) {
  const t = useTheme();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable
        style={{ flex: 1, backgroundColor: t.overlay, justifyContent: 'flex-end' }}
        onPress={onClose}
        accessibilityLabel="Close"
      >
        <Pressable
          onPress={() => {}}
          style={{
            backgroundColor: t.card,
            borderTopLeftRadius: 20,
            borderTopRightRadius: 20,
            padding: t.space,
            paddingBottom: 32,
            gap: 12,
          }}
        >
          <View
            style={{
              alignSelf: 'center',
              width: 40,
              height: 4,
              borderRadius: 2,
              backgroundColor: t.border,
            }}
          />
          {title ? (
            <Text style={{ fontSize: 18, fontWeight: '700', color: t.text }}>{title}</Text>
          ) : null}
          {children}
        </Pressable>
      </Pressable>
    </Modal>
  );
}
