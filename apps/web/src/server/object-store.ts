import 'server-only';
import {
  createS3ObjectStore,
  createNoopObjectStore,
  createInMemoryObjectStore,
  type ObjectStore,
} from '@evenup/api';
import { env } from './env.js';

// One store per server process. In dev/E2E (AUTH_DEV_ECHO) an in-memory store
// makes scan->view round-trip without MinIO; else S3 when configured; else noop.
let store: ObjectStore | undefined;
export function getObjectStore(): ObjectStore {
  if (store) return store;
  if (env.authDevEcho) store = createInMemoryObjectStore();
  else if (env.storage.endpoint && env.storage.accessKey && env.storage.secretKey)
    store = createS3ObjectStore({
      endpoint: env.storage.endpoint,
      region: env.storage.region,
      accessKeyId: env.storage.accessKey,
      secretAccessKey: env.storage.secretKey,
      bucket: env.storage.bucket,
    });
  else store = createNoopObjectStore();
  return store;
}
