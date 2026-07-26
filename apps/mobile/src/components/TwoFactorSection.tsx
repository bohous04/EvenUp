import { useState } from 'react';
import { Text, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { authClient } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';
import { useTheme } from '@/ui/theme';
import { Button, Card, ErrorText, Input, PasswordInput, SectionLabel } from '@/ui';

type Phase = 'idle' | 'enabling' | 'verify';

/** Enable / disable TOTP two-factor auth (Better Auth twoFactor plugin), PRD §9.2. */
export function TwoFactorSection({ enabled }: { enabled: boolean }) {
  const { t } = useI18n();
  const c = useTheme();
  const [phase, setPhase] = useState<Phase>('idle');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [totpUri, setTotpUri] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [isOn, setIsOn] = useState(enabled);

  const secret = totpUri ? new URLSearchParams(totpUri.split('?')[1] ?? '').get('secret') : null;

  async function enable() {
    setBusy(true);
    setError(null);
    const res = await authClient.twoFactor.enable({ password });
    setBusy(false);
    if (res.error || !res.data) {
      setError(t('security.error.invalidPassword'));
      return;
    }
    setTotpUri(res.data.totpURI);
    setPhase('verify');
  }

  async function verify() {
    setBusy(true);
    setError(null);
    const res = await authClient.twoFactor.verifyTotp({ code });
    setBusy(false);
    if (res.error) {
      setError(t('security.error.invalidCode'));
      return;
    }
    setIsOn(true);
    setPhase('idle');
    setPassword('');
    setCode('');
  }

  async function disable() {
    setBusy(true);
    setError(null);
    const res = await authClient.twoFactor.disable({ password });
    setBusy(false);
    if (res.error) {
      setError(t('security.error.invalidPassword'));
      return;
    }
    setIsOn(false);
    setPhase('idle');
    setPassword('');
  }

  return (
    <Card>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <SectionLabel>{t('security.2fa.title')}</SectionLabel>
        <Text
          testID="2fa-status"
          style={{
            color: isOn ? c.green : c.textMuted,
            fontSize: c.type.label.fontSize,
            fontWeight: c.type.bodySemibold.fontWeight,
          }}
        >
          {isOn ? t('security.2fa.on') : t('security.2fa.off')}
        </Text>
      </View>

      {phase === 'idle' ? (
        isOn ? (
          <>
            <PasswordInput
              label={t('security.password.current')}
              value={password}
              onChangeText={setPassword}
            />
            <Button
              title={t('security.2fa.disable')}
              variant="danger"
              loading={busy}
              onPress={disable}
            />
          </>
        ) : (
          <Button title={t('security.2fa.enable')} onPress={() => setPhase('enabling')} />
        )
      ) : null}

      {phase === 'enabling' ? (
        <>
          <PasswordInput
            label={t('security.password.current')}
            value={password}
            onChangeText={setPassword}
            autoFocus
          />
          <Button title={t('security.2fa.enable')} loading={busy} onPress={enable} />
        </>
      ) : null}

      {phase === 'verify' && totpUri ? (
        <>
          <Text style={{ color: c.textMuted, fontSize: c.type.label.fontSize }}>
            {t('security.2fa.scan')}
          </Text>
          {/* The quiet zone stays white in *both* schemes — a dark card behind a
              black-on-transparent code kills scanner contrast. Web hardcodes
              `bg-white` here for the same reason; `onBrand` is the token that
              holds white across schemes. */}
          <View
            style={{
              alignSelf: 'center',
              backgroundColor: c.onBrand,
              padding: c.spacing[3],
              borderRadius: c.radii.md,
            }}
          >
            <QRCode value={totpUri} size={180} />
          </View>
          {secret ? (
            <Text
              selectable
              testID="2fa-secret"
              style={{ color: c.textMuted, fontSize: c.type.caption.fontSize, textAlign: 'center' }}
            >
              {t('security.2fa.secret')}: {secret}
            </Text>
          ) : null}
          <Input
            label={t('security.2fa.code')}
            keyboardType="number-pad"
            value={code}
            onChangeText={setCode}
          />
          <Button title={t('security.2fa.confirm')} loading={busy} onPress={verify} />
        </>
      ) : null}

      {error ? <ErrorText>{error}</ErrorText> : null}
    </Card>
  );
}
