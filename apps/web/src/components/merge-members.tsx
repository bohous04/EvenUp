'use client';
import { useRef, useState } from 'react';
import { useI18n } from '@/lib/i18n';
import { trpc } from '@/lib/trpc';
import { Button, Card } from '@/components/ui';
import { Modal } from '@/components/modal';

const DISMISS_KEY = 'evenup:merge-dismissed';

function dismissedPairs(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(DISMISS_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

function dismissPair(key: string) {
  try {
    window.localStorage.setItem(DISMISS_KEY, JSON.stringify([...dismissedPairs(), key]));
  } catch {
    // A full or disabled localStorage just means the banner returns later.
  }
}

/** Confirmation dialog: shows what moves before anything is merged. */
export function MergeDialog({
  groupId,
  sourceMemberId,
  targetMemberId,
  onClose,
}: {
  groupId: string;
  sourceMemberId: string;
  targetMemberId: string;
  onClose: () => void;
}) {
  const { t, formatCurrency } = useI18n();
  const utils = trpc.useUtils();
  const preview = trpc.member.mergePreview.useQuery({ sourceMemberId, targetMemberId });
  // React clears `disabled` only on re-render, so a fast double-click can fire
  // two merges. The second races the first's FOR UPDATE lock and then fails on
  // a source that no longer exists — an error for a merge that actually
  // succeeded. Guard synchronously, same as the invite page's claim.
  const pendingRef = useRef(false);
  const merge = trpc.member.merge.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.member.list.invalidate({ groupId }),
        utils.balance.get.invalidate({ groupId }),
        utils.member.duplicateCandidates.invalidate({ groupId }),
        utils.group.get.invalidate({ groupId }),
        // The merge writes a `member.merged` entry; without this the feed
        // keeps showing the pre-merge history.
        utils.activity.list.invalidate({ groupId }),
      ]);
      onClose();
    },
    onSettled: () => {
      pendingRef.current = false;
    },
  });

  const blocked = (preview.data?.blockingTransfers.length ?? 0) > 0;

  function submitMerge() {
    if (pendingRef.current) return;
    pendingRef.current = true;
    merge.mutate({ sourceMemberId, targetMemberId });
  }

  return (
    <Modal open onClose={onClose} title={t('merge.title')} testId="merge-dialog">
      {preview.isLoading ? (
        <p className="text-zinc-500 dark:text-zinc-400">{t('common.loading')}</p>
      ) : !preview.data ? (
        // A failed preview must not masquerade as a spinner — and Cancel lives
        // in the success branch, so without this the dialog would look like it
        // was loading forever with no visible way out.
        <>
          <p role="alert" className="mb-4 text-sm text-red-700 dark:text-red-400">
            {preview.error?.message ?? t('errors.memberNotFound')}
          </p>
          <Button variant="secondary" onClick={onClose}>
            {t('merge.cancel')}
          </Button>
        </>
      ) : (
        <>
          {blocked ? (
            <p role="alert" className="mb-4 text-sm text-red-700 dark:text-red-400">
              {t('merge.blocked', {
                titles: preview.data.blockingTransfers.map((tr) => tr.title).join(', '),
              })}
            </p>
          ) : (
            <>
              <p className="mb-2 text-sm text-zinc-600 dark:text-zinc-300">
                {t('merge.summary', {
                  count: String(preview.data.transactionCount),
                  // Interpolated into plain text (not <AmountText>), so the
                  // formatter's breakable spaces are swapped for NBSP here —
                  // same fix as amount-text.tsx — to keep the amount from
                  // wrapping mid-number.
                  amount: formatCurrency(
                    preview.data.movingBalanceMinorUnits,
                    preview.data.baseCurrency,
                  ).replace(/ /g, ' '),
                  target: preview.data.targetName,
                })}
              </p>
              <p className="mb-4 text-sm font-semibold">
                {t('merge.willDelete', { source: preview.data.sourceName })}
              </p>
            </>
          )}
          {merge.error ? (
            <p role="alert" className="mb-2 text-sm text-red-700 dark:text-red-400">
              {merge.error.message}
            </p>
          ) : null}
          <div className="flex flex-col gap-2">
            <Button
              data-testid="merge-confirm"
              disabled={blocked || merge.isPending}
              onClick={submitMerge}
            >
              {t('merge.confirm')}
            </Button>
            <Button variant="secondary" onClick={onClose}>
              {t('merge.cancel')}
            </Button>
          </div>
        </>
      )}
    </Modal>
  );
}

/** Suggests a merge when a newcomer looks like an unclaimed placeholder. */
export function DuplicateBanner({ groupId }: { groupId: string }) {
  const { t } = useI18n();
  const candidates = trpc.member.duplicateCandidates.useQuery({ groupId });
  const [dismissed, setDismissed] = useState<string[]>(dismissedPairs);
  const [open, setOpen] = useState(false);

  const candidate = candidates.data?.find(
    (c) => !dismissed.includes(`${c.sourceMemberId}:${c.targetMemberId}`),
  );
  if (!candidate) return null;
  const key = `${candidate.sourceMemberId}:${candidate.targetMemberId}`;

  return (
    <Card className="border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-950">
      <p className="mb-3 text-sm" data-testid="merge-banner">
        {t('merge.bannerQuestion', {
          newcomer: candidate.sourceName,
          placeholder: candidate.targetName,
        })}
      </p>
      <div className="flex gap-2">
        <Button data-testid="merge-banner-confirm" onClick={() => setOpen(true)}>
          {t('merge.bannerConfirm')}
        </Button>
        <Button
          variant="secondary"
          onClick={() => {
            dismissPair(key);
            setDismissed((prev) => [...prev, key]);
          }}
        >
          {t('merge.bannerDismiss')}
        </Button>
      </div>
      {open ? (
        <MergeDialog
          groupId={groupId}
          sourceMemberId={candidate.sourceMemberId}
          targetMemberId={candidate.targetMemberId}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </Card>
  );
}
