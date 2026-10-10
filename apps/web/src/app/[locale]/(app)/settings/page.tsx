'use client';
import { useEffect, useRef, useState } from 'react';
import { useI18n } from '@/lib/i18n';
import { useLocaleSwitch } from '@/components/locale-toggle';
import { useSession, signOut } from '@/lib/auth-client';
import { trpc } from '@/lib/trpc';
import { Card, Input, Label, Panel, Section } from '@/components/ui';
import {
  BellRing,
  Camera,
  Check,
  Download,
  Landmark,
  Languages,
  LogOut,
  ScanText,
  Trash2,
} from '@/components/icons';
import { SecurityCard } from '@/components/security/security-card';
import { SetField, SetNavRow, SetSwitch } from '@/components/settings-rows';
import { AppLink, useAppPath } from '@/components/app-link';

/**
 * Center-crop a picked image to a square and re-encode it small, so the avatar
 * is a compact data URL that rides comfortably inside the member queries.
 */
function fileToAvatarDataUrl(file: File, size = 256, quality = 0.8): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Canvas not available'));
        return;
      }
      const side = Math.min(img.naturalWidth, img.naturalHeight);
      const sx = (img.naturalWidth - side) / 2;
      const sy = (img.naturalHeight - side) / 2;
      ctx.drawImage(img, sx, sy, side, side, 0, 0, size, size);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Could not load image'));
    };
    img.src = url;
  });
}

/** "Jirka" → "J", "Jan Novák" → "JN": the same letters the member avatars use. */
function monogram(name: string) {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '';
  const last = words.length > 1 ? words[words.length - 1]!.slice(0, 1) : '';
  return (words[0]!.slice(0, 1) + last).toLocaleUpperCase();
}

// Keep the encoded avatar under the server's data-URL cap (300k) with margin.
const MAX_AVATAR_CHARS = 290_000;

