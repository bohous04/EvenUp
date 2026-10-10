'use client';
import { useState } from 'react';
import { authClient } from '@/lib/auth-client';
import { useI18n } from '@/lib/i18n';
import { authErrorMessage } from '@/lib/auth-errors';
import { Button, Label, PasswordInput } from '@/components/ui';
import { Sheet } from '@/components/sheet';
import { SetNavRow } from '@/components/settings-rows';
import { KeyRound } from '@/components/icons';

/**
 * The password row in Settings → Security. Tapping it opens a sheet with the
 * change-password form (users who have a password) or the "send a
 * set-password link" action (OAuth-only users who don't).
 */
export function PasswordSection({ hasPassword, email }: { hasPassword: boolean; email: string }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function close() {
    setOpen(false);
    setCurrent('');
    setNext('');
    setErr(null);
  }

  const row = (
    <SetNavRow
      label={t('security.password.title')}
      icon={<KeyRound size={18} strokeWidth={1.75} />}
      meta={msg ?? undefined}
      value={hasPassword ? undefined : t('security.password.notSet')}
      onClick={() => {
        setMsg(null);
        setOpen(true);
      }}
      data-testid="password-row"
    />
  );

  if (!hasPassword) {
    return (
      <>
        {row}
        <Sheet open={open} onClose={close} title={t('security.password.title')}>
          <p className="text-[0.9375rem] leading-relaxed text-zinc-600 dark:text-zinc-300">
            {t('security.password.setVia')}
          </p>
          <Button
            className="mt-5 w-full"
            disabled={busy}
            data-testid="set-password-btn"
            onClick={async () => {
              setBusy(true);
              setErr(null);
              const res = await authClient.requestPasswordReset({
                email,
                redirectTo: '/reset-password',
              });
              setBusy(false);
              if (res.error) setErr(authErrorMessage(res.error.code, t));
              else {
                setMsg(t('security.password.setLinkSent'));
                setOpen(false);
              }
            }}
          >
            {t('security.password.sendSetLink')}
          </Button>
          {err ? (
            <p role="alert" className="mt-3 text-sm text-red-700 dark:text-red-400">
              {err}
            </p>
          ) : null}
        </Sheet>
      </>
    );
  }

  return (
    <>
      {row}
      <Sheet
        open={open}
        onClose={close}
        title={t('security.password.change')}
        footer={
          <Button
            type="submit"
            form="change-password-form"
            className="w-full"
            disabled={busy || !current || next.length < 8}
            data-testid="change-password-btn"
          >
            {busy ? t('common.loading') : t('security.password.change')}
          </Button>
        }
      >
        <form
          id="change-password-form"
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setErr(null);
            const res = await authClient.changePassword({
              currentPassword: current,
              newPassword: next,
              revokeOtherSessions: true,
            });
            setBusy(false);
            if (res.error) {
              setErr(authErrorMessage(res.error.code, t));
            } else {
              setMsg(t('security.password.changed'));
              close();
            }
          }}
        >
          <div>
            <Label htmlFor="cur-pw">{t('security.password.current')}</Label>
            <PasswordInput
              id="cur-pw"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              autoComplete="current-password"
              required
              data-testid="current-password"
              showLabel={t('auth.showPassword')}
              hideLabel={t('auth.hidePassword')}
            />
          </div>
          <div>
            <Label htmlFor="new-pw">{t('security.password.new')}</Label>
            <PasswordInput
              id="new-pw"
              value={next}
              onChange={(e) => setNext(e.target.value)}
              autoComplete="new-password"
              required
              minLength={8}
              data-testid="new-password"
              showLabel={t('auth.showPassword')}
              hideLabel={t('auth.hidePassword')}
            />
          </div>
          {err ? (
            <p role="alert" className="text-sm text-red-700 dark:text-red-400">
              {err}
            </p>
          ) : null}
        </form>
      </Sheet>
    </>
  );
}
