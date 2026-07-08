import { describe, it, expect } from 'vitest';
import {
  parseImageDataUrl,
  createNoopObjectStore,
  createInMemoryObjectStore,
} from './object-store.js';

describe('parseImageDataUrl', () => {
  it('decodes a base64 png data URL to bytes + content type + ext', () => {
    // 1x1 transparent PNG
    const b64 =
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M8AAAMBAQDJ/pLvAAAAAElFTkSuQmCC';
    const { bytes, contentType, ext } = parseImageDataUrl(`data:image/png;base64,${b64}`);
    expect(contentType).toBe('image/png');
    expect(ext).toBe('png');
    expect(bytes.length).toBeGreaterThan(0);
    expect(bytes.equals(Buffer.from(b64, 'base64'))).toBe(true);
  });

  it('throws on a non-image / malformed data URL', () => {
    expect(() => parseImageDataUrl('data:text/plain;base64,aGk=')).toThrow();
    expect(() => parseImageDataUrl('not-a-data-url')).toThrow();
  });
});

describe('createNoopObjectStore', () => {
  it('resolves without doing anything', async () => {
    const store = createNoopObjectStore();
    await expect(store.putReceipt('k', new Uint8Array([1]), 'image/png')).resolves.toBeUndefined();
    await expect(store.deleteObject('k')).resolves.toBeUndefined();
  });
});

describe('createInMemoryObjectStore', () => {
  it('round-trips put -> get and delete -> null', async () => {
    const s = createInMemoryObjectStore();
    await s.putReceipt('receipts/g/a.png', new Uint8Array([1, 2, 3]), 'image/png');
    const got = await s.getObject('receipts/g/a.png');
    expect(got?.contentType).toBe('image/png');
    expect(Array.from(got!.bytes)).toEqual([1, 2, 3]);
    await s.deleteObject('receipts/g/a.png');
    expect(await s.getObject('receipts/g/a.png')).toBeNull();
  });
  it('getObject returns null for a missing key', async () => {
    expect(await createInMemoryObjectStore().getObject('nope')).toBeNull();
  });
});
