'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useI18n } from '@/lib/i18n';
import { trpc } from '@/lib/trpc';
import { Button, Card, Input, Label, Select } from '@/components/ui';
import { MemberChip } from '@/components/member-chip';

const TEMPLATES = ['TRIP', 'HOUSEHOLD', 'COUPLE', 'EVENT', 'OTHER'] as const;
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
  const [template, setTemplate] = useState<(typeof TEMPLATES)[number]>('TRIP');
  const [currency, setCurrency] = useState<(typeof CURRENCIES)[number]>('CZK');

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t('nav.groups')}</h1>
        <Button onClick={() => setOpen((v) => !v)} data-testid="new-group-btn">
          {t('group.create')}
        </Button>
      </div>

      {open ? (
        <Card>
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              createGroup.mutate({ name, template, baseCurrency: currency });
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
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="g-template">{t('group.template')}</Label>
                <Select
                  id="g-template"
                  value={template}
                  onChange={(e) => setTemplate(e.target.value as (typeof TEMPLATES)[number])}
                >
                  {TEMPLATES.map((tpl) => (
                    <option key={tpl} value={tpl}>
                      {t(`group.template.${tpl.toLowerCase()}` as never)}
                    </option>
                  ))}
                </Select>
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
            </div>
            <Button
              type="submit"
              disabled={createGroup.isPending}
              data-testid="create-group-submit"
            >
              {createGroup.isPending ? t('common.loading') : t('common.save')}
            </Button>
          </form>
        </Card>
      ) : null}

      {groups.isLoading ? (
        <p className="text-zinc-500">{t('common.loading')}</p>
      ) : groups.data && groups.data.length > 0 ? (
        <ul className="space-y-3">
          {groups.data.map((g) => (
            <li key={g.id}>
              <Link href={`/groups/${g.id}`} className="block">
                <Card className="transition-shadow hover:shadow-md">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-semibold">{g.name}</p>
                      <p className="text-xs text-zinc-500">
                        {g._count.transactions} · {g.baseCurrency}
                      </p>
                    </div>
                    <div className="flex -space-x-2">
                      {g.members.slice(0, 5).map((m) => (
                        <MemberChip
                          key={m.id}
                          initials={m.initials}
                          color={m.color}
                          name={m.displayName}
                          size="sm"
                        />
                      ))}
                    </div>
                  </div>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <Card>
          <p className="text-center text-zinc-500">{t('group.empty')}</p>
        </Card>
      )}
    </div>
  );
}
