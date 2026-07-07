'use client';
import { useState } from 'react';
import { useI18n } from '@/lib/i18n';
import { trpc } from '@/lib/trpc';
import { Button, Card, Label, Select } from '@/components/ui';

interface MemberLite {
  id: string;
  displayName: string;
}

/** Paste a CSV export (date, description, amount, currency) to bulk-import expenses. */
export function CsvImport({ groupId, members }: { groupId: string; members: MemberLite[] }) {
  const { t } = useI18n();
  const utils = trpc.useUtils();
  const [open, setOpen] = useState(false);
  const [csv, setCsv] = useState('');
  const [payerId, setPayerId] = useState(members[0]?.id ?? '');
  const [result, setResult] = useState<{ created: number; skipped: number; errors: number } | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);

  const importCsv = trpc.transaction.importCsv.useMutation({
    onSuccess: (r) => {
      setResult({ created: r.created, skipped: r.skipped, errors: r.errors.length });
      setError(null);
      void utils.transaction.list.invalidate({ groupId });
      void utils.balance.get.invalidate({ groupId });
      void utils.stats.byCategory.invalidate({ groupId });
    },
    onError: (e) => setError(e.message),
  });

  return (
    <Card>
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">CSV import</h3>
        <Button variant="ghost" onClick={() => setOpen((v) => !v)} data-testid="csv-toggle">
          {open ? t('common.cancel') : t('common.add')}
        </Button>
      </div>

      {open ? (
        <form
          className="mt-3 space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (csv.trim()) importCsv.mutate({ groupId, csv, payerMemberId: payerId });
          }}
        >
          <div>
            <Label htmlFor="csv-payer">{t('expense.paidBy')}</Label>
            <Select
              id="csv-payer"
              value={payerId}
              onChange={(e) => setPayerId(e.target.value)}
              data-testid="csv-payer-select"
            >
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.displayName}
                </option>
              ))}
            </Select>
          </div>
          <textarea
            className="h-32 w-full rounded-lg border border-neutral-300 bg-white p-3 font-mono text-xs dark:border-neutral-700 dark:bg-neutral-800"
            placeholder={
              'Date,Description,Category,Cost,Currency\n2026-06-22,Groceries,groceries,123.50,CZK'
            }
            value={csv}
            onChange={(e) => setCsv(e.target.value)}
            data-testid="csv-input"
          />
          {error ? (
            <p role="alert" className="text-sm text-red-700 dark:text-red-400">
              {error}
            </p>
          ) : null}
          {result ? (
            <p className="text-sm text-green-700 dark:text-green-400" data-testid="csv-result">
              + {result.created} · skipped {result.skipped} · errors {result.errors}
            </p>
          ) : null}
          <Button type="submit" disabled={importCsv.isPending} data-testid="csv-import-btn">
            {importCsv.isPending ? t('common.loading') : t('common.confirm')}
          </Button>
        </form>
      ) : null}
    </Card>
  );
}
