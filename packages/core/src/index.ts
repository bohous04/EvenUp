/**
 * @evenup/core — pure, float-free domain logic shared by web, mobile, and API.
 *
 * Single source of truth for all financial math: cent-accurate rounding, the
 * five split types, net balances + greedy debt minimization, FX conversion, and
 * SPAYD ("QR Platba") generation. Integer minor units throughout; no floats in
 * any money path.
 */

// Money primitives
export {
  type CurrencyCode,
  currencyExponent,
  isSupportedCurrency,
  minorToDecimalString,
  decimalStringToMinor,
} from './money/currency.js';
export { allocateByWeights, allocateEvenly } from './money/rounding.js';
export {
  type Rate,
  type RoundingMode,
  type ConvertOptions,
  parseRate,
  invertRate,
  convertMinorUnits,
  convert,
} from './money/fx.js';

// Splits
export {
  type SplitShare,
  type SplitInput,
  type SplitResult,
  type EqualMember,
  type ExactMember,
  type ShareMember,
  type PercentageMember,
  type ItemizedItem,
  type ItemizedInput,
  type ExtraCharge,
  type ExtraAllocation,
  splitEqually,
  splitByExactAmounts,
  splitByShares,
  splitByPercentage,
  splitItemized,
  itemizedTotal,
  computeSplit,
} from './split/split.js';

// Balances & settlement
export {
  type Balance,
  type Payment,
  type PayerEntry,
  type SplitEntry,
  type BalanceTransaction,
  type SettleOptions,
  computeNetBalances,
  minimizeDebts,
  computeDirectDebts,
  settle,
} from './balance/balance.js';
export {
  rankNextRound,
  type NextPayerCandidate,
  type NextRoundRanking,
} from './balance/next-payer.js';

// SPAYD / QR Platba
export {
  type SpaydInput,
  buildSpayd,
  isValidIban,
  normalizeIban,
  formatSpaydDate,
} from './spayd/spayd.js';

// Czech bank accounts (parsing, IBAN conversion, display mask)
export {
  type CzAccount,
  parseCzAccount,
  czAccountToIban,
  maskCzAccount,
} from './bank/cz-account.js';

// Member identity (initials + chip colors)
export {
  type MemberColor,
  MEMBER_COLORS,
  deriveInitials,
  colorForIndex,
  colorForKey,
  readableTextColor,
} from './member/identity.js';

// Expense categories + spend stats
export {
  type ExpenseCategory,
  type CategorySummary,
  type Categorizable,
  EXPENSE_CATEGORIES,
  CUSTOM_CATEGORY_ICONS,
  isExpenseCategory,
  isCustomCategoryKey,
  categoryIcon,
  summarizeByCategory,
} from './category/category.js';

// Recurring expenses
export {
  type RecurrenceInterval,
  type DueOccurrencesInput,
  RECURRENCE_INTERVALS,
  addInterval,
  dueOccurrences,
} from './recurrence/recurrence.js';

// CSV import
export {
  type ParsedExpenseRow,
  type CsvRowError,
  type ParseExpensesOptions,
  parseCsv,
  parseExpensesCsv,
} from './import/csv.js';

// Notification scheduling (digest windows, reminder thresholds, idempotency keys)
export {
  type DigestDueInput,
  type ActivityEvent,
  type DigestItem,
  type CoalesceOptions,
  type ReminderPayment,
  DEFAULT_DIGEST_INTERVAL_HOURS,
  DEFAULT_REMINDER_INTERVAL_HOURS,
  DEFAULT_REMINDER_THRESHOLD_MINOR_UNITS,
  isDigestDue,
  windowStart,
  coalesceDigest,
  reminderPayments,
  digestIdempotencyKey,
  reminderIdempotencyKey,
  settlementIdempotencyKey,
} from './notification/notification.js';

// On-device OCR receipt structuring (Apple Vision / ML Kit text → structured items)
export {
  type OcrBox,
  type OcrLine,
  type ParsedReceiptItem,
  type ParsedReceipt,
  parseReceiptText,
} from './ocr/parse-receipt.js';

/** Supported split types (PRD §4.4). */
export const SPLIT_TYPES = ['equal', 'exact', 'shares', 'percentage', 'itemized'] as const;
export type SplitType = (typeof SPLIT_TYPES)[number];

/** Transaction kinds (PRD §3, §4.3). */
export const TRANSACTION_TYPES = ['expense', 'income', 'transfer'] as const;
export type TransactionType = (typeof TRANSACTION_TYPES)[number];
