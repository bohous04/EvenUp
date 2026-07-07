import { requireOptionalNativeModule } from 'expo-modules-core';

/** Normalized bounding box (Vision origin is bottom-left, values 0..1). */
export interface VisionOcrBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface VisionOcrLine {
  text: string;
  /** Recognition confidence 0..1. */
  confidence: number;
  box: VisionOcrBox;
}

export interface VisionOcrModule {
  isAvailable(): boolean;
  /** Run Apple Vision text recognition on a base64 JPEG/PNG (data-URL prefix optional). */
  recognize(base64: string): Promise<VisionOcrLine[]>;
}

// `requireOptionalNativeModule` returns null instead of throwing when the native
// module isn't present (e.g. Android or a build without it), so importing this is
// always safe.
export default requireOptionalNativeModule<VisionOcrModule>('VisionOcr');
