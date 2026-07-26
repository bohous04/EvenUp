/**
 * How long a stored receipt photo lives, in days — the one place the value is
 * derived from the environment.
 *
 * It had grown three independent copies of the same parse (the scan path, the
 * cleanup cron's caller, and the legal pages), which is a real hazard here
 * rather than mere duplication: the terms, the privacy policy, the price list
 * and the VIP panel all quote this number to a paying customer, and two copies
 * that disagree would put two different retention periods in front of the same
 * person. One function, imported by all of them.
 *
 * Deliberately a function, not a module-scope constant: `process.env` is
 * mutated by tests (`RECEIPT_RETENTION_DAYS=0` exercises immediate deletion),
 * and a constant would freeze whatever was set when the module first loaded.
 * Callers that need a build-time value read it once themselves.
 *
 * A malformed value (`""`, `"abc"`) parses to NaN, which would silently turn
 * the cleanup cutoff into an Invalid Date, so it falls back to the default.
 */

/** Retention window used when `RECEIPT_RETENTION_DAYS` is unset or malformed. */
export const DEFAULT_RECEIPT_RETENTION_DAYS = 30;

/** The configured receipt-photo retention window, in days. `0` means "never store". */
export function receiptRetentionDays(): number {
  const parsed = Number.parseInt(
    process.env.RECEIPT_RETENTION_DAYS ?? String(DEFAULT_RECEIPT_RETENTION_DAYS),
    10,
  );
  return Number.isFinite(parsed) ? parsed : DEFAULT_RECEIPT_RETENTION_DAYS;
}
