/**
 * @evenup/i18n — shared CZ/EN message catalogs and locale-aware formatting.
 * Czech is the default language (FR-10.1).
 */
export {
  t,
  plural,
  createTranslator,
  catalogs,
  LOCALES,
  DEFAULT_LOCALE,
  type MessageKey,
  type InterpolationValues,
} from './translate.js';
export {
  formatCurrency,
  formatNumber,
  formatDate,
  formatNameList,
  pluralCategory,
  type Locale,
} from './format.js';
export { cs } from './locales/cs.js';
export { en } from './locales/en.js';
export type { Messages } from './locales/cs.js';
/**
 * The marketing namespace is exported separately from the app catalogs: only
 * the public landing page under `app/[locale]/(marketing)` reads it, and its
 * keys are intentionally not assignable to `MessageKey` (nor the reverse).
 */
export {
  tMarketing,
  createMarketingTranslator,
  marketingCatalogs,
  type MarketingKey,
} from './marketing.js';
export { marketingCs, marketingEn, type MarketingMessages } from './locales/marketing.js';
