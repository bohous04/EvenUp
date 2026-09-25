'use client';
import { AppLink } from '@/components/app-link';
import { useState } from 'react';
import { useI18n } from '@/lib/i18n';
import { useSession } from '@/lib/auth-client';
import { trpc } from '@/lib/trpc';
import { Button, Card, Input, Label } from '@/components/ui';
import { Modal } from '@/components/modal';
import { Check, Trash2 } from '@/components/icons';

function Toggle({
  checked,
  onChange,
  disabled,
  label,
  testId,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  label: string;
  testId?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      data-testid={testId}
      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-40 ${
        checked ? 'bg-brand-600' : 'bg-zinc-300 dark:bg-zinc-700'
      }`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
          checked ? 'translate-x-4' : 'translate-x-0.5'
        }`}
      />
    </button>
  );
}

/**
 * Per-user manual credit grant — the documented remedy for the known gap
 * where a process crash between a failed scan and its refund loses a
 * user's credit. Bounds (1–1000) are enforced server-side; this mirrors
 * them so a fat-fingered amount is rejected before the request is sent.
 */
function GrantCreditsControl({ userId, email }: { userId: string; email: string }) {
  const { t } = useI18n();
  const utils = trpc.useUtils();
  const [scans, setScans] = useState('');
  const [justGranted, setJustGranted] = useState(false);
  const grant = trpc.admin.grantCredits.useMutation({
    onSuccess: () => {
      setScans('');
      setJustGranted(true);
      void utils.admin.listUsers.invalidate();
    },
  });

  return (
    <form
      className="flex items-center gap-1"
      onSubmit={(e) => {
        e.preventDefault();
        setJustGranted(false);
        const n = Number(scans);
        if (Number.isInteger(n) && n >= 1 && n <= 1000) grant.mutate({ userId, scans: n });
      }}
    >
      <Input
        type="number"
        min={1}
        max={1000}
        step={1}
        inputMode="numeric"
        value={scans}
        onChange={(e) => {
          setScans(e.target.value);
          setJustGranted(false);
        }}
        placeholder={t('admin.grantCredits.placeholder')}
        aria-label={`${t('admin.grantCredits')} — ${email}`}
        className="w-16"
        data-testid={`grant-credits-input-${email}`}
      />
      <Button
        type="submit"
        variant="secondary"
        disabled={grant.isPending}
        data-testid={`grant-credits-btn-${email}`}
      >
        {t('admin.grantCredits')}
      </Button>
      {justGranted ? (
        <span className="text-xs text-green-700 dark:text-green-400">
          {t('admin.grantCredits.granted')}
        </span>
      ) : null}
    </form>
  );
}

function InstanceKeySection() {
  const { t } = useI18n();
  const utils = trpc.useUtils();
  const cfg = trpc.admin.getInstanceConfig.useQuery();
  const [apiKey, setApiKey] = useState('');
  const invalidate = () => void utils.admin.getInstanceConfig.invalidate();
  const setKey = trpc.admin.setInstanceOpenRouterKey.useMutation({
    onSuccess: () => {
      setApiKey('');
      invalidate();
    },
  });
  const clearKey = trpc.admin.clearInstanceOpenRouterKey.useMutation({ onSuccess: invalidate });
  const setOcr = trpc.admin.setInstanceOcrModel.useMutation({ onSuccess: invalidate });

  return (
    <Card>
      <h3 className="mb-1 font-semibold">{t('admin.instanceKey')}</h3>
      <p className="mb-3 text-sm text-zinc-500 dark:text-zinc-400">{t('admin.instanceKey.desc')}</p>
      {cfg.data?.hasKey ? (
        <div className="flex items-center justify-between">
          <span
            className="flex items-center gap-1 text-sm text-green-700 dark:text-green-400"
            data-testid="instance-key-status"
          >
            <Check size={16} aria-hidden /> {t('common.confirm')}
          </span>
          <Button
            variant="danger"
            onClick={() => clearKey.mutate()}
            disabled={clearKey.isPending}
            data-testid="instance-key-clear"
          >
            {t('common.delete')}
          </Button>
        </div>
      ) : (
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (apiKey.trim()) setKey.mutate({ apiKey: apiKey.trim() });
          }}
        >
          <div>
            <Label htmlFor="instance-key">{t('settings.apiKey')}</Label>
            <Input
              id="instance-key"
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="sk-or-v1-…"
              data-testid="instance-key-input"
            />
          </div>
          <Button type="submit" disabled={setKey.isPending} data-testid="instance-key-save">
            {t('common.save')}
          </Button>
        </form>
      )}
      <form
        className="mt-4 flex items-end gap-2 border-t border-zinc-100 pt-4 dark:border-zinc-800"
        onSubmit={(e) => {
          e.preventDefault();
          const model = new FormData(e.currentTarget).get('ocrModel') as string;
          setOcr.mutate({ model: model ?? '' });
        }}
      >
        <div className="flex-1">
          <Label htmlFor="instance-ocr-model">{t('admin.ocrModel')}</Label>
          <Input
            id="instance-ocr-model"
            name="ocrModel"
            defaultValue={cfg.data?.ocrModel ?? ''}
            placeholder="google/gemini-2.5-flash"
            data-testid="instance-ocr-model"
          />
        </div>
        <Button type="submit" variant="secondary" disabled={setOcr.isPending}>
          {t('common.save')}
        </Button>
      </form>
    </Card>
  );
}

