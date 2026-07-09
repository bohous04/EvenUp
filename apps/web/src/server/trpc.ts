/** Build the tRPC context for a request from the Better Auth session. */
import 'server-only';
import { prisma } from '@evenup/db';
import { createContext, type Context } from '@evenup/api';
import { createSecretBox } from '@evenup/api';
import { auth } from './auth.js';
import { env } from './env.js';
import { getObjectStore } from './object-store.js';
import { ocrRateLimit } from './rate-limit.js';

const secretBox = createSecretBox(env.encryptionKey);

export async function createTrpcContext(headers: Headers): Promise<Context> {
  const session = await auth.api.getSession({ headers });
  // The client sends its chosen UI locale so server error messages come back
  // translated; anything else falls back to the context default (Czech).
  const localeHeader = headers.get('x-locale');
  const locale = localeHeader === 'en' || localeHeader === 'cs' ? localeHeader : undefined;
  return createContext({
    prisma,
    secretBox,
    locale,
    user: session?.user
      ? { id: session.user.id, email: session.user.email, name: session.user.name }
      : null,
    objectStore: getObjectStore(),
    fxFetch: fetch, // global fetch enables on-demand FX; tests inject a fake
    ocrRateLimit,
  });
}
