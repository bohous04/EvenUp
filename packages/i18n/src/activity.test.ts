import { describe, expect, test } from 'vitest';
import {
  ACTIVITY_ACTIONS,
  ACTIVITY_PAYLOAD_FIELDS,
  describeActivity,
  createTranslator,
  catalogs,
} from './index.js';

const t = createTranslator('en');
const money = (minor: number) => `${(minor / 100).toFixed(2)} CZK`;
const describe_ = (action: string, payload: unknown, actor: string | null = 'Petr') =>
  describeActivity(action, payload, t, money, actor);

describe('describeActivity (FR-9.1)', () => {
  test('names the created thing per action, reading the right payload field', () => {
    expect(describe_('group.created', { name: 'Chata' })).toBe('Petr created Chata');
    expect(describe_('member.added', { name: 'Jana' })).toBe('Petr created Jana');
    expect(describe_('category.created', { name: 'Pivo' })).toBe('Petr created Pivo');
    // An expense carries `title`, not `name`.
    expect(describe_('expense.created', { title: 'Pizza' })).toBe('Petr created Pizza');
  });

  test('an import reports how many expenses landed', () => {
    expect(describe_('expenses.imported', { created: 12 })).toBe('Petr created 12× Add expense');
  });

  test('a settlement formats its amount through the caller-supplied formatter', () => {
    expect(describe_('settlement.recorded', { amount: 25000 })).toBe(
      'Petr settled a payment of 250.00 CZK',
    );
  });

  test('edits and deletions read their own payload field', () => {
    expect(describe_('transaction.updated', { title: 'Pizza' })).toBe('Petr edited Pizza');
    expect(describe_('transaction.deleted', { title: 'Pizza' })).toBe('Petr deleted Pizza');
    expect(describe_('category.deleted', { name: 'Pivo' })).toBe('Petr deleted Pivo');
    expect(describe_('group.archived', { name: 'Chata' })).toBe('Petr edited Chata');
  });

  test('an unknown action degrades to the raw action rather than blank text', () => {
    expect(describe_('something.new', {})).toBe('Petr edited something.new');
  });

  test('a missing actor and a missing payload both render an em dash placeholder', () => {
    expect(describe_('expense.created', { title: 'Pizza' }, null)).toBe('— created Pizza');
    expect(describe_('expense.created', null)).toBe('Petr created ');
  });

  test('a non-string payload field never leaks into the line', () => {
    expect(describe_('expense.created', { title: { evil: true } })).toBe('Petr created ');
  });

  test('every filterable action has a label in every catalog', () => {
    for (const [locale, catalog] of Object.entries(catalogs)) {
      for (const action of ACTIVITY_ACTIONS) {
        expect(
          catalog[`activityType.${action}` as keyof typeof catalog],
          `${locale}/${action}`,
        ).toBeTruthy();
      }
    }
  });

  test('names both sides of a member merge', () => {
    expect(describe_('member.merged', { from: 'Petr S.', into: 'Petr' })).toBe(
      'Petr merged Petr S. into Petr',
    );
  });

  test('every field the switch reads is on the allow-list that gates the API', () => {
    // The allow-list is applied server-side, so a field the renderer reads but
    // the list omits renders blank in production while every test here still
    // passes on a hand-built payload. Pin the two together.
    const consumed = ['name', 'title', 'created', 'amount', 'from', 'into'];
    expect([...ACTIVITY_PAYLOAD_FIELDS].sort()).toEqual(consumed.sort());
  });
});

// Moved here with `describeActivity` itself: these cases were written against
// the old apps/web copy, and the behaviour they pin — a settlement has no title
// of its own, so an empty one must fall back to the localized label rather than
// printing "Petr upravil(a) " — is easy to regress.
describe('describeActivity — Czech settlement fallback', () => {
  const cz = createTranslator('cs');
  const raw = (minor: number) => String(minor);

  test('an empty title on transaction.updated becomes the settlement label', () => {
    expect(describeActivity('transaction.updated', { title: '' }, cz, raw, 'Petr')).toBe(
      'Petr upravil(a) Vyrovnání',
    );
  });

  test('an empty title on transaction.deleted becomes the settlement label', () => {
    expect(describeActivity('transaction.deleted', { title: '' }, cz, raw, 'Petr')).toBe(
      'Petr smazal(a) Vyrovnání',
    );
  });

  test('a real title is left untouched', () => {
    expect(describeActivity('transaction.updated', { title: 'Večeře' }, cz, raw, 'Petr')).toBe(
      'Petr upravil(a) Večeře',
    );
  });
});
