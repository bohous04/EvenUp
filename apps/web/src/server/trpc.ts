/** Build the tRPC context for a request from the Better Auth session. */
import 'server-only';
import { prisma } from '@evenup/db';
import {
  createContext,
  createS3ObjectStore,
  createNoopObjectStore,
  type Context,
  type ObjectStore,
} from '@evenup/api';
import { createSecretBox } from '@evenup/api';
import { auth } from './auth.js';
import { env } from './env.js';

const secretBox = createSecretBox(env.encryptionKey);

const objectStore: ObjectStore =
  env.storage.endpoint && env.storage.accessKey && env.storage.secretKey
    ? createS3ObjectStore({
        endpoint: env.storage.endpoint,
        region: env.storage.region,
        accessKeyId: env.storage.accessKey,
        secretAccessKey: env.storage.secretKey,
        bucket: env.storage.bucket,
      })
    : createNoopObjectStore();

export async function createTrpcContext(headers: Headers): Promise<Context> {
  const session = await auth.api.getSession({ headers });
  return createContext({
    prisma,
    secretBox,
    user: session?.user ? { id: session.user.id, email: session.user.email } : null,
    objectStore,
    fxFetch: fetch, // global fetch enables on-demand FX; tests inject a fake
  });
}
