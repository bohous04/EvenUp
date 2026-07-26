import { useRef, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { minorToDecimalString } from '@evenup/core';
import { useSession } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';
import { trpc } from '@/lib/trpc';
import { useTheme } from '@/ui/theme';
import { Button, Card, Chip, EmptyState, ErrorText, Screen, SectionLabel } from '@/ui';
import { ItemizedEditor } from '@/components/ItemizedEditor';
import { ReceiptTotalCheck } from '@/components/ReceiptTotalCheck';
import {
  buildItemizedItems,
  itemPriceToMinor,
  reconcileDiff,
  type EditorItem,
} from '@/lib/itemized';
import { MemberChip } from '@/components/MemberChip';
import { isVisionOcrAvailable, scanReceiptOnDevice } from '@/lib/vision-ocr';

interface ScannedItem {
  name: string;
  totalMinorUnits: number;
}

/** Avatar tucked into a payer `Chip`. Hidden from the a11y tree so the chip
 *  announces once, with the member's name (web renders it `aria-hidden`). */
function ChipAvatar({ initials, color }: { initials: string; color: string }) {
  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <MemberChip initials={initials} color={color} size={28} />
    </View>
  );
}

/** Receipt OCR → itemized chip assignment → save as an itemized expense (PRD §4.5, FR-5.4). */
export default function ScanScreen() {
  const { groupId } = useLocalSearchParams<{ groupId: string }>();
  const gid = String(groupId);
  const router = useRouter();
  const { t } = useI18n();
  const c = useTheme();
  const insets = useSafeAreaInsets();
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
    // Without this a rejected save is silent: the button stops spinning and the
    // review screen sits there looking unchanged. Reachable via a keyed-in
    // receipt total large enough to fail the server's safe-integer bound.
    onError: (e) => setError(e.message),
  });

  // Review-phase state (chip assignment editor).
  const [phase, setPhase] = useState<'capture' | 'review'>('capture');
  const [items, setItems] = useState<EditorItem[]>([]);
  const [receiptId, setReceiptId] = useState<string | undefined>();
  const [payerId, setPayerId] = useState<string | null>(null);
  // Receipt's printed grand total as an editable decimal string (pre-filled from
  // OCR, blank when it found none). Kept as text so the user can key in or
  // correct the total by hand; the minor-unit value is derived where it's used.
  const [receiptTotalText, setReceiptTotalText] = useState('');
  // Offer to add a proportional balancing line when the items don't sum to the
  // printed total. Defaults on only when OCR itself couldn't reconcile — a user
  // who then edits prices is overriding, so their item sum wins unless they opt
  // back in.
  const [reconcile, setReconcile] = useState(false);

  const members = (group.data?.members ?? []).filter((m) => m.isActive);
  const baseCurrency = group.data?.baseCurrency ?? 'CZK';

  function enterReview(scanned: ScannedItem[], rid?: string, totalMinorUnits = 0) {
    setReceiptId(rid);
    setItems(
      scanned.map((it) => ({
        name: it.name,
        priceText: minorToDecimalString(it.totalMinorUnits, baseCurrency),
        assigned: new Set<string>(),
      })),
    );
    setReceiptTotalText(
      totalMinorUnits > 0 ? minorToDecimalString(totalMinorUnits, baseCurrency) : '',
    );
    // Same rule the server's `reconciliation.matchesTotal` encodes, applied here
    // so the on-device Vision path (which reports no such flag) behaves alike.
    const scannedSum = scanned.reduce((a, it) => a + it.totalMinorUnits, 0);
    setReconcile(totalMinorUnits > 0 && scannedSum !== totalMinorUnits);
    const mine = members.find((m) => m.userId === session?.user?.id);
    setPayerId(mine?.id ?? members[0]?.id ?? null);
    setPhase('review');
  }

  async function processImage(base64: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await scan.mutateAsync({
        groupId: gid,
        imageDataUrl: `data:image/jpeg;base64,${base64}`,
      });
      enterReview(
        res.result.items.map((it) => ({
          name: it.nameTranslated ?? it.name,
          totalMinorUnits: it.totalMinorUnits,
        })),
        res.receiptId,
        res.result.totalMinorUnits,
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
    const result = await ImagePicker.launchImageLibraryAsync({ quality: 0.6, base64: true }).catch(
      () => null,
    );
    if (!result || result.canceled) return;
    const base64 = result.assets?.[0]?.base64;
    if (!base64) return setError(t('ocr.failed'));
    await processImage(base64);
  }

  async function scanOnDevice() {
    if (busy) return;
    const picked = await ImagePicker.launchImageLibraryAsync({ quality: 0.8, base64: true }).catch(
      () => null,
    );
    if (!picked || picked.canceled) return;
    const base64 = picked.assets?.[0]?.base64;
    if (!base64) return setError(t('ocr.failed'));
    setBusy(true);
    setError(null);
    try {
      const r = await scanReceiptOnDevice(base64, baseCurrency);
      enterReview(
        r.items.map((i) => ({ name: i.name, totalMinorUnits: i.totalMinorUnits })),
        undefined,
        r.totalMinorUnits,
      );
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
    // Reconcile to the receipt's printed total (when asked) by adding a single
    // proportional balancing line for the difference — deposits, rounding, or an
    // un-itemized discount the model couldn't attribute.
    const receiptTotalMinor = itemPriceToMinor(receiptTotalText, baseCurrency);
    const diff = reconcileDiff(built.total, receiptTotalMinor, reconcile);
    create.mutate({
      groupId: gid,
      title: t('ocr.receiptTitle'),
      currency: baseCurrency,
      date: new Date(),
      payers: [{ memberId: payerId, amountMinorUnits: built.total + diff }],
      split: {
        type: 'ITEMIZED',
        items: built.items,
        ...(diff !== 0
          ? {
              extraCharges: [
                {
                  label: t('ocr.reconcileItem'),
                  amountMinorUnits: diff,
                  allocation: { kind: 'proportional' as const },
                },
              ],
            }
          : {}),
      },
      receiptId,
    });
  }

  // ---- Review phase: chip assignment + save ----
  if (phase === 'review') {
    return (
      <Screen scroll>
        {error ? <ErrorText>{error}</ErrorText> : null}
        <Card>
          <SectionLabel>{t('expense.paidBy')}</SectionLabel>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: c.spacing[2] }}>
            {members.map((m) => (
              <Chip
                key={m.id}
                label={m.displayName}
                active={payerId === m.id}
                onPress={() => setPayerId(m.id)}
                leading={<ChipAvatar initials={m.initials} color={m.color} />}
              />
            ))}
          </View>
        </Card>
        <ItemizedEditor
          items={items}
          onChange={setItems}
          members={members}
          currency={baseCurrency}
        />
        <ReceiptTotalCheck
          items={items}
          currency={baseCurrency}
          valueText={receiptTotalText}
          onChangeText={setReceiptTotalText}
          reconcile={reconcile}
          onReconcileChange={setReconcile}
        />
        <View style={{ flexDirection: 'row', gap: c.spacing[2] }}>
          <Button
            title={t('common.save')}
            onPress={save}
            loading={create.isPending}
            testID="ocr-save"
            style={{ flex: 1 }}
          />
          <Button
            title={t('common.cancel')}
            variant="ghost"
            onPress={() => router.back()}
            style={{ flex: 1 }}
          />
        </View>
      </Screen>
    );
  }

  // ---- Capture phase ----
  if (!permission) {
    return (
      <Screen style={{ alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={c.brand} />
      </Screen>
    );
  }

  if (!permission.granted) {
    return (
      <Screen>
        <Card>
          <EmptyState
            title={t('ocr.scan')}
            icon={<Ionicons name="camera-outline" size={28} color={c.textFaint} />}
          />
          <Button title={t('common.confirm')} onPress={requestPermission} />
          <Button
            title={busy ? t('ocr.processing') : t('ocr.fromGallery')}
            variant="secondary"
            onPress={pickFromGallery}
            loading={busy}
            icon={<Ionicons name="images-outline" size={18} color={c.text} />}
          />
          <Button title={t('ocr.addItem')} variant="ghost" onPress={() => enterReview([])} />
        </Card>
        {error ? <ErrorText>{error}</ErrorText> : null}
      </Screen>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      {/* The viewfinder letterbox stays absolute black on purpose: it frames a
          live camera feed rather than sitting in the app's surface hierarchy, and
          a themed (light) letterbox would flash white while the camera warms up
          and skew how the preview's exposure reads. */}
      <View style={{ flex: 1, backgroundColor: '#000' }}>
        <CameraView ref={cameraRef} style={{ flex: 1 }} facing="back" />
      </View>
      <View
        style={{
          backgroundColor: c.card,
          borderTopWidth: c.control.hairline,
          borderTopColor: c.border,
          padding: c.spacing[4],
          paddingBottom: c.spacing[4] + insets.bottom,
          gap: c.spacing[3],
        }}
      >
        {error ? <ErrorText>{error}</ErrorText> : null}
        <Button
          title={busy ? t('ocr.processing') : t('ocr.scan')}
          onPress={capture}
          disabled={busy}
          icon={<Ionicons name="camera-outline" size={18} color={c.onBrand} />}
        />
        <Button
          title={t('ocr.fromGallery')}
          variant="secondary"
          onPress={pickFromGallery}
          disabled={busy}
          icon={<Ionicons name="images-outline" size={18} color={c.text} />}
        />
        {isVisionOcrAvailable() ? (
          <Button
            title="Apple Vision (on-device)"
            variant="secondary"
            onPress={scanOnDevice}
            disabled={busy}
            icon={<Ionicons name="scan-outline" size={18} color={c.text} />}
          />
        ) : null}
        <View style={{ flexDirection: 'row', gap: c.spacing[2] }}>
          <Button
            title={t('ocr.addItem')}
            variant="ghost"
            onPress={() => enterReview([])}
            style={{ flex: 1 }}
          />
          <Button
            title={t('common.cancel')}
            variant="ghost"
            onPress={() => router.back()}
            style={{ flex: 1 }}
          />
        </View>
      </View>
    </View>
  );
}
