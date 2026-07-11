/**
 * Injectable object storage for receipt images (PRD §4.5, FR-5.8). The S3
 * implementation is MinIO-compatible (path-style). A no-op implementation lets
 * OCR work on a self-host with no storage configured. Tests use an in-memory
 * fake, so CI makes no live S3 calls.
 */
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import { NoSuchKey } from '@aws-sdk/client-s3';

export interface ObjectStore {
  putReceipt(key: string, bytes: Uint8Array, contentType: string): Promise<void>;
  deleteObject(key: string): Promise<void>;
  getObject(key: string): Promise<{ bytes: Uint8Array; contentType: string } | null>;
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
    async getObject(key) {
      try {
        const response = await client.send(
          new GetObjectCommand({
            Bucket: cfg.bucket,
            Key: key,
          }),
        );
        const bytes = await response.Body?.transformToByteArray();
        if (!bytes) return null;
        return {
          bytes,
          contentType: response.ContentType ?? 'application/octet-stream',
        };
      } catch (error) {
        if (error instanceof NoSuchKey || (error as { name?: string }).name === 'NoSuchKey') {
          return null;
        }
        throw error;
      }
    },
  };
}

export function createNoopObjectStore(): ObjectStore {
  return {
    async putReceipt() {},
    async deleteObject() {},
    async getObject() {
      return null;
    },
  };
}

/** Parse a `data:image/...` or `data:application/pdf;base64,...` URL into bytes + content type + ext. */
export function parseDataUrl(dataUrl: string): { bytes: Buffer; contentType: string; ext: string } {
  const m = /^data:(image\/[a-zA-Z0-9.+-]+|application\/pdf);base64,(.+)$/s.exec(dataUrl);
  if (!m) throw new Error('Unsupported or malformed data URL');
  const contentType = m[1]!;
  const ext =
    contentType === 'application/pdf' ? 'pdf' : (contentType.split('/')[1]?.split('+')[0] ?? 'bin');
  return { bytes: Buffer.from(m[2]!, 'base64'), contentType, ext };
}

export function createInMemoryObjectStore(): ObjectStore {
  const store = new Map<string, { bytes: Uint8Array; contentType: string }>();
  return {
    async putReceipt(key, bytes, contentType) {
      store.set(key, { bytes, contentType });
    },
    async deleteObject(key) {
      store.delete(key);
    },
    async getObject(key) {
      return store.get(key) ?? null;
    },
  };
}
