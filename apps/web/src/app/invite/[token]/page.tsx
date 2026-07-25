'use client';
import { use, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useI18n } from '@/lib/i18n';
import { useSession } from '@/lib/auth-client';
import { trpc } from '@/lib/trpc';
import { Button, Card } from '@/components/ui';
import { Modal } from '@/components/modal';
import { MemberChip } from '@/components/member-chip';
import { SignIn } from '@/components/sign-in';

/** A member's balance rendered as a short, self-contained phrase. */
function BalanceHint({ minorUnits, currency }: { minorUnits: number; currency: string }) {
  const { t, formatCurrency } = useI18n();
  if (minorUnits === 0) {
    return <span className="text-xs text-zinc-500 dark:text-zinc-400">{t('invite.settled')}</span>;
  }
  const key = minorUnits < 0 ? 'invite.owes' : 'invite.isOwed';
  // `whitespace-nowrap` keeps the whole phrase (and therefore the amount)
  // unbroken, which is the design-spec rule AmountText exists to enforce.
  return (
    <span className="text-xs whitespace-nowrap tabular-nums text-zinc-600 dark:text-zinc-300">
      {t(key, { amount: formatCurrency(Math.abs(minorUnits), currency) })}
    </span>
  );
}

export default function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const { t } = useI18n();
  const router = useRouter();
  const { data: session, isPending } = useSession();
  // Public, name-only — drives the pre-sign-in group name.
  const preview = trpc.invite.preview.useQuery({ token });
  // Protected, carries balances — only fetched once signed in.
  const options = trpc.invite.claimOptions.useQuery(
    { token },
    { enabled: Boolean(session?.user) },
  );
  const claim = trpc.invite.claim.useMutation({
    onSuccess: () => router.push('/'),
  });
  const [error, setError] = useState<string | null>(null);
  const [confirmNew, setConfirmNew] = useState(false);

  if (isPending) return <p className="py-10 text-center text-zinc-500 dark:text-zinc-400">…</p>;
  if (!session?.user) {
    return (
      <div>
        <p className="mb-4 text-center text-sm text-zinc-600 dark:text-zinc-300">
          {t('invite.claim')}
        </p>
        <SignIn callbackURL={`/invite/${token}`} />
      </div>
    );
  }
  if (options.isLoading || preview.isLoading)
    return <p className="text-zinc-500 dark:text-zinc-400">{t('common.loading')}</p>;
  if (options.isError || !options.data) {
    return (
      <Card>
        <p className="text-red-700 dark:text-red-400">{t('invite.expired')}</p>
      </Card>
    );
  }

  const { groupName, baseCurrency, members } = options.data;
  const joinAsNew = () =>
    claim.mutate({ token }, { onError: (e) => setError(e.message) });

  return (
    <Card>
      <h1 className="mb-1 text-xl font-extrabold tracking-tight">{groupName}</h1>
      <p className="mb-4 text-sm text-zinc-600 dark:text-zinc-300">
        {members.length > 0 ? t('invite.pickYourName') : t('invite.claim')}
      </p>
      {error ? (
        <p role="alert" className="mb-2 text-sm text-red-700 dark:text-red-400">
          {error}
        </p>
      ) : null}

      {/* Each unclaimed member is a large, primary tap target — picking your own
          name is the main action, not a muted afterthought next to it. */}
      <ul className="space-y-2">
        {members.map((m) => (
          <li key={m.id}>
            <button
              type="button"
              data-testid={`invite-member-${m.id}`}
              disabled={claim.isPending}
              onClick={() =>
                claim.mutate({ token, memberId: m.id }, { onError: (e) => setError(e.message) })
              }
              className="flex w-full items-center gap-3 rounded-xl border border-zinc-200 bg-white p-3 text-left transition hover:border-zinc-400 hover:bg-zinc-50 focus-visible:ring-2 focus-visible:ring-zinc-900 focus-visible:outline-none disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:border-zinc-500 dark:hover:bg-zinc-800 dark:focus-visible:ring-zinc-100"
            >
              <MemberChip initials={m.initials} color={m.color} name={m.displayName} size="sm" />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold">{m.displayName}</span>
                <BalanceHint minorUnits={m.balanceMinorUnits} currency={baseCurrency} />
              </span>
              <span className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
                {t('invite.thisIsMe')}
              </span>
            </button>
          </li>
        ))}
      </ul>

      {/* Demoted from a primary button to a text link, and it no longer mutates
          directly — the confirmation is what actually creates the account. */}
      <div className="mt-4 border-t border-zinc-100 pt-4 text-center dark:border-zinc-800">
        <button
          type="button"
          data-testid="invite-join-new"
          onClick={() => (members.length === 0 ? joinAsNew() : setConfirmNew(true))}
          className="rounded text-sm text-zinc-500 underline underline-offset-4 hover:text-zinc-800 focus-visible:ring-2 focus-visible:ring-zinc-900 focus-visible:outline-none dark:text-zinc-400 dark:hover:text-zinc-100 dark:focus-visible:ring-zinc-100"
        >
          {t('invite.notOnList')}
        </button>
      </div>

      <Modal
        open={confirmNew}
        onClose={() => setConfirmNew(false)}
        title={t('invite.confirmNewTitle')}
        testId="invite-confirm-new-dialog"
      >
        <p className="mb-3 text-sm text-zinc-600 dark:text-zinc-300">
          {t('invite.confirmNewBody')}
        </p>
        <ul className="mb-4 space-y-1">
          {members.map((m) => (
            <li key={m.id} className="flex items-center gap-2 text-sm">
              <MemberChip initials={m.initials} color={m.color} name={m.displayName} size="sm" />
              <span className="min-w-0 flex-1 truncate">{m.displayName}</span>
              <BalanceHint minorUnits={m.balanceMinorUnits} currency={baseCurrency} />
            </li>
          ))}
        </ul>
        <div className="flex flex-col gap-2">
          <Button data-testid="invite-confirm-back" onClick={() => setConfirmNew(false)}>
            {t('invite.confirmBack')}
          </Button>
          <Button
            variant="secondary"
            data-testid="invite-confirm-new-cta"
            disabled={claim.isPending}
            onClick={() => {
              setConfirmNew(false);
              joinAsNew();
            }}
          >
            {t('invite.confirmNewCta')}
          </Button>
        </div>
      </Modal>
    </Card>
  );
}
