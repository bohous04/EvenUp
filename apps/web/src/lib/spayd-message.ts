import { SPAYD_MESSAGE_MAX_LENGTH } from '@evenup/core';

/**
 * Clamp a SPAYD `MSG` value to the length the server will accept.
 *
 * `settlement.generateSpayd` validates `message` with
 * `z.string().max(SPAYD_MESSAGE_MAX_LENGTH)` (packages/api/src/routers/settlement.ts)
 * — an over-length string is *rejected*, not truncated. The truncation inside
 * `buildSpayd`'s `sanitizeValue` (packages/core/src/spayd/spayd.ts) only runs
 * after that validation already passed, so it never gets a chance to save an
 * over-long message. The web layer has to stay under the limit itself before
 * sending.
 *
 * Re-exported from `@evenup/core`, which owns the constant, so this module
 * keeps its existing public name for callers that already import it from here.
 */
export { SPAYD_MESSAGE_MAX_LENGTH };

/** Cut a message down to `SPAYD_MESSAGE_MAX_LENGTH` characters, unchanged if it already fits. */
export function clampSpaydMessage(message: string): string {
  return message.slice(0, SPAYD_MESSAGE_MAX_LENGTH);
}
