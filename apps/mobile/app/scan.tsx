import { useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { minorToDecimalString } from '@evenup/core';
import { useI18n } from '@/lib/i18n';
import { trpc } from '@/lib/trpc';
import { isVisionOcrAvailable, scanReceiptOnDevice } from '@/lib/vision-ocr';
import { theme } from '@/theme';

/** Native receipt OCR — camera or gallery (PRD §4.5, FR-5.1). */
export default function ScanScreen() {
  const { groupId } = useLocalSearchParams<{ groupId: string }>();
  const router = useRouter();
  const { t } = useI18n();
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const scan = trpc.ocr.scan.useMutation();

  // Shared OCR path for both camera capture and gallery pick.
  async function processImage(base64: string) {
    if (!groupId) return;
    setBusy(true);
    setError(null);
    try {
      const result = await scan.mutateAsync({
        groupId: String(groupId),
        imageDataUrl: `data:image/jpeg;base64,${base64}`,
      });
      // Hand the extracted items back to the group for chip assignment.
      router.replace({
        pathname: `/group/${groupId}`,
        params: { receiptId: result.receiptId },
      });
    } catch (e) {
      // Manual entry is always available (FR-5.6).
      setError(e instanceof Error ? e.message : t('ocr.failed'));
    } finally {
      setBusy(false);
    }
  }

  async function capture() {
    if (!cameraRef.current || busy) return;
    const photo = await cameraRef.current
      .takePictureAsync({ base64: true, quality: 0.6 })
      .catch(() => null);
    if (!photo?.base64) {
      setError(t('ocr.failed'));
      return;
    }
    await processImage(photo.base64);
  }

  async function pickFromGallery() {
    if (busy) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      quality: 0.6,
      base64: true,
    }).catch(() => null);
    if (!result || result.canceled) return;
    const base64 = result.assets?.[0]?.base64;
    if (!base64) {
      setError(t('ocr.failed'));
      return;
    }
    await processImage(base64);
  }

  // Spike: fully on-device OCR (Apple Vision) — no API key, no network. Shows the
  // parsed receipt so accuracy can be judged before wiring full expense creation.
  async function scanOnDevice() {
    if (busy) return;
    const picked = await ImagePicker.launchImageLibraryAsync({
      quality: 0.8,
      base64: true,
    }).catch(() => null);
    if (!picked || picked.canceled) return;
    const base64 = picked.assets?.[0]?.base64;
    if (!base64) {
      setError(t('ocr.failed'));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const r = await scanReceiptOnDevice(base64, 'CZK');
      const itemLines = r.items
        .map((i) => `${i.name}  —  ${minorToDecimalString(i.totalMinorUnits, r.currency)}`)
        .join('\n');
      Alert.alert(
        r.merchant ?? 'Receipt',
        `${itemLines || '(no items recognized)'}\n\nTotal: ${minorToDecimalString(
          r.totalMinorUnits,
          r.currency,
        )} ${r.currency}\n\nRecognized on-device with Apple Vision — no API used.`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : t('ocr.failed'));
    } finally {
      setBusy(false);
    }
  }

  if (!permission) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={theme.brand} />
      </View>
    );
  }

  // Camera permission not granted — gallery still works without it.
  if (!permission.granted) {
    return (
      <View style={styles.center}>
        <Text style={styles.text}>{t('ocr.scan')}</Text>
        <Pressable style={styles.button} onPress={requestPermission}>
          <Text style={styles.buttonText}>{t('common.confirm')}</Text>
        </Pressable>
        <Pressable style={styles.galleryButton} onPress={pickFromGallery} disabled={busy}>
          <Ionicons name="images-outline" size={18} color="#fff" />
          <Text style={styles.buttonText}>
            {busy ? t('ocr.processing') : t('ocr.fromGallery')}
          </Text>
        </Pressable>
        {error ? <Text style={styles.error}>{error}</Text> : null}
      </View>
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
        <Pressable onPress={() => router.back()}>
          <Text style={styles.link}>{t('common.cancel')}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 },
  camera: { flex: 1 },
  controls: { padding: 20, gap: 12, backgroundColor: '#000' },
  text: { color: theme.text },
  error: { color: '#fca5a5', textAlign: 'center' },
  button: { backgroundColor: theme.brand, borderRadius: 12, padding: 14, alignItems: 'center' },
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
