'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useI18n } from '@/lib/i18n';
import { useSession, signOut } from '@/lib/auth-client';
import { trpc } from '@/lib/trpc';
import { Button, Card, Input, Label, SectionLabel } from '@/components/ui';
import { Check } from '@/components/icons';
import { SecurityCard } from '@/components/security/security-card';

export default function SettingsPage() {
  const { t } = useI18n();
  const { data: session, isPending } = useSession();
  const me = trpc.user.me.useQuery(undefined, { enabled: !!session?.user });
  const utils = trpc.useUtils();
  const [apiKey, setApiKey] = useState('');
  const [name, setName] = useState('');
  const [account, setAccount] = useState('');
  const [accountError, setAccountError] = useState(false);
  const [nameSaved, setNameSaved] = useState(false);

  const updateProfile = trpc.user.updateProfile.useMutation({
    onSuccess: () => {
      void utils.user.me.invalidate();
      // Transient "saved" notice — auto-hides instead of sticking around.
      setNameSaved(true);
      window.setTimeout(() => setNameSaved(false), 2500);
    },
  });
  const setBankAccount = trpc.user.setBankAccount.useMutation({
    onSuccess: () => {
      setAccount('');
      setAccountError(false);
      void utils.user.me.invalidate();
    },
    onError: () => setAccountError(true),
  });
  const clearBankAccount = trpc.user.clearBankAccount.useMutation({
    onSuccess: () => void utils.user.me.invalidate(),
  });

  const setKey = trpc.user.setOpenRouterKey.useMutation({
    onSuccess: () => {
      setApiKey('');
      void utils.user.me.invalidate();
    },
  });
  const clearKey = trpc.user.clearOpenRouterKey.useMutation({
    onSuccess: () => void utils.user.me.invalidate(),
  });
  const exportData = trpc.user.exportData.useQuery(undefined, { enabled: false });
  const deleteAccount = trpc.user.deleteAccount.useMutation({
    onSuccess: async () => {
      await signOut();
      window.location.href = '/';
    },
  });

  async function handleExport() {
    const res = await exportData.refetch();
    if (!res.data) return;
    const blob = new Blob([JSON.stringify(res.data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'evenup-data.json';
    a.click();
    URL.revokeObjectURL(url);
  }

  if (isPending) return <p className="text-zinc-500 dark:text-zinc-400">…</p>;
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
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-extrabold tracking-tight">{t('nav.settings')}</h1>
        {me.data?.isVip ? (
          <span
            className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800 dark:bg-amber-500/20 dark:text-amber-300"
            data-testid="vip-badge"
          >
            {t('vip.badge')}
          </span>
        ) : null}
      </div>
      <Card>
        <SectionLabel>{t('profile.title')}</SectionLabel>

        <form
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            const trimmed = name.trim();
            if (trimmed) updateProfile.mutate({ name: trimmed });
          }}
        >
          <Label htmlFor="p-name">{t('profile.nickname')}</Label>
          <div className="flex gap-2">
            <Input
              id="p-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={me.data?.name ?? ''}
              data-testid="profile-name-input"
            />
            <Button
              type="submit"
              disabled={updateProfile.isPending}
              data-testid="profile-name-save"
            >
              {updateProfile.isPending ? t('common.loading') : t('common.save')}
            </Button>
          </div>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">{t('profile.nicknameHint')}</p>
          {nameSaved ? (
            <p
              className="flex items-center gap-1 text-sm text-green-700 dark:text-green-400"
              data-testid="profile-name-saved"
            >
              <Check size={16} aria-hidden /> {t('common.saved')}
            </p>
          ) : null}
        </form>

        <div className="mt-5 border-t border-zinc-100 pt-4 dark:border-zinc-800">
          <Label htmlFor="p-account">{t('profile.bankAccount')}</Label>
          {me.data?.bankAccountMasked ? (
            <div className="flex items-center justify-between">
              <span
                className="text-sm font-semibold tabular-nums"
                data-testid="bank-account-masked"
              >
                {me.data.bankAccountMasked}
              </span>
              <Button
                variant="danger"
                onClick={() => clearBankAccount.mutate()}
                disabled={clearBankAccount.isPending}
                data-testid="bank-account-clear"
              >
                {t('common.delete')}
              </Button>
            </div>
          ) : (
            <form
              className="space-y-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (account.trim()) setBankAccount.mutate({ account: account.trim() });
              }}
            >
              <div className="flex gap-2">
                <Input
                  id="p-account"
                  value={account}
                  onChange={(e) => setAccount(e.target.value)}
                  placeholder="19-2000145399/0800"
                  inputMode="numeric"
                  data-testid="bank-account-input"
                />
                <Button
                  type="submit"
                  disabled={setBankAccount.isPending}
                  data-testid="bank-account-save"
                >
                  {setBankAccount.isPending ? t('common.loading') : t('common.save')}
                </Button>
              </div>
              {accountError ? (
                <p
                  role="alert"
                  className="text-sm text-red-700 dark:text-red-400"
                  data-testid="bank-account-error"
                >
                  {t('profile.bankAccountInvalid')}
                </p>
              ) : null}
            </form>
          )}
          <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
            {t('profile.bankAccountHint')}
          </p>
        </div>
      </Card>
      <SecurityCard />
      <Card>
        <SectionLabel className="mb-1">{t('settings.openRouterKey')}</SectionLabel>
        <p className="mb-3 text-sm text-zinc-500 dark:text-zinc-400">{t('ocr.apiKeyRequired')}</p>
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
              <Label htmlFor="or-key">{t('settings.apiKey')}</Label>
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
      <Card>
        <SectionLabel>{t('settings.data.title')}</SectionLabel>
        <div className="flex flex-wrap gap-2">
          <Button variant="ghost" onClick={handleExport} data-testid="export-data-btn">
            {t('settings.data.export')}
          </Button>
          <Button
            variant="danger"
            data-testid="delete-account-btn"
            disabled={deleteAccount.isPending}
            onClick={() => {
              if (window.confirm(t('settings.data.deleteConfirm'))) deleteAccount.mutate();
            }}
          >
            {t('settings.data.delete')}
          </Button>
        </div>
      </Card>
      <Link href="/" className="inline-block text-brand-700 underline">
        ← {t('nav.groups')}
      </Link>
    </div>
  );
}
