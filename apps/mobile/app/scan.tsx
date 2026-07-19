import { useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { minorToDecimalString } from '@evenup/core';
import { useSession } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';
import { trpc } from '@/lib/trpc';
import { useTheme } from '@/ui/theme';
import { Button, Screen } from '@/ui';
import { ItemizedEditor } from '@/components/ItemizedEditor';
import { buildItemizedItems, type EditorItem } from '@/lib/itemized';
import { MemberChip } from '@/components/MemberChip';
import { isVisionOcrAvailable, scanReceiptOnDevice } from '@/lib/vision-ocr';

interface ScannedItem {
  name: string;
  totalMinorUnits: number;
}

/** Receipt OCR → itemized chip assignment → save as an itemized expense (PRD §4.5, FR-5.4). */
export default function ScanScreen() {
  const { groupId } = useLocalSearchParams<{ groupId: string }>();
  const gid = String(groupId);
  const router = useRouter();
  const { t } = useI18n();
  const c = useTheme();
  const { data: session } = useSession();
  const utils = trpc.useUtils();

  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const group = trpc.group.get.useQuery({ groupId: gid });
  const scan = trpc.ocr.scan.useMutation();
  const create = trpc.transaction.createExpense.useMutation({
    onSuccess: () => {
      void utils.balance.get.invalidate({ groupId: gid });
      void utils.transaction.list.invalidate({ groupId: gid });
      router.replace(`/group/${gid}`);
    },
  });

  // Review-phase state (chip assignment editor).
  const [phase, setPhase] = useState<'capture' | 'review'>('capture');
  const [items, setItems] = useState<EditorItem[]>([]);
  const [receiptId, setReceiptId] = useState<string | undefined>();
  const [payerId, setPayerId] = useState<string | null>(null);

  const members = (group.data?.members ?? []).filter((m) => m.isActive);
  const baseCurrency = group.data?.baseCurrency ?? 'CZK';

  function enterReview(scanned: ScannedItem[], rid?: string) {
    setReceiptId(rid);
    setItems(
      scanned.map((it) => ({
        name: it.name,
        priceText: minorToDecimalString(it.totalMinorUnits, baseCurrency),
        assigned: new Set<string>(),
      })),
    );
    const mine = members.find((m) => m.userId === session?.user?.id);
    setPayerId(mine?.id ?? members[0]?.id ?? null);
    setPhase('review');
  }

  async function processImage(base64: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await scan.mutateAsync({ groupId: gid, imageDataUrl: `data:image/jpeg;base64,${base64}` });
      enterReview(
        res.result.items.map((it) => ({
          name: it.nameTranslated ?? it.name,
          totalMinorUnits: it.totalMinorUnits,
        })),
        res.receiptId,
      );
    } catch (e) {
      // Manual entry is always available (FR-5.6): fall through to an empty editor.
      setError(e instanceof Error ? e.message : t('ocr.failed'));
      enterReview([]);
    } finally {
      setBusy(false);
    }
  }

  async function capture() {
    if (!cameraRef.current || busy) return;
    const photo = await cameraRef.current
      .takePictureAsync({ base64: true, quality: 0.6 })
      .catch(() => null);
    if (!photo?.base64) return setError(t('ocr.failed'));
    await processImage(photo.base64);
  }

  async function pickFromGallery() {
    if (busy) return;
    const result = await ImagePicker.launchImageLibraryAsync({ quality: 0.6, base64: true }).catch(() => null);
    if (!result || result.canceled) return;
    const base64 = result.assets?.[0]?.base64;
    if (!base64) return setError(t('ocr.failed'));
    await processImage(base64);
  }

  async function scanOnDevice() {
    if (busy) return;
    const picked = await ImagePicker.launchImageLibraryAsync({ quality: 0.8, base64: true }).catch(() => null);
    if (!picked || picked.canceled) return;
    const base64 = picked.assets?.[0]?.base64;
    if (!base64) return setError(t('ocr.failed'));
    setBusy(true);
    setError(null);
    try {
      const r = await scanReceiptOnDevice(base64, baseCurrency);
      enterReview(r.items.map((i) => ({ name: i.name, totalMinorUnits: i.totalMinorUnits })));
    } catch (e) {
      setError(e instanceof Error ? e.message : t('ocr.failed'));
    } finally {
      setBusy(false);
    }
  }

  function save() {
    if (!payerId) return;
    const built = buildItemizedItems(items, baseCurrency);
    if (!built.ok) {
      setError(t(built.error));
      return;
    }
    create.mutate({
      groupId: gid,
      title: t('ocr.receiptTitle'),
      currency: baseCurrency,
      date: new Date(),
      payers: [{ memberId: payerId, amountMinorUnits: built.total }],
      split: { type: 'ITEMIZED', items: built.items },
      receiptId,
    });
  }

  // ---- Review phase: chip assignment + save ----
  if (phase === 'review') {
    return (
      <Screen scroll>
        {error ? <Text style={{ color: c.danger }}>{error}</Text> : null}
        <View style={{ gap: 6 }}>
          <Text style={{ color: c.textMuted, fontSize: 12 }}>{t('expense.paidBy')}</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
            {members.map((m) => (
              <MemberChip
                key={m.id}
                initials={m.initials}
                color={m.color}
                name={m.displayName}
                selected={payerId === m.id}
                onPress={() => setPayerId(m.id)}
              />
            ))}
          </View>
        </View>
        <ItemizedEditor items={items} onChange={setItems} members={members} currency={baseCurrency} />
        <Button
          title={t('common.save')}
          onPress={save}
          loading={create.isPending}
          testID="ocr-save"
        />
        <Button title={t('common.cancel')} variant="ghost" onPress={() => router.back()} />
      </Screen>
    );
  }

  // ---- Capture phase ----
  if (!permission) {
    return (
      <Screen>
        <ActivityIndicator color={c.brand} />
      </Screen>
    );
  }

  if (!permission.granted) {
    return (
      <Screen>
        <Text style={{ color: c.text }}>{t('ocr.scan')}</Text>
        <Button title={t('common.confirm')} onPress={requestPermission} />
        <Button
          title={busy ? t('ocr.processing') : t('ocr.fromGallery')}
          variant="secondary"
          onPress={pickFromGallery}
          loading={busy}
        />
        <Button title={t('ocr.addItem')} variant="ghost" onPress={() => enterReview([])} />
        {error ? <Text style={{ color: c.danger }}>{error}</Text> : null}
      </Screen>
    );
  }

  return (
    <View style={styles.container}>
      <CameraView ref={cameraRef} style={styles.camera} facing="back" />
      <View style={styles.controls}>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Pressable style={styles.button} onPress={capture} disabled={busy}>
          <Text style={styles.buttonText}>{busy ? t('ocr.processing') : t('ocr.scan')}</Text>
        </Pressable>
        <Pressable style={styles.galleryButton} onPress={pickFromGallery} disabled={busy}>
          <Ionicons name="images-outline" size={18} color="#fff" />
          <Text style={styles.buttonText}>{t('ocr.fromGallery')}</Text>
        </Pressable>
        {isVisionOcrAvailable() ? (
          <Pressable style={styles.deviceButton} onPress={scanOnDevice} disabled={busy}>
            <Ionicons name="scan-outline" size={18} color="#fff" />
            <Text style={styles.buttonText}>Apple Vision (on-device)</Text>
          </Pressable>
        ) : null}
        <Pressable onPress={() => enterReview([])}>
          <Text style={styles.link}>{t('ocr.addItem')}</Text>
        </Pressable>
        <Pressable onPress={() => router.back()}>
          <Text style={styles.link}>{t('common.cancel')}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  camera: { flex: 1 },
  controls: { padding: 20, gap: 12, backgroundColor: '#000' },
  error: { color: '#fca5a5', textAlign: 'center' },
  button: { backgroundColor: '#2563eb', borderRadius: 12, padding: 14, alignItems: 'center' },
  galleryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#4b5563',
    borderRadius: 12,
    padding: 14,
  },
  deviceButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#059669',
    borderRadius: 12,
    padding: 14,
  },
  buttonText: { color: '#fff', fontWeight: '700' },
  link: { color: '#fff', textAlign: 'center' },
});
