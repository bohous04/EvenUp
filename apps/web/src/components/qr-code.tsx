'use client';
import { useEffect, useState } from 'react';
import QRCode from 'qrcode';

/** Render a SPAYD string as a "QR Platba" code (client-side, PRD §16.1). */
export function QrCode({ value }: { value: string }) {
  const [src, setSrc] = useState('');
  useEffect(() => {
    let active = true;
    QRCode.toDataURL(value, { margin: 1, width: 220, errorCorrectionLevel: 'M' })
      .then((url) => {
        if (active) setSrc(url);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [value]);

  if (!src) return null;
  // A data-URL QR image; next/image optimization is unnecessary here.
  return (
    <img src={src} alt="QR Platba" width={220} height={220} className="rounded-lg bg-white p-2" />
  );
}
