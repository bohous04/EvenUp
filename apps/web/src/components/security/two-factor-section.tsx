'use client';
import { useState } from 'react';
import QRCode from 'qrcode';
import { authClient } from '@/lib/auth-client';
import { useI18n } from '@/lib/i18n';
import { authErrorMessage } from '@/lib/auth-errors';
import { Button, Label, PasswordInput, Input, SectionLabel } from '@/components/ui';

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
      <div>
        <SectionLabel>{t('security.2fa.title')}</SectionLabel>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">{t('security.2fa.needPassword')}</p>
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

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <SectionLabel className="mb-0">{t('security.2fa.title')}</SectionLabel>
        <span
          className={`text-sm font-semibold ${enabled ? 'text-green-700 dark:text-green-400' : 'text-zinc-500'}`}
          data-testid="2fa-status"
        >
          {enabled ? t('security.2fa.on') : t('security.2fa.off')}
        </span>
      </div>

      {stage === 'idle' && !enabled ? (
        <Button
          variant="secondary"
          data-testid="enable-2fa-btn"
          onClick={() => setStage('password')}
        >
          {t('security.2fa.enable')}
        </Button>
      ) : null}
      {stage === 'idle' && enabled ? (
        <Button variant="danger" data-testid="disable-2fa-btn" onClick={() => setStage('password')}>
          {t('security.2fa.disable')}
        </Button>
      ) : null}

      {stage === 'password' ? (
        <div className="space-y-2">
          <Label htmlFor="tfa-pw">{t('security.password.current')}</Label>
          <PasswordInput
            id="tfa-pw"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            data-testid="2fa-password"
            showLabel={t('auth.showPassword')}
            hideLabel={t('auth.hidePassword')}
          />
          <div className="flex gap-2">
            <Button
              disabled={busy || !password}
              data-testid="2fa-password-continue"
              onClick={enabled ? disable : startEnable}
            >
              {t('security.2fa.confirm')}
            </Button>
            <Button variant="ghost" onClick={reset}>
              {t('common.cancel')}
            </Button>
          </div>
        </div>
      ) : null}

      {stage === 'verify' ? (
        <div className="space-y-2">
          <p className="text-sm text-zinc-500 dark:text-zinc-400">{t('security.2fa.scan')}</p>
          {qr ? (
            <img
              src={qr}
              alt={t('security.2fa.title')}
              width={200}
              height={200}
              className="rounded-lg bg-white p-2"
            />
          ) : null}
          <p className="text-xs text-zinc-500 dark:text-zinc-400">{t('security.2fa.secret')}</p>
          <code className="block break-all text-xs" data-testid="2fa-secret">
            {secret}
          </code>
          <Label htmlFor="tfa-code">{t('security.2fa.code')}</Label>
          <Input
            id="tfa-code"
            inputMode="numeric"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            data-testid="2fa-code"
          />
          <Button
            disabled={busy || code.length < 6}
            data-testid="2fa-confirm-btn"
            onClick={confirmCode}
          >
            {t('security.2fa.confirm')}
          </Button>
        </div>
      ) : null}

      {stage === 'backup' ? (
        <div className="space-y-2" data-testid="2fa-backup">
          <SectionLabel>{t('security.2fa.backupTitle')}</SectionLabel>
          <p className="text-sm text-amber-700 dark:text-amber-400">
            {t('security.2fa.backupHint')}
          </p>
          <ul className="grid grid-cols-2 gap-1 font-mono text-sm">
            {backupCodes.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
          <div className="flex gap-2">
            <Button
              variant="secondary"
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
              data-testid="2fa-done-btn"
              onClick={() => {
                reset();
                onChanged();
              }}
            >
              {t('security.2fa.done')}
            </Button>
          </div>
        </div>
      ) : null}

      {err ? (
        <p role="alert" className="text-sm text-red-700 dark:text-red-400">
          {err}
        </p>
      ) : null}
    </div>
  );
}
