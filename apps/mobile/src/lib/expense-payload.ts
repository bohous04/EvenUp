import { decimalStringToMinor } from '@evenup/core';
import type { MessageKey } from '@evenup/i18n';
import type { RouterInputs } from './trpc';

export type SplitType = 'EQUAL' | 'EXACT' | 'SHARES' | 'PERCENTAGE';
type SplitConfig = RouterInputs['transaction']['createExpense']['split'];

export interface SplitFormState {
  splitType: SplitType;
  /** Total amount as a decimal string (used for EQUAL / SHARES / PERCENTAGE). */
  amount: string;
  currency: string;
  selectedIds: string[];
  /** Per-member decimal strings for EXACT. */
  exactById: Record<string, string>;
  /** Per-member integer weights for SHARES. */
  weightById: Record<string, string>;
  /** Per-member percentages for PERCENTAGE. */
  percentById: Record<string, string>;
}

export type BuildResult =
  | { ok: true; split: SplitConfig; totalMinor: number }
  | { ok: false; error: MessageKey };

/**
 * Build a validated split config + the total in minor units from form state,
 * mirroring the web `add-expense-form` submit logic. Pure and unit-tested — the
 * server re-validates via zod + `@evenup/core`, but this keeps the client in
 * lock-step so the preview and payload never diverge. ITEMIZED is produced by
 * the OCR editor (E4), not here.
 */
export function buildSplitPayload(state: SplitFormState): BuildResult {
  const { splitType, selectedIds, currency } = state;
  if (selectedIds.length === 0) return { ok: false, error: 'split.sumMismatch' };

  try {
    if (splitType === 'EXACT') {
      const members = selectedIds.map((id) => ({
        memberId: id,
        exactMinorUnits: decimalStringToMinor(state.exactById[id] ?? '0', currency),
      }));
      const total = members.reduce((a, m) => a + m.exactMinorUnits, 0);
      if (total <= 0) return { ok: false, error: 'split.sumMismatch' };
      return { ok: true, split: { type: 'EXACT', members }, totalMinor: total };
    }

    const total = decimalStringToMinor(state.amount, currency);
    if (total <= 0) return { ok: false, error: 'split.sumMismatch' };

    if (splitType === 'EQUAL') {
      return {
        ok: true,
        split: { type: 'EQUAL', members: selectedIds.map((id) => ({ memberId: id })) },
        totalMinor: total,
      };
    }
    if (splitType === 'SHARES') {
      return {
        ok: true,
        split: {
          type: 'SHARES',
          members: selectedIds.map((id) => ({
            memberId: id,
            weight: Math.max(0, Math.round(Number(state.weightById[id] ?? '1') || 1)),
          })),
        },
        totalMinor: total,
      };
    }
    // PERCENTAGE
    const members = selectedIds.map((id) => ({
      memberId: id,
      percentage: Number(state.percentById[id] ?? '0') || 0,
    }));
    const pctSum = members.reduce((a, m) => a + m.percentage, 0);
    if (Math.abs(pctSum - 100) > 0.01) return { ok: false, error: 'split.percentMismatch' };
    return { ok: true, split: { type: 'PERCENTAGE', members }, totalMinor: total };
  } catch {
    return { ok: false, error: 'split.sumMismatch' };
  }
}
