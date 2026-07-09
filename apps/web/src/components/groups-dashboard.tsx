'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useI18n } from '@/lib/i18n';
import { trpc } from '@/lib/trpc';
import { Button, Card, EmptyState, Input, Label, Select } from '@/components/ui';
import { AvatarStack } from '@/components/member-chip';
import { Sheet } from '@/components/sheet';
import { Fab } from '@/components/fab';
import { Users } from '@/components/icons';

const CURRENCIES = ['CZK', 'EUR', 'USD', 'GBP', 'PLN'] as const;

export function GroupsDashboard() {
  const { t } = useI18n();
  const utils = trpc.useUtils();
  const groups = trpc.group.list.useQuery();
  const createGroup = trpc.group.create.useMutation({
    onSuccess: () => {
      void utils.group.list.invalidate();
      setOpen(false);
      setName('');
    },
  });

  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [currency, setCurrency] = useState<(typeof CURRENCIES)[number]>('CZK');

  return (
    <div className="space-y-4 pb-24">
      <h1 className="text-2xl font-extrabold tracking-tight">{t('nav.groups')}</h1>

      {groups.isLoading ? (
        <p className="text-zinc-500 dark:text-zinc-400">{t('common.loading')}</p>
      ) : groups.data && groups.data.length > 0 ? (
        <ul className="space-y-3">
          {groups.data.map((g) => (
            <li key={g.id}>
              <Link href={`/groups/${g.id}`} className="block">
                <Card className="flex items-center gap-3 transition-colors hover:border-zinc-300 dark:hover:border-zinc-700">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold tracking-tight">{g.name}</p>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">
                      {g._count.transactions} · {g.baseCurrency}
                    </p>
                  </div>
                  <AvatarStack
                    members={g.members.map((m) => ({
                      id: m.id,
                      initials: m.initials,
                      color: m.color,
                      displayName: m.displayName,
                    }))}
                  />
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <Card>
          <EmptyState icon={<Users size={28} aria-hidden />} title={t('group.empty')} />
        </Card>
      )}

      <Fab
        onClick={() => setOpen(true)}
        aria-label={t('group.create')}
        data-testid="new-group-btn"
      />

      <Sheet open={open} onClose={() => setOpen(false)} title={t('group.create')}>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            createGroup.mutate({ name, baseCurrency: currency });
          }}
        >
          <div>
            <Label htmlFor="g-name">{t('group.name')}</Label>
            <Input
              id="g-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              data-testid="group-name-input"
            />
          </div>
          <div>
            <Label htmlFor="g-currency">{t('group.baseCurrency')}</Label>
            <Select
              id="g-currency"
              value={currency}
              onChange={(e) => setCurrency(e.target.value as (typeof CURRENCIES)[number])}
            >
              {CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          </div>
          <Button
            type="submit"
            className="w-full"
            disabled={createGroup.isPending}
            data-testid="create-group-submit"
          >
            {createGroup.isPending ? t('common.loading') : t('common.save')}
          </Button>
        </form>
      </Sheet>
    </div>
  );
}
