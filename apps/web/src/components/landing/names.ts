import type { Locale } from '@evenup/i18n';
import { personKey, type Person } from './avatar';

/*
 * The cast's display names per locale. Components keep the Czech person keys
 * (they pick the avatar's face and key the demo data); only what is shown
 * goes through `displayName`, so the English page reads Jake, not Jirka,
 * while Jake still wears Jirka's face.
 */
const NAMES: Record<Person, Record<Locale, string>> = {
  jirka: { cs: 'Jirka', en: 'Jake' },
  petr: { cs: 'Petr', en: 'Peter' },
  honza: { cs: 'Honza', en: 'Henry' },
  klara: { cs: 'Klára', en: 'Clara' },
  filip: { cs: 'Filip', en: 'Phil' },
  ondra: { cs: 'Ondra', en: 'Andy' },
  eva: { cs: 'Eva', en: 'Eve' },
};

/** 'Jirka' / 'jirka' → 'Jirka' (cs) or 'Jake' (en); other names pass through. */
export function displayName(name: string, locale: Locale): string {
  const p = personKey(name);
  return p ? NAMES[p][locale] : name;
}
