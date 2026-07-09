'use client';
import { use, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useI18n } from '@/lib/i18n';
import { useSession } from '@/lib/auth-client';
import { trpc } from '@/lib/trpc';
import { Button, Card } from '@/components/ui';
import { MemberChip } from '@/components/member-chip';
import { SignIn } from '@/components/sign-in';

export default function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const { t } = useI18n();
  const router = useRouter();
  const { data: session, isPending } = useSession();
  const preview = trpc.invite.preview.useQuery({ token });
  const claim = trpc.invite.claim.useMutation({
    onSuccess: () => router.push('/'),
  });
  const [error, setError] = useState<string | null>(null);

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
  if (preview.isLoading)
    return <p className="text-zinc-500 dark:text-zinc-400">{t('common.loading')}</p>;
  if (preview.isError || !preview.data) {
    return (
      <Card>
        <p className="text-red-700 dark:text-red-400">{t('invite.expired')}</p>
      </Card>
    );
  }

  return (
    <Card>
      <h1 className="mb-1 text-xl font-extrabold tracking-tight">{preview.data.groupName}</h1>
      <p className="mb-4 text-sm text-zinc-600 dark:text-zinc-300">{t('invite.claim')}</p>
      {error ? (
        <p role="alert" className="mb-2 text-sm text-red-700 dark:text-red-400">
          {error}
        </p>
      ) : null}
      <ul className="space-y-2">
        {preview.data.members.map((m) => (
          <li key={m.id} className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              <MemberChip initials={m.initials} color={m.color} name={m.displayName} size="sm" />
              {m.displayName}
            </span>
            <Button
              variant="secondary"
              onClick={() =>
                claim.mutate({ token, memberId: m.id }, { onError: (e) => setError(e.message) })
              }
            >
              {t('invite.claim')}
            </Button>
          </li>
        ))}
      </ul>
      <div className="mt-4 border-t border-zinc-100 pt-4 dark:border-zinc-800">
        <Button
          data-testid="invite-join-new"
          onClick={() => claim.mutate({ token }, { onError: (e) => setError(e.message) })}
        >
          {t('invite.joinAsNew')}
        </Button>
      </div>
    </Card>
  );
}
