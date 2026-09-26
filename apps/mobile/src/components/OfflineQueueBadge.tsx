import { View, Text } from 'react-native';
import { useI18n } from '@/lib/i18n';
import { useTheme } from '@/ui/theme';
import { Button } from '@/ui';

/**
 * The offline queue, made visible. The RN counterpart of the web badge, with
 * the same rule behind both: **pending is normal, stuck is not, and neither is
 * ever silently dropped.** A stuck item is named and offered a retry, because
 * an expense the user recorded and watched vanish is the worst outcome this
 * feature can produce.
 */
export function OfflineQueueBadge({
  pending,
  stuckItems,
  onRetry,
  onDiscard,
}: {
  pending: number;
  stuckItems: { id: string; title: string }[];
  onRetry: () => void;
  onDiscard: (id: string) => void;
}) {
  const { t } = useI18n();
  const c = useTheme();
  if (pending === 0 && stuckItems.length === 0) return null;

  return (
    <View style={{ gap: c.spacing[2] }} testID="offline-queue">
      {pending > 0 ? (
        <View
          accessibilityRole="alert"
          testID="offline-pending"
          style={{
            borderRadius: 12,
            borderWidth: 1,
            borderColor: c.border,
            backgroundColor: c.card,
            padding: c.spacing[3],
          }}
        >
          <Text style={{ color: c.text, fontSize: c.type.label.fontSize }}>
            {t('offline.pendingCount', { count: pending })}
          </Text>
        </View>
      ) : null}

      {stuckItems.length > 0 ? (
        <View
          accessibilityRole="alert"
          testID="offline-stuck"
          style={{
            borderRadius: 12,
            borderWidth: 1,
            borderColor: c.danger,
            padding: c.spacing[3],
            gap: c.spacing[2],
          }}
        >
          <Text style={{ color: c.dangerText, fontWeight: '700', fontSize: c.type.label.fontSize }}>
            {t('offline.stuck')}
          </Text>
          <Text style={{ color: c.textMuted, fontSize: c.type.meta.fontSize }}>
            {t('offline.stuckBody')}
          </Text>
          {stuckItems.map((item) => (
            <View
              key={item.id}
              style={{ flexDirection: 'row', alignItems: 'center', gap: c.spacing[2] }}
            >
              <Text
                numberOfLines={1}
                style={{ flex: 1, color: c.text, fontSize: c.type.body.fontSize }}
              >
                {item.title}
              </Text>
              <Button
                title={t('offline.retry')}
                variant="secondary"
                onPress={onRetry}
                testID="offline-retry"
              />
              <Button
                title={t('offline.discard')}
                variant="ghost"
                onPress={() => onDiscard(item.id)}
                testID="offline-discard"
              />
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}
