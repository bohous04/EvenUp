'use client';
import { useState } from 'react';
import { AppLink } from '@/components/app-link';
import { useI18n } from '@/lib/i18n';
import { signUp } from '@/lib/auth-client';
import { Button, Input, Label, PasswordInput } from '@/components/ui';
import { AuthError, AuthScreen, FieldHint } from '@/components/auth-screen';
import { Mail } from '@/components/icons';

/**
 * `callbackURL`: where the verification link lands the user — the dashboard by
 * default. `/` is the public landing page now, so a verified new account has
 * to land on `/groups` instead or it arrives back on the marketing site.
 */
const DASHBOARD = '/onboarding';

export function SignUp({ callbackURL = DASHBOARD }: { callbackURL?: string }) {
  const { t } = useI18n();
  const safeCallback = /^\/(?!\/)/.test(callbackURL) ? callbackURL : DASHBOARD;
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const signInHref = '/groups';

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await signUp.email({ name, email, password, callbackURL: safeCallback });
    setLoading(false);
    if (res.error) {
      setError(
        res.error.code === 'USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL'
          ? t('auth.err.emailInUse')
          : t('error.generic'),
      );
    } else {
      setSent(true);
    }
  }

  if (sent) {
    return (
      <AuthScreen
        icon={<Mail size={20} strokeWidth={1.75} />}
        title={t('auth.verifyTitle')}
        lede={<span data-testid="signup-verify-sent">{t('auth.verifyBody', { email })}</span>}
        footer={
          <AppLink href={signInHref} className="app-auth-alt" data-testid="signin-link">
            {t('auth.backToSignIn')}
          </AppLink>
        }
      >
        <div className="app-auth-form">
          <AppLink
            href={`/verify-email/pending?email=${encodeURIComponent(email)}`}
            className="app-auth-alt"
            data-testid="verify-email-link"
          >
            {t('auth.resend')}
          </AppLink>
          <button
            type="button"
            className="app-auth-link app-auth-link-center"
            onClick={() => {
              setSent(false);
              setPassword('');
            }}
          >
            {t('auth.wrongEmail')}
          </button>
        </div>
      </AuthScreen>
    );
  }

  return (
    <AuthScreen
      title={t('auth.signUpTitle')}
      lede={t('auth.signUpLede')}
      footer={
        <>
          <p className="app-auth-q">{t('auth.hasAccount')}</p>
          <AppLink href={signInHref} data-testid="signin-link" className="app-auth-alt">
            {t('auth.signInBtn')}
          </AppLink>
        </>
      }
    >
      <form onSubmit={submit} className="app-auth-form">
        <div>
          <Label htmlFor="name">{t('auth.name')}</Label>
          <Input
            id="name"
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="name"
            autoCapitalize="words"
            aria-describedby="signup-name-hint"
            data-testid="signup-name"
          />
          <FieldHint id="signup-name-hint">{t('auth.nameHint')}</FieldHint>
        </div>
        <div>
          <Label htmlFor="email">{t('auth.email')}</Label>
          <Input
            id="email"
            type="email"
            inputMode="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            autoComplete="email"
            autoCapitalize="none"
            spellCheck={false}
            data-testid="signup-email"
          />
        </div>
        <div>
          <Label htmlFor="password">{t('auth.password')}</Label>
          <PasswordInput
            id="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            minLength={8}
            aria-describedby="signup-password-hint"
            data-testid="signup-password"
            showLabel={t('auth.showPassword')}
            hideLabel={t('auth.hidePassword')}
          />
          <FieldHint id="signup-password-hint">{t('auth.passwordHint')}</FieldHint>
        </div>
        {error ? <AuthError>{error}</AuthError> : null}
        <Button type="submit" disabled={loading} className="w-full" data-testid="signup-submit">
          {loading ? t('common.loading') : t('auth.signUpBtn')}
        </Button>
      </form>
    </AuthScreen>
  );
}
