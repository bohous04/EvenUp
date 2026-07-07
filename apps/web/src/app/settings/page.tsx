'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useI18n } from '@/lib/i18n';
import { useSession } from '@/lib/auth-client';
import { trpc } from '@/lib/trpc';
import { Button, Card, Input, Label } from '@/components/ui';
import { Check } from '@/components/icons';

export default function SettingsPage() {
  const { t } = useI18n();
  const { data: session, isPending } = useSession();
  const me = trpc.user.me.useQuery(undefined, { enabled: !!session?.user });
  const utils = trpc.useUtils();
  const [apiKey, setApiKey] = useState('');

  const setKey = trpc.user.setOpenRouterKey.useMutation({
    onSuccess: () => {
      setApiKey('');
      void utils.user.me.invalidate();
    },
  });
  const clearKey = trpc.user.clearOpenRouterKey.useMutation({
    onSuccess: () => void utils.user.me.invalidate(),
  });

  if (isPending) return <p className="text-neutral-500">…</p>;
  if (!session?.user) {
    return (
      <Card>
        <Link href="/" className="text-brand-700 underline">
          {t('common.back')}
        </Link>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{t('nav.settings')}</h1>
      <Card>
        <h3 className="mb-1 font-semibold">OpenRouter API key</h3>
        <p className="mb-3 text-sm text-neutral-500">{t('ocr.apiKeyRequired')}</p>
        {me.data?.hasOpenRouterKey ? (
          <div className="flex items-center justify-between">
            <span
              className="flex items-center gap-1 text-sm text-green-700 dark:text-green-400"
              data-testid="key-status"
            >
              <Check size={16} aria-hidden /> {t('common.confirm')}
            </span>
            <Button
              variant="danger"
              onClick={() => clearKey.mutate()}
              disabled={clearKey.isPending}
              data-testid="clear-key-btn"
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
              <Label htmlFor="or-key">API key</Label>
              <Input
                id="or-key"
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="sk-or-v1-…"
                data-testid="api-key-input"
              />
            </div>
            <Button type="submit" disabled={setKey.isPending} data-testid="save-key-btn">
              {t('common.save')}
            </Button>
          </form>
        )}
      </Card>
      <Link href="/" className="inline-block text-brand-700 underline">
        ← {t('nav.groups')}
      </Link>
    </div>
  );
}
