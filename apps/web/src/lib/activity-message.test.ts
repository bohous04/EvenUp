import { describe, expect, it } from 'vitest';
import { createTranslator } from '@evenup/i18n';
import { describeActivity } from './activity-message';

const t = createTranslator('cs');
const formatCurrency = (minor: number) => String(minor);

describe('describeActivity', () => {
  it('localizes an empty title on transaction.updated to the settlement label', () => {
    expect(describeActivity('transaction.updated', { title: '' }, t, formatCurrency, 'Petr')).toBe(
      'Petr upravil(a) Vyrovnání',
    );
  });

  it('localizes an empty title on transaction.deleted to the settlement label', () => {
    expect(describeActivity('transaction.deleted', { title: '' }, t, formatCurrency, 'Petr')).toBe(
      'Petr smazal(a) Vyrovnání',
    );
  });

  it('keeps a real title on transaction.updated untouched', () => {
    expect(
      describeActivity('transaction.updated', { title: 'Večeře' }, t, formatCurrency, 'Petr'),
    ).toBe('Petr upravil(a) Večeře');
  });
});
