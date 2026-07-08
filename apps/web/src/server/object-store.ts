import 'server-only';
import {
  createS3ObjectStore,
  createNoopObjectStore,
  createInMemoryObjectStore,
  type ObjectStore,
} from '@evenup/api';
import { env } from './env.js';

// One store per server process. S3 wins whenever it's configured (prod must
// never silently fall back to in-memory); in-memory is only for dev/E2E
// (AUTH_DEV_ECHO) without S3, so scan->view round-trips without MinIO; else noop.
let store: ObjectStore | undefined;
export function getObjectStore(): ObjectStore {
  if (store) return store;
  if (env.storage.endpoint && env.storage.accessKey && env.storage.secretKey)
    store = createS3ObjectStore({
      endpoint: env.storage.endpoint,
      region: env.storage.region,
      accessKeyId: env.storage.accessKey,
      secretAccessKey: env.storage.secretKey,
      bucket: env.storage.bucket,
    });
  else if (env.authDevEcho) store = createInMemoryObjectStore();
  else store = createNoopObjectStore();
  return store;
}
