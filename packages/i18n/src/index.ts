/**
 * @evenup/i18n — shared CZ/EN message catalogs and locale-aware formatting.
 * Czech is the default language (FR-10.1).
 */
export {
  t,
  createTranslator,
  catalogs,
  LOCALES,
  DEFAULT_LOCALE,
  type MessageKey,
  type InterpolationValues,
} from './translate.js';
export { formatCurrency, formatNumber, formatDate, formatNameList, type Locale } from './format.js';
export { cs } from './locales/cs.js';
export { en } from './locales/en.js';
export type { Messages } from './locales/cs.js';
