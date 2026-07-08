import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import { signIn } from './auth';

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
 * — and never again, and it is absent from the id_token entirely. We forward it
 * as `idToken.user` on the `/sign-in/social` call so Better Auth's Apple
 * provider can read it via `token.user.name`. Better Auth only applies that
 * name when it *creates* a new user; if this sign-in instead links into an
 * existing EvenUp account, the name is left untouched, so we never clobber a
 * name the account's owner already chose.
 */
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

    const fn = credential.fullName;
    const res = await signIn.social({
      provider: 'apple',
      idToken: {
        token: credential.identityToken,
        nonce: raw,
        ...(fn?.givenName || fn?.familyName
          ? {
              user: {
                name: {
                  firstName: fn.givenName ?? undefined,
                  lastName: fn.familyName ?? undefined,
                },
              },
            }
          : {}),
      },
    });
    if (res.error) return { ok: false, canceled: false };
    return { ok: true, canceled: false };
  } catch (e) {
    const code = (e as { code?: string }).code;
    if (code === 'ERR_REQUEST_CANCELED') return { ok: false, canceled: true };
    throw e;
  }
}
