'use client';
import Link from 'next/link';
import { useI18n } from '@/lib/i18n';
import { useSession } from '@/lib/auth-client';
import { trpc } from '@/lib/trpc';
import { Card } from '@/components/ui';

export default function AdminPage() {
  const { t } = useI18n();
  const { data: session, isPending } = useSession();
  const me = trpc.user.me.useQuery(undefined, { enabled: !!session?.user });

  if (isPending || (!!session?.user && me.isLoading)) {
    return <p className="text-neutral-500">…</p>;
  }

  // Non-admins (and signed-out visitors) never see the dashboard.
  if (!session?.user || !me.data?.isAdmin) {
    return (
      <Card>
        <p className="text-red-700 dark:text-red-400">{t('error.notFound')}</p>
        <Link href="/" className="mt-2 inline-block text-brand-700 underline">
          {t('common.back')}
        </Link>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold" data-testid="admin-title">
        {t('nav.admin')}
      </h1>
      {/* Sections added in stage (b): instance OpenRouter key, users, errors. */}
    </div>
  );
}
