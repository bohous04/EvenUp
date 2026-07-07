/**
 * Injectable object storage for receipt images (PRD §4.5, FR-5.8). The S3
 * implementation is MinIO-compatible (path-style). A no-op implementation lets
 * OCR work on a self-host with no storage configured. Tests use an in-memory
 * fake, so CI makes no live S3 calls.
 */
import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';

export interface ObjectStore {
  putReceipt(key: string, bytes: Uint8Array, contentType: string): Promise<void>;
  deleteObject(key: string): Promise<void>;
}

export interface S3Config {
  endpoint: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
}

export function createS3ObjectStore(cfg: S3Config): ObjectStore {
  const client = new S3Client({
    endpoint: cfg.endpoint,
    region: cfg.region,
    forcePathStyle: true, // MinIO
    credentials: { accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey },
  });
  return {
    async putReceipt(key, bytes, contentType) {
      await client.send(
        new PutObjectCommand({
          Bucket: cfg.bucket,
          Key: key,
          Body: bytes,
          ContentType: contentType,
        }),
      );
    },
    async deleteObject(key) {
      await client.send(new DeleteObjectCommand({ Bucket: cfg.bucket, Key: key }));
    },
  };
}

export function createNoopObjectStore(): ObjectStore {
  return {
    async putReceipt() {},
    async deleteObject() {},
  };
}

/** Parse a `data:image/...;base64,...` URL into raw bytes + content type + extension. */
export function parseImageDataUrl(dataUrl: string): {
  bytes: Buffer;
  contentType: string;
  ext: string;
} {
  const m = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/s.exec(dataUrl);
  if (!m) throw new Error('Unsupported or malformed image data URL');
  const contentType = m[1]!;
  const ext = contentType.split('/')[1]?.split('+')[0] ?? 'bin';
  return { bytes: Buffer.from(m[2]!, 'base64'), contentType, ext };
}