const dangerIconButton =
  'inline-flex h-9 w-9 items-center justify-center rounded-full text-red-600 transition-colors hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 disabled:cursor-not-allowed disabled:opacity-40 dark:text-red-400 dark:hover:bg-red-500/10';

function UsersSection({ meId }: { meId: string }) {
  const { t, formatDate } = useI18n();
  const utils = trpc.useUtils();
  const users = trpc.admin.listUsers.useQuery(undefined);
  const invalidate = () => void utils.admin.listUsers.invalidate();
  const setVip = trpc.admin.setVip.useMutation({ onSuccess: invalidate });
  const setAdmin = trpc.admin.setAdmin.useMutation({ onSuccess: invalidate });
  const setDisabled = trpc.admin.setDisabled.useMutation({ onSuccess: invalidate });
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; email: string } | null>(null);
  const deleteUser = trpc.admin.deleteUser.useMutation({
    onSuccess: () => {
      setDeleteTarget(null);
      invalidate();
    },
  });

  return (
    <Card>
      <h3 className="mb-3 font-semibold">{t('admin.users')}</h3>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm" data-testid="admin-users-table">
          <thead className="text-xs text-zinc-500 dark:text-zinc-400">
            <tr>
              <th className="py-2 pr-3 font-medium">E-mail</th>
              <th className="px-3 py-2 font-medium">{t('admin.col.vip')}</th>
              <th className="px-3 py-2 font-medium">{t('admin.col.admin')}</th>
              <th className="px-3 py-2 font-medium">{t('admin.col.disabled')}</th>
              <th className="px-3 py-2 font-medium">{t('admin.col.credits')}</th>
              <th className="px-3 py-2 font-medium">{t('admin.col.joined')}</th>
              <th className="px-3 py-2 font-medium">{t('admin.col.actions')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {users.data?.users.map((u) => {
              const isSelf = u.id === meId;
              return (
                <tr key={u.id} data-testid={`admin-user-${u.email}`}>
                  <td className="py-2 pr-3">
                    <span className="font-medium">{u.email}</span>
                    {isSelf ? (
                      <span className="ml-1 text-xs text-zinc-500 dark:text-zinc-400">
                        {t('admin.you')}
                      </span>
                    ) : null}
                    {u.name ? (
                      <span className="block text-xs text-zinc-500 dark:text-zinc-400">
                        {u.name}
                      </span>
                    ) : null}
                  </td>
                  <td className="px-3 py-2">
                    <Toggle
                      checked={u.isVip}
                      onChange={(isVip) => setVip.mutate({ userId: u.id, isVip })}
                      label={`${t('admin.col.vip')} — ${u.email}`}
                      testId={`vip-toggle-${u.email}`}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <Toggle
                      checked={u.isAdmin}
                      disabled={isSelf}
                      onChange={(isAdmin) => setAdmin.mutate({ userId: u.id, isAdmin })}
                      label={`${t('admin.col.admin')} — ${u.email}`}
                      testId={`admin-toggle-${u.email}`}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <Toggle
                      checked={u.disabledAt !== null}
                      disabled={isSelf}
                      onChange={(disabled) => setDisabled.mutate({ userId: u.id, disabled })}
                      label={`${t('admin.col.disabled')} — ${u.email}`}
                      testId={`disabled-toggle-${u.email}`}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex flex-col gap-1">
                      <span
                        className="font-medium tabular-nums"
                        data-testid={`credit-balance-${u.email}`}
                      >
                        {u.creditBalance}
                      </span>
                      <GrantCreditsControl userId={u.id} email={u.email} />
                    </div>
                  </td>
                  <td className="px-3 py-2 text-zinc-500 dark:text-zinc-400">
                    {formatDate(u.createdAt)}
                  </td>
                  <td className="px-3 py-2">
                    <button
                      type="button"
                      disabled={isSelf}
                      onClick={() => setDeleteTarget({ id: u.id, email: u.email })}
                      aria-label={`${t('common.delete')} — ${u.email}`}
                      title={t('common.delete')}
                      className={dangerIconButton}
                      data-testid={`delete-user-${u.email}`}
                    >
                      <Trash2 size={16} aria-hidden />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <Modal
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        title={t('common.delete')}
        testId="delete-user-modal"
      >
        <p className="mb-4 text-sm">
          {deleteTarget ? t('admin.delete.confirm', { email: deleteTarget.email }) : ''}
        </p>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={() => setDeleteTarget(null)}>
            {t('common.cancel')}
          </Button>
          <Button
            type="button"
            variant="danger"
            disabled={deleteUser.isPending}
            onClick={() => deleteTarget && deleteUser.mutate({ userId: deleteTarget.id })}
            data-testid="delete-user-confirm"
          >
            {t('common.delete')}
          </Button>
        </div>
      </Modal>
    </Card>
  );
}

function ErrorsSection() {
  const { t, formatDate } = useI18n();
  const errors = trpc.admin.listErrors.useQuery(undefined);

  return (
    <Card>
      <h3 className="mb-3 font-semibold">{t('admin.errors')}</h3>
      {errors.data && errors.data.errors.length > 0 ? (
        <ul
          className="divide-y divide-zinc-100 text-sm dark:divide-zinc-800"
          data-testid="admin-errors-list"
        >
          {errors.data.errors.map((e) => (
            <li key={e.id} className="py-2">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium">
                  {e.path ?? e.source}
                  {e.code ? (
                    <span className="ml-1 text-zinc-500 dark:text-zinc-400">· {e.code}</span>
                  ) : null}
                </span>
                <span className="shrink-0 text-xs text-zinc-500 dark:text-zinc-400">
                  {formatDate(e.createdAt)}
                </span>
              </div>
              <p className="text-zinc-600 dark:text-zinc-300">{e.message}</p>
              {e.userEmail ? (
                <p className="text-xs text-zinc-500 dark:text-zinc-400">{e.userEmail}</p>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-center text-sm text-zinc-500 dark:text-zinc-400">
          {t('admin.errors.empty')}
        </p>
      )}
    </Card>
  );
}

/**
 * Billing + activity dashboard.
 *
 * **The MRR tile is either a real number or an explicit "unknown" — never
 * zero.** A local `Subscription` row has no amount on it, and the VIP price is
 * per-locale, so there is no honest way to total revenue from this database
 * alone. Showing 0 would read as "we have no revenue", which is a different and
 * false claim; showing a computed guess would read as authoritative and be
 * wrong for every EUR subscriber. `billingStats` returns `mrr: null` with a
 * reason and the panel says so.
 *
 * The counts and the two daily series ARE computed locally and are exact, so a
 * self-hosted instance with billing switched off still gets a useful panel.
 */
function BillingSection() {
  const { t, formatCurrency } = useI18n();
  const stats = trpc.admin.billingStats.useQuery();

  if (stats.isLoading || !stats.data) return null;
  const d = stats.data;
  const maxCount = Math.max(
    1,
    ...d.signupsPerDay.map((x) => x.count),
    ...d.scansPerDay.map((x) => x.count),
  );

  return (
    <Card>
      <h3 className="mb-1 font-semibold">{t('admin.billing.title')}</h3>
      <p className="mb-4 text-sm text-zinc-500 dark:text-zinc-400">{t('admin.billing.desc')}</p>

      {/* Summary first: a number an operator can act on before any chart. */}
      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat
          label={t('admin.billing.mrr')}
          value={d.mrr ? formatCurrency(d.mrr.amountMinor, d.mrr.currency) : '—'}
          hint={
            d.mrr
              ? d.mrr.currency
              : d.mrrUnavailableReason
                ? t(`admin.billing.${d.mrrUnavailableReason}`)
                : ''
          }
          testId="admin-mrr"
        />
        <Stat
          label={t('admin.billing.active')}
          value={String(d.subscriptions.active)}
          hint={`${d.subscriptions.trialing} ${t('admin.billing.trialing')}`}
          testId="admin-subs-active"
        />
        <Stat
          label={t('admin.billing.canceling')}
          value={String(d.subscriptions.cancelingAtPeriodEnd)}
          hint={t('admin.billing.cancelingHint')}
          testId="admin-subs-canceling"
        />
        <Stat
          label={t('admin.billing.credits')}
          value={String(d.creditsOutstanding)}
          hint={t('admin.billing.creditsHint')}
          testId="admin-credits"
        />
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <Series
          title={t('admin.billing.signups')}
          series={d.signupsPerDay}
          max={maxCount}
          color="var(--brand)"
        />
        <Series
          title={t('admin.billing.scans')}
          series={d.scansPerDay}
          max={maxCount}
          color="var(--series-2)"
        />
      </div>
    </Card>
  );
}

function Stat({
  label,
  value,
  hint,
  testId,
}: {
  label: string;
  value: string;
  hint: string;
  testId: string;
}) {
  return (
    <div className="rounded-xl border border-zinc-200 p-3 dark:border-zinc-800">
      <p className="text-xs text-zinc-500 dark:text-zinc-400">{label}</p>
      <p
        className="text-2xl font-extrabold tabular-nums tracking-tight"
        data-testid={testId}
        title={hint}
      >
        {value}
      </p>
      {hint ? (
        /* zinc-500, not zinc-400: at 11px this needs the full 4.5:1 and
           zinc-400 is 2.62:1 on white. Caught by the admin a11y e2e. */
        <p className="mt-0.5 text-[11px] leading-tight text-zinc-500 dark:text-zinc-400">{hint}</p>
      ) : null}
    </div>
  );
}

/**
 * 30 daily bars, one hue (each chart is a single series, so hue carries no
 * identity — the title does). The final bar is emphasised because "today" is
 * the one a reader looks for, and an axis would add ink without adding a value
 * this small.
 */
function Series({
  title,
  series,
  max,
  color,
}: {
  title: string;
  series: { date: string; count: number }[];
  max: number;
  color: string;
}) {
  const H = 72;
  const gap = 2;
  const w = 300;
  const barW = (w - gap * (series.length - 1)) / series.length;
  const total = series.reduce((a, x) => a + x.count, 0);
  return (
    <figure className="m-0">
      <figcaption className="mb-1 flex items-baseline justify-between text-sm">
        <span className="font-semibold">{title}</span>
        <span className="tabular-nums text-zinc-500 dark:text-zinc-400">{total}</span>
      </figcaption>
      <svg
        viewBox={`0 0 ${w} ${H}`}
        role="img"
        aria-label={`${title}: ${total}`}
        className="w-full"
      >
        {/* Recessive baseline instead of a full grid: 30 bars need no y-axis to
            be read, and the ink would cost more than the information. */}
        <line x1="0" y1={H - 0.5} x2={w} y2={H - 0.5} stroke="var(--line-strong, #d4d4d8)" />
        {series.map((d, i) => {
          const h = d.count === 0 ? 1 : Math.max(2, (d.count / max) * (H - 4));
          const isLast = i === series.length - 1;
          return (
            <rect
              key={d.date}
              x={i * (barW + gap)}
              y={H - h}
              width={barW}
              height={h}
              rx={1.5}
              fill={color}
              // A zero bar is still drawn, at 1px, so the series reads as a
              // continuous run of days rather than a gap in the data.
              opacity={d.count === 0 ? 0.25 : isLast ? 1 : 0.55}
            />
          );
        })}
      </svg>
      <p className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400">
        {series[0]?.date} → {series[series.length - 1]?.date}
      </p>
    </figure>
  );
}

export default function AdminPage() {
  const { t } = useI18n();
  const { data: session, isPending } = useSession();
  const me = trpc.user.me.useQuery(undefined, { enabled: !!session?.user });

  if (isPending || (!!session?.user && me.isLoading)) {
    return <p className="text-zinc-500 dark:text-zinc-400">…</p>;
  }

  // Non-admins (and signed-out visitors) never see the dashboard.
  if (!session?.user || !me.data?.isAdmin) {
    return (
      <Card>
        <p className="text-red-700 dark:text-red-400">{t('error.notFound')}</p>
        <AppLink href="/groups" className="mt-2 inline-block text-brand-700 underline">
          {t('common.back')}
        </AppLink>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-extrabold tracking-tight" data-testid="admin-title">
        {t('nav.admin')}
      </h1>
      <BillingSection />
      <InstanceKeySection />
      <UsersSection meId={me.data.id} />
      <ErrorsSection />
    </div>
  );
}
