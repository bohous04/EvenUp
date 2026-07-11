/**
 * Shared zod input schemas (PRD §8.2 — input validation with zod). Money is
 * always an integer number of minor units; the API converts to/from Prisma
 * BigInt at the persistence boundary.
 */
import { z } from 'zod';

export const currencyCode = z
  .string()
  .regex(/^[A-Za-z]{3}$/, 'Must be a 3-letter ISO 4217 code')
  .transform((s) => s.toUpperCase());

export const minorUnits = z.number().int().safe();
export const positiveMinorUnits = minorUnits.refine((n) => n > 0, 'Must be positive');

export const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Must be a hex color');

export const groupTemplate = z.enum(['TRIP', 'HOUSEHOLD', 'COUPLE', 'EVENT', 'OTHER']);
export const memberRole = z.enum(['ADMIN', 'MEMBER']);
export const settlementMethod = z.enum(['CASH', 'BANK', 'QR']);

// --- Groups & members ---

export const createGroupInput = z.object({
  name: z.string().trim().min(1).max(120),
  template: groupTemplate.default('OTHER'),
  baseCurrency: currencyCode.default('CZK'),
  simplifyDebts: z.boolean().default(true),
});

export const updateGroupInput = z.object({
  groupId: z.string(),
  name: z.string().trim().min(1).max(120).optional(),
  simplifyDebts: z.boolean().optional(),
});

export const addMemberInput = z.object({
  groupId: z.string(),
  displayName: z.string().trim().min(1).max(80),
  color: hexColor.optional(),
  defaultShare: z.number().int().min(1).max(1000).default(1),
  role: memberRole.default('MEMBER'),
});

export const setBankDetailInput = z.object({
  memberId: z.string(),
  iban: z.string().trim().min(5).max(40),
  recipientName: z.string().trim().max(70).optional(),
  variableSymbol: z
    .string()
    .regex(/^\d{1,10}$/)
    .optional(),
});

// --- Splits ---

const equalSplit = z.object({
  type: z.literal('EQUAL'),
  members: z
    .array(z.object({ memberId: z.string(), weight: z.number().int().min(1).optional() }))
    .min(1),
});
const exactSplit = z.object({
  type: z.literal('EXACT'),
  members: z.array(z.object({ memberId: z.string(), exactMinorUnits: minorUnits })).min(1),
});
const sharesSplit = z.object({
  type: z.literal('SHARES'),
  members: z.array(z.object({ memberId: z.string(), weight: z.number().int().min(0) })).min(1),
});
const percentageSplit = z.object({
  type: z.literal('PERCENTAGE'),
  members: z
    .array(z.object({ memberId: z.string(), percentage: z.number().min(0).max(100) }))
    .min(1),
});
const itemizedSplit = z.object({
  type: z.literal('ITEMIZED'),
  items: z
    .array(
      z.object({
        name: z.string().optional(),
        totalMinorUnits: minorUnits,
        memberIds: z.array(z.string()).min(1),
      }),
    )
    .min(1),
  extraCharges: z
    .array(
      z.object({
        label: z.string().optional(),
        amountMinorUnits: minorUnits,
        allocation: z.discriminatedUnion('kind', [
          z.object({ kind: z.literal('proportional') }),
          z.object({ kind: z.literal('evenly'), memberIds: z.array(z.string()).min(1) }),
          z.object({
            kind: z.literal('shares'),
            members: z
              .array(z.object({ memberId: z.string(), weight: z.number().int().min(0) }))
              .min(1),
          }),
        ]),
      }),
    )
    .optional(),
});

export const splitConfig = z.discriminatedUnion('type', [
  equalSplit,
  exactSplit,
  sharesSplit,
  percentageSplit,
  itemizedSplit,
]);

// --- Transactions ---

export const createExpenseInput = z.object({
  groupId: z.string(),
  type: z.enum(['EXPENSE', 'INCOME']).default('EXPENSE'),
  title: z.string().trim().min(1).max(140),
  note: z.string().max(2000).optional(),
  currency: currencyCode,
  date: z.coerce.date(),
  category: z.string().max(60).optional(),
  payers: z.array(z.object({ memberId: z.string(), amountMinorUnits: minorUnits })).min(1),
  split: splitConfig,
  /** Exchange rate to the group base currency, as a decimal string. Defaults to 1. */
  exchangeRateToBase: z.string().optional(),
  receiptId: z.string().optional(),
});

export const recordTransferInput = z.object({
  groupId: z.string(),
  fromMemberId: z.string(),
  toMemberId: z.string(),
  amountMinorUnits: positiveMinorUnits,
  currency: currencyCode,
  method: settlementMethod.default('CASH'),
  date: z.coerce.date().optional(),
  note: z.string().max(2000).optional(),
});

/** Edit an existing expense/income in place — same shape as create, by id. */
export const updateExpenseInput = createExpenseInput.extend({ transactionId: z.string() });

/** Edit an existing settlement/transfer in place. */
export const updateTransferInput = recordTransferInput.extend({ transactionId: z.string() });

export type CreateExpenseInput = z.infer<typeof createExpenseInput>;
export type SplitConfig = z.infer<typeof splitConfig>;
export type RecordTransferInput = z.infer<typeof recordTransferInput>;
export type UpdateExpenseInput = z.infer<typeof updateExpenseInput>;
export type UpdateTransferInput = z.infer<typeof updateTransferInput>;
