'use client';
import Link from 'next/link';
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
      <p className="mb-3 text-sm text-zinc-500">{t('admin.instanceKey.desc')}</p>
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
            <Label htmlFor="instance-key">API key</Label>
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
  'inline-flex h-8 w-8 items-center justify-center rounded-lg text-red-600 transition-colors hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 disabled:cursor-not-allowed disabled:opacity-40 dark:text-red-400 dark:hover:bg-red-500/10';

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
          <thead className="text-xs text-zinc-500">
            <tr>
              <th className="py-2 pr-3 font-medium">E-mail</th>
              <th className="px-3 py-2 font-medium">{t('admin.col.vip')}</th>
              <th className="px-3 py-2 font-medium">{t('admin.col.admin')}</th>
              <th className="px-3 py-2 font-medium">{t('admin.col.disabled')}</th>
              <th className="px-3 py-2 font-medium">{t('admin.col.key')}</th>
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
                      <span className="ml-1 text-xs text-zinc-500">{t('admin.you')}</span>
                    ) : null}
                    {u.name ? (
                      <span className="block text-xs text-zinc-500">{u.name}</span>
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
                  <td className="px-3 py-2 text-zinc-500">
                    {u.hasOwnKey ? <Check size={16} aria-hidden /> : '–'}
                  </td>
                  <td className="px-3 py-2 text-zinc-500">{formatDate(u.createdAt)}</td>
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
                  {e.code ? <span className="ml-1 text-zinc-500">· {e.code}</span> : null}
                </span>
                <span className="shrink-0 text-xs text-zinc-500">{formatDate(e.createdAt)}</span>
              </div>
              <p className="text-zinc-600 dark:text-zinc-300">{e.message}</p>
              {e.userEmail ? <p className="text-xs text-zinc-500">{e.userEmail}</p> : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-center text-sm text-zinc-500">{t('admin.errors.empty')}</p>
      )}
    </Card>
  );
}

export default function AdminPage() {
  const { t } = useI18n();
  const { data: session, isPending } = useSession();
  const me = trpc.user.me.useQuery(undefined, { enabled: !!session?.user });

  if (isPending || (!!session?.user && me.isLoading)) {
    return <p className="text-zinc-500">…</p>;
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
      <InstanceKeySection />
      <UsersSection meId={me.data.id} />
      <ErrorsSection />
    </div>
  );
}
