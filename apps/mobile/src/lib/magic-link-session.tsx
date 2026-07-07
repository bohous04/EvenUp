import { useEffect } from 'react';
import { router } from 'expo-router';
import * as Linking from 'expo-linking';
import * as SecureStore from 'expo-secure-store';
import { getSetCookie, storageAdapter } from '@better-auth/expo/client';
import { authClient } from './auth';

// Mirror the @better-auth/expo client's storage so a cookie we persist here is
// read back by `authClient.getCookie()` on every request. The prefix must match
// the one passed to `expoClient(...)` in ./auth (`evenup`).
const storage = storageAdapter(SecureStore);
const COOKIE_NAME = 'evenup_cookie';

function cookieFromUrl(url: string): string | null {
  try {
    return new URL(url).searchParams.get('cookie');
  } catch {
    return null;
  }
}

async function captureSession(url: string | null): Promise<void> {
  if (!url) return;
  const cookie = cookieFromUrl(url);
  if (!cookie) {
    console.log('[magic-link] deep link without cookie:', url.slice(0, 40));
    return;
  }
  // Persist exactly as the client does internally for its OAuth browser flow.
  const prev = storage.getItem(COOKIE_NAME) ?? undefined;
  await storage.setItem(COOKIE_NAME, getSetCookie(cookie, prev));
  // Pull the now-authenticated session and leave the sign-in screen.
  const { data } = await authClient.getSession({ query: { disableCookieCache: true } });
  console.log('[magic-link] captured session, signed in:', !!data?.user);
  router.replace('/');
}

/**
 * Captures the session from an externally-tapped magic-link deep link.
 *
 * The magic-link email opens in the *system* browser, which (via the server's
 * `expo()` plugin) redirects to `evenup://?cookie=<set-cookie>`. The
 * @better-auth/expo client only reads that cookie from its own in-app browser
 * (OAuth) flow, so for email links nothing would persist it and the app bounces
 * back to sign-in. This bridge handles the incoming deep link itself. Renders
 * nothing.
 */
export function MagicLinkSessionBridge() {
  useEffect(() => {
    Linking.getInitialURL().then(captureSession);
    const sub = Linking.addEventListener('url', (e) => captureSession(e.url));
    return () => sub.remove();
  }, []);
  return null;
}
