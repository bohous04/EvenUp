'use client';
import { useState } from 'react';
import QRCode from 'qrcode';
import { authClient } from '@/lib/auth-client';
import { useI18n } from '@/lib/i18n';
import { authErrorMessage } from '@/lib/auth-errors';
import { Button, Label, PasswordInput, Input } from '@/components/ui';
import { Sheet } from '@/components/sheet';
import { SetNavRow } from '@/components/settings-rows';
import { ShieldCheck } from '@/components/icons';

type Stage = 'idle' | 'password' | 'verify' | 'backup';

/**
 * Enable/disable TOTP two-factor authentication. Enabling walks the user
 * through password confirmation -> QR/secret display -> 6-digit code
 * verification -> a one-time backup-codes reveal. Disabling just re-confirms
 * the password. Gated behind `hasPassword` (2FA needs a password to protect
 * the enable/disable actions).
 */
export function TwoFactorSection({
  enabled,
  hasPassword,
  onChanged,
}: {
  enabled: boolean;
  hasPassword: boolean;
  onChanged: () => void;
}) {
  const { t } = useI18n();
  const [stage, setStage] = useState<Stage>('idle');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [qr, setQr] = useState('');
  const [secret, setSecret] = useState('');
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!hasPassword) {
    return (
      <div className="app-set-row app-set-nav">
        <span className="app-set-icon" aria-hidden>
          <ShieldCheck size={18} strokeWidth={1.75} />
        </span>
        <span className="app-set-text">
          <span className="app-set-label">{t('security.2fa.title')}</span>
          <span className="app-set-meta">{t('security.2fa.needPassword')}</span>
        </span>
        <span className="app-set-value" data-testid="2fa-status">
          {t('security.2fa.off')}
        </span>
      </div>
    );
  }

  function reset() {
    setStage('idle');
    setPassword('');
    setCode('');
    setQr('');
    setSecret('');
    setBackupCodes([]);
    setErr(null);
  }

  async function startEnable() {
    setBusy(true);
    setErr(null);
    const res = await authClient.twoFactor.enable({ password });
    setBusy(false);
    if (res.error || !res.data) {
      setErr(authErrorMessage(res.error?.code, t));
      return;
    }
    setBackupCodes(res.data.backupCodes ?? []);
    const uri = res.data.totpURI;
    const url = new URL(uri);
    setSecret(url.searchParams.get('secret') ?? '');
    setQr(await QRCode.toDataURL(uri, { margin: 1, width: 200 }));
    setStage('verify');
  }

  async function confirmCode() {
    setBusy(true);
    setErr(null);
    const res = await authClient.twoFactor.verifyTotp({ code });
    setBusy(false);
    if (res.error) {
      setErr(authErrorMessage(res.error.code, t));
      return;
    }
    setStage('backup'); // Show backup codes once, then "Done".
  }

  async function disable() {
    setBusy(true);
    setErr(null);
    const res = await authClient.twoFactor.disable({ password });
    setBusy(false);
    if (res.error) {
      setErr(authErrorMessage(res.error.code, t));
      return;
    }
    reset();
    onChanged();
  }

  // Closing the sheet on the backup-codes step is the same as "Done": 2FA is
  // already on by then, so the row must refresh.
  function close() {
    const finished = stage === 'backup';
    reset();
    if (finished) onChanged();
  }

  return (
    <>
      <SetNavRow
        label={t('security.2fa.title')}
        icon={<ShieldCheck size={18} strokeWidth={1.75} />}
        value={
          <span className={enabled ? 'app-set-on' : undefined} data-testid="2fa-status">
            {enabled ? t('security.2fa.on') : t('security.2fa.off')}
          </span>
        }
        onClick={() => setStage('password')}
        data-testid={enabled ? 'disable-2fa-btn' : 'enable-2fa-btn'}
      />
      <Sheet
        open={stage !== 'idle'}
        onClose={close}
        title={
          stage === 'backup'
            ? t('security.2fa.backupTitle')
            : enabled
              ? t('security.2fa.disable')
              : t('security.2fa.enable')
        }
        footer={
          stage === 'password' ? (
            <Button
              className="w-full"
              variant={enabled ? 'danger' : 'primary'}
              disabled={busy || !password}
              data-testid="2fa-password-continue"
              onClick={enabled ? disable : startEnable}
            >
              {busy ? t('common.loading') : t('security.2fa.confirm')}
            </Button>
          ) : stage === 'verify' ? (
            <Button
              className="w-full"
              disabled={busy || code.length < 6}
              data-testid="2fa-confirm-btn"
              onClick={confirmCode}
            >
              {busy ? t('common.loading') : t('security.2fa.confirm')}
            </Button>
          ) : stage === 'backup' ? (
            <div className="flex gap-2">
              <Button
                variant="secondary"
                className="flex-1"
                onClick={() => {
                  const blob = new Blob([backupCodes.join('\n')], { type: 'text/plain' });
                  const a = document.createElement('a');
                  a.href = URL.createObjectURL(blob);
                  a.download = 'evenup-backup-codes.txt';
                  a.click();
                }}
              >
                {t('security.2fa.download')}
              </Button>
              <Button
                className="flex-1"
                data-testid="2fa-done-btn"
                onClick={() => {
                  reset();
                  onChanged();
                }}
              >
                {t('security.2fa.done')}
              </Button>
            </div>
          ) : null
        }
      >
        {stage === 'password' ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!busy && password) void (enabled ? disable() : startEnable());
            }}
          >
            <Label htmlFor="tfa-pw">{t('security.password.current')}</Label>
            <PasswordInput
              id="tfa-pw"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              enterKeyHint="go"
              data-testid="2fa-password"
              showLabel={t('auth.showPassword')}
              hideLabel={t('auth.hidePassword')}
            />
          </form>
        ) : null}

        {stage === 'verify' ? (
          <div className="space-y-4">
            <p className="text-[0.9375rem] leading-relaxed text-zinc-600 dark:text-zinc-300">
              {t('security.2fa.scan')}
            </p>
            {qr ? (
              <img
                src={qr}
                alt={t('security.2fa.title')}
                width={176}
                height={176}
                className="mx-auto rounded-xl border border-[var(--app-line)] bg-white p-2"
              />
            ) : null}
            <div>
              <p className="text-[0.8125rem] text-zinc-500 dark:text-zinc-400">
                {t('security.2fa.secret')}
              </p>
              <code
                className="mt-1 block select-all break-all rounded-lg bg-[var(--app-sunken)] px-3 py-2 font-mono text-[0.8125rem] tracking-wide"
                data-testid="2fa-secret"
              >
                {secret}
              </code>
            </div>
            <div>
              <Label htmlFor="tfa-code">{t('security.2fa.code')}</Label>
              <Input
                id="tfa-code"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value)}
                className="tabular-nums tracking-[0.2em]"
                data-testid="2fa-code"
              />
            </div>
          </div>
        ) : null}

        {stage === 'backup' ? (
          <div className="space-y-3" data-testid="2fa-backup">
            <p className="text-[0.9375rem] font-medium">{t('security.2fa.backupHint')}</p>
            <ul className="grid grid-cols-2 gap-x-4 gap-y-1.5 rounded-xl bg-[var(--app-sunken)] p-4 font-mono text-sm tabular-nums">
              {backupCodes.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
          </div>
        ) : null}

        {err ? (
          <p role="alert" className="mt-3 text-sm text-red-700 dark:text-red-400">
            {err}
          </p>
        ) : null}
      </Sheet>
    </>
  );
}
