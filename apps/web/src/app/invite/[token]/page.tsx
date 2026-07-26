'use client';
import { use, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useI18n } from '@/lib/i18n';
import { useSession } from '@/lib/auth-client';
import { trpc } from '@/lib/trpc';
import { Button, Card } from '@/components/ui';
import { Modal } from '@/components/modal';
import { MemberChip } from '@/components/member-chip';
import { AmountText } from '@/components/amount-text';
import { SignIn } from '@/components/sign-in';

/** A member's balance rendered as a short, self-contained phrase. */
function BalanceHint({ minorUnits, currency }: { minorUnits: number; currency: string }) {
  const { t } = useI18n();
  if (minorUnits === 0) {
    return <span className="text-xs text-zinc-500 dark:text-zinc-400">{t('invite.settled')}</span>;
  }
  const key = minorUnits < 0 ? 'invite.owes' : 'invite.isOwed';
  // The label word is free to truncate under pressure, but the amount itself
  // sits in AmountText's non-shrinking slot — same never-wrap-or-clip
  // contract balances-card.tsx uses for money (see amount-text.tsx). That's
  // what actually stops the phrase from spilling past its box; nowrap alone
  // (the old approach) only stops line-breaking, not overflow.
  // Both locales put `{amount}` at the end, preceded by a space (see
  // packages/i18n/src/locales/{cs,en}.ts) — interpolating an empty string
  // for it leaves that trailing space in the label's own text node, so
  // splitting into two spans doesn't change concatenated textContent (still
  // "owes 1 234 Kč", not "owes1 234 Kč" — matters for screen readers and
  // any test asserting on text). That trailing space renders as zero-width
  // once the label is blockified as a flex item, though, so `gap-1` is what
  // actually produces the visible gap — the two together give correct text
  // *and* correct rendering; either alone gets only one right.
  return (
    <span className="flex min-w-0 items-baseline gap-1 text-xs text-zinc-600 dark:text-zinc-300">
      <span className="min-w-0 truncate">{t(key, { amount: '' })}</span>
      <AmountText minorUnits={Math.abs(minorUnits)} currency={currency} className="shrink-0" />
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
  const options = trpc.invite.claimOptions.useQuery({ token }, { enabled: Boolean(session?.user) });
  const [error, setError] = useState<string | null>(null);
  const [confirmNew, setConfirmNew] = useState(false);
  // Synchronous in-flight guard. `claim.isPending` (and the `disabled` props
  // driven by it) only reflect reality after a re-render, so a fast
  // double-click/double-tap on any trigger can still fire two concurrent
  // mutations before React catches up. This ref is checked-and-set at the
  // call site itself, closing that gap regardless of render timing.
  const pendingRef = useRef(false);
  const claim = trpc.invite.claim.useMutation({
    onSuccess: () => router.push('/'),
    onSettled: () => {
      pendingRef.current = false;
    },
  });

  // Already in this group? Don't make them read a card and click a button —
  // go straight there and explain it with a banner on arrival. The server-side
  // guard in `invite.claim` is what actually prevents a duplicate; this is UX.
  const alreadyMember = options.data?.alreadyMember ?? false;
  const alreadyGroupId = options.data?.groupId;
  useEffect(() => {
    if (alreadyMember && alreadyGroupId) {
      router.replace(`/groups/${alreadyGroupId}?already=1`);
    }
  }, [alreadyMember, alreadyGroupId, router]);

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
  if (options.data.alreadyMember) {
    // The effect above is already redirecting; render nothing interactive so
    // the name list never flashes while that navigation is in flight.
    return <p className="text-zinc-500 dark:text-zinc-400">{t('common.loading')}</p>;
  }

  const { groupName, baseCurrency, members, returningMember } = options.data;
  // The one call site for claim.mutate — every trigger (member rows, the
  // "not on the list" link, the confirm-dialog CTA, and the welcome-back CTA)
  // routes through this, so the in-flight guard can't be bypassed by any one
  // of them.
  const submitClaim = (memberId?: string) => {
    if (pendingRef.current) return;
    pendingRef.current = true;
    claim.mutate(memberId ? { token, memberId } : { token }, {
      onError: (e) => setError(e.message),
    });
  };
  const joinAsNew = () => submitClaim();

  // A returning ex-member: the server reactivates THEIR row and only theirs
  // (claiming anyone else is refused with CONFLICT), so the picker and the
  // "not on the list" escape hatch are both dead ends here — the picker's
  // own row was filtered out upstream (preview/claimOptions only ever list
  // unclaimed members), and "not on the list" would just re-explain the same
  // wrong story the confirmation modal tells newcomers (that debts stay
  // behind on a name nobody takes over). Give them one action instead: go
  // back to the profile that's already theirs, history and debts included.
  if (returningMember) {
    return (
      <Card>
        <h1 className="mb-1 text-xl font-extrabold tracking-tight">{groupName}</h1>
        <p
          className="mb-4 text-sm text-zinc-600 dark:text-zinc-300"
          data-testid="invite-welcome-back"
        >
          {t('invite.welcomeBack', { name: returningMember.displayName })}
        </p>
        <p className="mb-4 text-sm text-zinc-600 dark:text-zinc-300">
          {t('invite.welcomeBackBody')}
        </p>
        {error ? (
          <p role="alert" className="mb-2 text-sm text-red-700 dark:text-red-400">
            {error}
          </p>
        ) : null}
        <Button
          data-testid="invite-welcome-back-cta"
          disabled={claim.isPending}
          // Deliberately no memberId: the server re-derives the caller's own
          // row from findOwnMembership (isActive desc, no tiebreaker) and
          // throws CONFLICT if it disagrees with a passed id. With two
          // inactive rows for the same user (production has these — see
          // invite.ts:32) claimOptions and claim could pick different ones
          // and strand this button. Calling with no id reaches the same
          // reactivate branch (invite.ts's `own` check short-circuits when
          // input.memberId is undefined) without that tiebreak risk.
          onClick={() => submitClaim()}
          className="w-full"
        >
          {t('invite.welcomeBackCta')}
        </Button>
      </Card>
    );
  }

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
              onClick={() => submitClaim(m.id)}
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
          disabled={claim.isPending}
          onClick={() => (members.length === 0 ? joinAsNew() : setConfirmNew(true))}
          className="rounded text-sm text-zinc-500 underline underline-offset-4 hover:text-zinc-800 focus-visible:ring-2 focus-visible:ring-zinc-900 focus-visible:outline-none disabled:opacity-50 dark:text-zinc-400 dark:hover:text-zinc-100 dark:focus-visible:ring-zinc-100"
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
