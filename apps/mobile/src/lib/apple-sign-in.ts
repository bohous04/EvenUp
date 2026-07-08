import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import { authClient, signIn } from './auth';

/**
 * Apple embeds the nonce we pass into the id_token. Convention (and Better
 * Auth's `nonceMatches`) is to hand Apple the SHA-256 hash and the backend the
 * raw value, so a stolen id_token cannot be replayed without the raw nonce.
 */
async function makeNonce(): Promise<{ raw: string; hashed: string }> {
  const raw = Crypto.randomUUID();
  const hashed = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, raw);
  return { raw, hashed };
}

/**
 * Apple returns the user's real name exactly once — on their first-ever consent
 * — and never again, and it is absent from the id_token entirely. If we don't
 * capture it here, this user is `EvenUp user` forever.
 */
async function backfillName(fullName: AppleAuthentication.AppleAuthenticationFullName | null) {
  const name = [fullName?.givenName, fullName?.familyName].filter(Boolean).join(' ').trim();
  if (!name) return;
  try {
    await authClient.updateUser({ name });
  } catch {
    // A missing display name is not worth failing an otherwise good sign-in.
  }
}

export async function signInWithApple(): Promise<{ ok: boolean; canceled: boolean }> {
  const { raw, hashed } = await makeNonce();
  try {
    const credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
      nonce: hashed,
    });

    if (!credential.identityToken) return { ok: false, canceled: false };

    const res = await signIn.social({
      provider: 'apple',
      idToken: { token: credential.identityToken, nonce: raw },
    });
    if (res.error) return { ok: false, canceled: false };

    // Must run *after* the session exists — updateUser is an authenticated call.
    await backfillName(credential.fullName);
    return { ok: true, canceled: false };
  } catch (e) {
    const code = (e as { code?: string }).code;
    if (code === 'ERR_REQUEST_CANCELED') return { ok: false, canceled: true };
    throw e;
  }
}
