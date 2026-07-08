/**
 * Apple's id_token carries no `name` claim — the name arrives only in the web
 * form_post `user` parameter, and only on the user's first-ever consent. On the
 * native idToken path it is never present, and Better Auth would store `""`.
 * EvenUp shows member names throughout group lists, so an empty name is loud.
 */
import 'server-only';

const FALLBACK_NAME = 'EvenUp user';

export function appleDisplayName(profile: { name?: string | null; email?: string | null }): string {
  const name = profile.name?.trim();
  if (name) return name;

  const localPart = profile.email?.trim().split('@')[0]?.trim();
  if (localPart) return localPart;

  return FALLBACK_NAME;
}
