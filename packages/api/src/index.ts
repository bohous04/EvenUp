/**
 * @evenup/api — the type-safe tRPC API surface. The web and mobile clients
 * import `AppRouter` for end-to-end type inference; the web route handler uses
 * `appRouter`, `createContext`, and `createCallerFactory`.
 */
export { appRouter, type AppRouter } from './root.js';
export {
  createContext,
  type Context,
  type CreateContextOptions,
  type AuthUser,
  type RateLimiter,
} from './context.js';
export {
  createS3ObjectStore,
  createNoopObjectStore,
  createInMemoryObjectStore,
  parseImageDataUrl,
  type ObjectStore,
  type S3Config,
} from './storage/object-store.js';
export { createCallerFactory } from './trpc.js';
export { createRateLimiter } from './rate-limit.js';
export {
  generateEncryptionKey,
  createSecretBox,
  encryptSecret,
  decryptSecret,
  type SecretBox,
} from './crypto/secret-box.js';
export {
  extractReceipt,
  OcrError,
  DEFAULT_OCR_MODEL,
  type OcrResult,
  type FetchLike,
} from './ocr/openrouter-adapter.js';
export { RECEIPT_JSON_SCHEMA, receiptSchema } from './ocr/schema.js';
export { getGroupBalances, type MemberBalance } from './services/balance-service.js';
export { planExpense } from './services/transaction-service.js';
export { cleanupExpiredReceipts } from './services/receipt-cleanup.js';
