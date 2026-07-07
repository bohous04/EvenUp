/**
 * Dev-only store of the most recently issued magic link per email, so local
 * development and Playwright E2E can sign in without a real email transport.
 * Never enabled in production (gated by AUTH_DEV_ECHO).
 */
const lastLinks = new Map<string, string>();

export function rememberMagicLink(email: string, url: string): void {
  lastLinks.set(email.toLowerCase(), url);
}

export function consumeMagicLink(email: string): string | undefined {
  const key = email.toLowerCase();
  const url = lastLinks.get(key);
  lastLinks.delete(key);
  return url;
}
