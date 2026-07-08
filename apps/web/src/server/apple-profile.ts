/**
 * Apple's id_token carries no `name` claim — the name arrives only in the web
 * form_post `user` parameter, and only on the user's first-ever consent. On the
 * native idToken path it is never present, and Better Auth would store `""`.
 * EvenUp shows member names throughout group lists, so an empty name is loud.
 *
 * Neither source is server-fetched or size-limited by Apple: the web value is
 * a caller-supplied form field, and the native value is the raw idToken
 * request body, so both are unbounded strings reaching `User.name`, a
 * Postgres `text` column. Cap what we store.
 */
import 'server-only';

const FALLBACK_NAME = 'EvenUp user';
const MAX_NAME_LENGTH = 128;

export function appleDisplayName(profile: { name?: string | null; email?: string | null }): string {
  const name = profile.name?.trim();
  if (name) return name.slice(0, MAX_NAME_LENGTH);

  const localPart = profile.email?.trim().split('@')[0]?.trim();
  if (localPart) return localPart.slice(0, MAX_NAME_LENGTH);

  return FALLBACK_NAME;
}