export default function SettingsPage() {
  const { t, formatDate } = useI18n();
  const appPath = useAppPath();
  const { data: session, isPending } = useSession();
  const me = trpc.user.me.useQuery(undefined, { enabled: !!session?.user });
  // The full account is fetched only here (settings), not in the app-wide `me`.
  const bankAccount = trpc.user.getBankAccount.useQuery(undefined, {
    enabled: !!session?.user && !!me.data?.hasBankAccount,
  });
  const utils = trpc.useUtils();
  const [name, setName] = useState('');
  const [account, setAccount] = useState('');
  const [accountError, setAccountError] = useState(false);
  const [nameSaved, setNameSaved] = useState(false);
  const [notificationsSaved, setNotificationsSaved] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const [avatarError, setAvatarError] = useState(false);
  const lang = useLocaleSwitch();
  // The nickname field shows the current name (editable in place) rather than
  // an empty box with the name as a grey placeholder; it follows the server
  // value until the user starts typing.
  const [nameDirty, setNameDirty] = useState(false);
  const currentName = me.data?.name ?? '';
  useEffect(() => {
    if (!nameDirty) setName(currentName);
  }, [currentName, nameDirty]);
  const nameChanged = name.trim() !== '' && name.trim() !== currentName;

  const notificationSettings = trpc.notification.getSettings.useQuery(undefined, {
    enabled: !!session?.user,
  });
  const setNotificationsEnabled = trpc.notification.setEnabled.useMutation({
    onSuccess: () => {
      void utils.notification.getSettings.invalidate();
      setNotificationsSaved(true);
      window.setTimeout(() => setNotificationsSaved(false), 2500);
    },
  });

  const updateProfile = trpc.user.updateProfile.useMutation({
    onSuccess: () => {
      void utils.user.me.invalidate();
      // Transient "saved" notice — auto-hides instead of sticking around.
      setNameSaved(true);
      window.setTimeout(() => setNameSaved(false), 2500);
    },
  });
  const setAvatar = trpc.user.setAvatar.useMutation({
    onSuccess: () => void utils.user.me.invalidate(),
    onError: () => setAvatarError(true),
  });
  const clearAvatar = trpc.user.clearAvatar.useMutation({
    onSuccess: () => void utils.user.me.invalidate(),
  });
  const updateSettings = trpc.user.updateSettings.useMutation({
    onSuccess: () => void utils.user.me.invalidate(),
  });

  async function handleAvatarFile(file: File) {
    setAvatarError(false);
    try {
      const image = await fileToAvatarDataUrl(file);
      if (image.length > MAX_AVATAR_CHARS) {
        setAvatarError(true);
        return;
      }
      setAvatar.mutate({ image });
    } catch {
      setAvatarError(true);
    }
  }

  const setBankAccount = trpc.user.setBankAccount.useMutation({
    onSuccess: () => {
      setAccount('');
      setAccountError(false);
      void utils.user.me.invalidate();
      void utils.user.getBankAccount.invalidate();
    },
    onError: () => setAccountError(true),
  });
  const clearBankAccount = trpc.user.clearBankAccount.useMutation({
    onSuccess: () => {
      void utils.user.me.invalidate();
      void utils.user.getBankAccount.invalidate();
    },
  });
  // Revocation lives here (Settings), separately from the scan flow's grant —
  // consent must be genuinely revocable, not just a one-way opt-in dialog.
  const setOcrConsent = trpc.user.setOcrConsent.useMutation({
    onSuccess: () => void utils.user.me.invalidate(),
  });

  const exportData = trpc.user.exportData.useQuery(undefined, { enabled: false });
  const deleteAccount = trpc.user.deleteAccount.useMutation({
    onSuccess: async () => {
      await signOut();
      // The public landing page, in the locale the user was using.
      window.location.href = appPath('/');
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
        <AppLink href="/groups" className="text-brand-700 underline">
          {t('common.back')}
        </AppLink>
      </Card>
    );
  }

  const displayName = me.data?.name ?? session.user.name ?? '';

  return (
    <div className="app-set">
      <h1 className="text-[1.75rem] font-[600] leading-tight tracking-[-0.035em] lg:text-[2.25rem]">
        {t('nav.settings')}
      </h1>

      <div className="app-stack app-set-stack">
        {/* Who you are: the screen's one raised card. The face, the name and
            the address on top, then the two things that shape how others see
            you in every group — the nickname and photo-or-colour. */}
        <section className="app-section app-section-lead app-set-me" aria-labelledby="set-me-title">
          <h2 id="set-me-title" className="sr-only">
            {t('profile.title')}
          </h2>
          <div className="app-set-id">
            <div className="app-set-ava">
              {me.data?.image ? (
                <img src={me.data.image} alt="" data-testid="avatar-preview" />
              ) : (
                <span data-testid="avatar-monogram">{monogram(displayName)}</span>
              )}
            </div>
            <div className="app-set-who">
              <p className="app-set-name">
                <span className="truncate">{displayName}</span>
                {me.data?.isVip ? (
                  <span className="app-set-tag" data-testid="vip-badge">
                    {t('vip.badge')}
                  </span>
                ) : null}
              </p>
              <p className="app-set-email">{session.user.email}</p>
              <div className="app-set-photo">
                <input
                  ref={avatarInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  data-testid="avatar-input"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void handleAvatarFile(f);
                    e.target.value = '';
                  }}
                />
                <button
                  type="button"
                  id="avatar-upload"
                  className="app-set-link app-set-link-framed"
                  onClick={() => avatarInputRef.current?.click()}
                  disabled={setAvatar.isPending}
                  data-testid="avatar-upload"
                >
                  <Camera size={16} strokeWidth={1.75} aria-hidden />
                  {setAvatar.isPending
                    ? t('common.loading')
                    : me.data?.image
                      ? t('profile.changePhoto')
                      : t('profile.uploadPhoto')}
                </button>
                {me.data?.image ? (
                  <button
                    type="button"
                    className="app-set-link app-set-link-quiet"
                    onClick={() => clearAvatar.mutate()}
                    disabled={clearAvatar.isPending}
                    data-testid="avatar-remove"
                  >
                    {t('profile.removePhoto')}
                  </button>
                ) : null}
              </div>
            </div>
          </div>
          {avatarError ? (
            <p role="alert" className="app-set-alert app-set-pad" data-testid="avatar-error">
              {t('profile.photoTooLarge')}
            </p>
          ) : null}
          <Panel flush>
            <SetField>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const trimmed = name.trim();
                  if (trimmed) updateProfile.mutate({ name: trimmed });
                }}
              >
                <Label htmlFor="p-name">{t('profile.nickname')}</Label>
                {/* Save rides inside the field's right end, and only once
                    there is something to save: never a dead grey button. */}
                <div className="app-set-inline" data-dirty={nameChanged || undefined}>
                  <Input
                    id="p-name"
                    value={name}
                    onChange={(e) => {
                      setNameDirty(true);
                      setName(e.target.value);
                    }}
                    autoComplete="nickname"
                    enterKeyHint="done"
                    aria-describedby="p-name-hint"
                    data-testid="profile-name-input"
                  />
                  <button
                    type="submit"
                    className="app-set-save"
                    disabled={updateProfile.isPending || !nameChanged}
                    data-testid="profile-name-save"
                  >
                    {updateProfile.isPending ? t('common.loading') : t('common.save')}
                  </button>
                </div>
                {nameSaved ? (
                  <p
                    id="p-name-hint"
                    className="app-set-hint app-set-ok"
                    data-testid="profile-name-saved"
                  >
                    <Check size={15} strokeWidth={2.25} aria-hidden /> {t('common.saved')}
                  </p>
                ) : (
                  <p id="p-name-hint" className="app-set-hint">
                    {t('profile.nicknameHint')}
                  </p>
                )}
              </form>
            </SetField>
            <SetSwitch
              label={t('profile.hidePhoto')}
              hint={t('profile.hidePhotoHint')}
              checked={me.data?.hideProfilePhoto ?? false}
              disabled={me.isLoading || updateSettings.isPending}
              onChange={(v) => updateSettings.mutate({ hideProfilePhoto: v })}
              testId="hide-photo-toggle"
            />
          </Panel>
        </section>

        <Section title={t('settings.payments.title')}>
          <Panel flush>
            {me.data?.hasBankAccount ? (
              <div className="app-set-row app-set-nav">
                <span className="app-set-icon app-set-icon-top" aria-hidden>
                  <Landmark size={18} strokeWidth={1.75} />
                </span>
                <span className="app-set-text">
                  <span className="app-set-meta app-set-meta-top">{t('profile.bankAccount')}</span>
                  <span className="app-set-figure" data-testid="bank-account-value">
                    {bankAccount.data?.account ?? '…'}
                  </span>
                  <span className="app-set-meta">{t('profile.bankAccountHint')}</span>
                </span>
                <button
                  type="button"
                  className="app-set-link app-set-link-quiet"
                  onClick={() => clearBankAccount.mutate()}
                  disabled={clearBankAccount.isPending}
                  data-testid="bank-account-clear"
                >
                  {t('profile.bankAccountRemove')}
                </button>
              </div>
            ) : (
              <SetField>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (account.trim()) setBankAccount.mutate({ account: account.trim() });
                  }}
                >
                  <Label htmlFor="p-account">{t('profile.bankAccount')}</Label>
                  <div className="app-set-inline" data-dirty={account.trim() ? true : undefined}>
                    {/* No numeric inputMode: the iOS number pad has no "-" or "/",
                        and both are part of a Czech account number. */}
                    <Input
                      id="p-account"
                      value={account}
                      onChange={(e) => setAccount(e.target.value)}
                      placeholder="19-2000145399/0800"
                      autoComplete="off"
                      autoCorrect="off"
                      spellCheck={false}
                      enterKeyHint="done"
                      className="tabular-nums"
                      aria-invalid={accountError || undefined}
                      aria-describedby="p-account-hint"
                      data-testid="bank-account-input"
                    />
                    <button
                      type="submit"
                      className="app-set-save"
                      disabled={setBankAccount.isPending || !account.trim()}
                      data-testid="bank-account-save"
                    >
                      {setBankAccount.isPending ? t('common.loading') : t('common.save')}
                    </button>
                  </div>
                  {accountError ? (
                    <p
                      id="p-account-hint"
                      role="alert"
                      className="app-set-hint app-set-err"
                      data-testid="bank-account-error"
                    >
                      {t('profile.bankAccountInvalid')}
                    </p>
                  ) : (
                    <p id="p-account-hint" className="app-set-hint">
                      {t('profile.bankAccountHint')}
                    </p>
                  )}
                </form>
              </SetField>
            )}
          </Panel>
        </Section>

        <SecurityCard />

        <Section title={t('settings.notifications.title')}>
          <Panel flush>
            <SetSwitch
              label={t('settings.notifications.enabled')}
              icon={<BellRing size={18} strokeWidth={1.75} />}
              hint={t('settings.notifications.hint')}
              status={
                notificationsSaved ? (
                  <span className="app-set-ok">
                    <Check size={15} strokeWidth={2.25} aria-hidden />{' '}
                    {t('settings.notifications.saved')}
                  </span>
                ) : undefined
              }
              checked={notificationSettings.data?.notificationsEnabled ?? true}
              disabled={notificationSettings.isPending || setNotificationsEnabled.isPending}
              onChange={(v) => setNotificationsEnabled.mutate({ enabled: v })}
              testId="notifications-enabled"
            />
          </Panel>
        </Section>

        <Section title={t('settings.data.title')}>
          <Panel flush>
            <div className="app-set-row app-set-nav">
              <span className="app-set-icon" aria-hidden>
                <ScanText size={18} strokeWidth={1.75} />
              </span>
              <span className="app-set-text">
                <span className="app-set-label">{t('settings.ocrConsent.title')}</span>
                <span className="app-set-meta" data-testid="ocr-consent-status">
                  {me.data?.ocrConsentAt
                    ? t('settings.ocrConsent.granted', { date: formatDate(me.data.ocrConsentAt) })
                    : t('settings.ocrConsent.notGranted')}
                </span>
              </span>
              {me.data?.ocrConsentAt ? (
                <button
                  type="button"
                  className="app-set-link app-set-link-quiet"
                  onClick={() => setOcrConsent.mutate({ granted: false })}
                  disabled={setOcrConsent.isPending}
                  data-testid="ocr-consent-revoke"
                >
                  {t('settings.ocrConsent.revoke')}
                </button>
              ) : null}
            </div>
            <SetNavRow
              label={t('settings.data.export')}
              icon={<Download size={18} strokeWidth={1.75} />}
              chevron={false}
              onClick={handleExport}
              disabled={exportData.isFetching}
              data-testid="export-data-btn"
            />
            <SetNavRow
              label={t('settings.data.delete')}
              icon={<Trash2 size={18} strokeWidth={1.75} />}
              tone="danger"
              chevron={false}
              disabled={deleteAccount.isPending}
              onClick={() => {
                if (window.confirm(t('settings.data.deleteConfirm'))) deleteAccount.mutate();
              }}
              data-testid="delete-account-btn"
            />
          </Panel>
        </Section>

        {/* Phones: language and sign-out, which the lg rail carries. */}
        <section className="app-section app-set-end lg:hidden">
          <Panel flush>
            <SetNavRow
              label={<span lang={lang.other}>{lang.otherName}</span>}
              title={t('common.language')}
              icon={<Languages size={18} strokeWidth={1.75} />}
              chevron={false}
              onClick={lang.go}
            />
            <SetNavRow
              label={t('nav.signOut')}
              icon={<LogOut size={18} strokeWidth={1.75} />}
              chevron={false}
              onClick={() => signOut()}
            />
          </Panel>
        </section>
      </div>
    </div>
  );
}
