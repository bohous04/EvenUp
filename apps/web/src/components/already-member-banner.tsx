'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useI18n } from '@/lib/i18n';
import { useSession } from '@/lib/auth-client';
import { trpc } from '@/lib/trpc';
import { Card, iconButtonClass } from '@/components/ui';
import { X } from '@/components/icons';

/**
 * Shown after an invite link redirected someone who is already in the group.
 * `dismissed` is only component-local state, not persisted anywhere, so the
 * banner reappears on any fresh visit to the `?already=1` URL -- including
 * browser Back after a dismiss. Purely informational — no confirm button,
 * because the point of the redirect was to remove a click, not relocate it.
 */
export function AlreadyMemberBanner({ groupId, show }: { groupId: string; show: boolean }) {
  const { t } = useI18n();
  const router = useRouter();
  const { data: session } = useSession();
  const group = trpc.group.get.useQuery({ groupId }, { enabled: show });
  const [dismissed, setDismissed] = useState(false);

  if (!show || dismissed) return null;
  const me = group.data?.members.find((m) => m.isActive && m.userId === session?.user?.id);
  // The membership changed between the redirect and this render — say nothing
  // rather than render a sentence with a hole where the name should be.
  if (!me) return null;

  return (
    <Card className="flex items-start gap-3 border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-950">
      <p className="min-w-0 flex-1 text-sm" data-testid="already-member-banner">
        {t('invite.alreadyMember', { name: me.displayName })}
      </p>
      <button
        type="button"
        aria-label={t('common.cancel')}
        data-testid="already-member-dismiss"
        className={iconButtonClass}
        onClick={() => {
          // Hide immediately, then drop the query param so a reload stays quiet.
          setDismissed(true);
          router.replace(`/groups/${groupId}`, { scroll: false });
        }}
      >
        <X size={16} aria-hidden />
      </button>
    </Card>
  );
}
