import { Platform } from 'react-native';
import { parseReceiptText, type OcrLine, type ParsedReceipt } from '@evenup/core';
import VisionOcr from '../../modules/vision-ocr';

/** True when on-device Apple Vision OCR can be used (iOS with the module built in). */
export function isVisionOcrAvailable(): boolean {
  return Platform.OS === 'ios' && VisionOcr != null;
}

/**
 * Recognize a receipt image entirely on-device (no API key / network): Apple
 * Vision extracts the text lines, the shared `@evenup/core` parser structures
 * them into items + total + currency.
 */
export async function scanReceiptOnDevice(
  base64: string,
  fallbackCurrency: string,
): Promise<ParsedReceipt> {
  if (!VisionOcr) throw new Error('Apple Vision OCR is not available on this device');
  const lines = await VisionOcr.recognize(base64);
  const ocrLines: OcrLine[] = lines.map((l) => ({
    text: l.text,
    confidence: l.confidence,
    box: l.box,
  }));
  return parseReceiptText(ocrLines, { fallbackCurrency });
}
