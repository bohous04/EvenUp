'use client';
import { useState } from 'react';
import { authClient } from '@/lib/auth-client';
import { useI18n } from '@/lib/i18n';
import { authErrorMessage } from '@/lib/auth-errors';
import { Button, Label, PasswordInput, SectionLabel } from '@/components/ui';

/**
 * Change-password form for users who already have a password, or a
 * "send a set-password link" action for OAuth-only users who don't.
 */
export function PasswordSection({
  hasPassword,
  email,
}: {
  hasPassword: boolean;
  email: string;
}) {
  const { t } = useI18n();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!hasPassword) {
    return (
      <div>
        <SectionLabel>{t('security.password.title')}</SectionLabel>
        <p className="mb-3 text-sm text-zinc-500 dark:text-zinc-400">
          {t('security.password.setVia')}
        </p>
        <Button
          variant="secondary"
          disabled={busy}
          data-testid="set-password-btn"
          onClick={async () => {
            setBusy(true);
            setErr(null);
            const res = await authClient.requestPasswordReset({ email, redirectTo: '/reset-password' });
            setBusy(false);
            if (res.error) setErr(authErrorMessage(res.error.code, t));
            else setMsg(t('security.password.setLinkSent'));
          }}
        >
          {t('security.password.sendSetLink')}
        </Button>
        {msg ? <p className="mt-2 text-sm text-green-700 dark:text-green-400">{msg}</p> : null}
        {err ? (
          <p role="alert" className="mt-2 text-sm text-red-700 dark:text-red-400">
            {err}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <form
      className="space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setErr(null);
        setMsg(null);
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
          setCurrent('');
          setNext('');
        }
      }}
    >
      <SectionLabel>{t('security.password.title')}</SectionLabel>
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
      <Button type="submit" disabled={busy} data-testid="change-password-btn">
        {t('security.password.change')}
      </Button>
      {msg ? <p className="text-sm text-green-700 dark:text-green-400">{msg}</p> : null}
      {err ? (
        <p role="alert" className="text-sm text-red-700 dark:text-red-400">
          {err}
        </p>
      ) : null}
    </form>
  );
}
