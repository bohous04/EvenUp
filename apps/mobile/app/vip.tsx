import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, AppState, View } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { formatCurrency } from '@evenup/i18n';
import {
  displayPackPriceMinor,
  displaySubscriptionPriceMinor,
} from '@evenup/api/billing/display-prices';
import { useSession } from '@/lib/auth';
import { trpc } from '@/lib/trpc';
import { useI18n } from '@/lib/i18n';
import { useTheme } from '@/ui/theme';
import { Button, Card, ErrorText, Screen, SectionLabel, Title } from '@/ui';

/**
 * VIP panel, the mobile counterpart of web's `(app)/vip/page.tsx`.
 *
 * Payment itself happens on Stripe's hosted pages, opened in an in-app browser
 * (`expo-web-browser`) — deliberately *not* a native payment sheet. Apple rule
 * 3.1.1 requires in-app purchase for digital goods sold from inside a native
 * app, and the alternative (a native Stripe SDK) is the same problem; handing
 * the customer to a hosted checkout keeps one billing backend instead of two.
 *
 * The known cost of that choice: Stripe's `returnUrl` sends the customer back
 * to `evenup.cz/vip?checkout=success`, which this app cannot intercept, so
 * there is no automatic "payment succeeded" banner. The screen refetches on
 * focus instead, so returning to it shows the new state.
 */
export default function VipScreen() {
  const { t, locale } = useI18n();
  const c = useTheme();
  const { data: session, isPending: sessionPending } = useSession();
  const [error, setError] = useState<string | null>(null);

  const summary = trpc.billing.summary.useQuery(undefined, { enabled: !!session?.user });
  const refetchSummary = summary.refetch;
  // The Stripe pages run in a separate app, so coming back from one makes
  // this app go background -> active. That is the moment the webhook may have
  // landed, so re-read on resume rather than showing the pre-payment panel.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refetchSummary();
    });
    return () => sub.remove();
  }, [refetchSummary]);

  /**
   * Every purchase mutation returns a Stripe-hosted `url`, typed
   * `string | null`. A falsy url must surface as an error instead of leaving a
   * button that appears to do nothing (mirrors web's `goTo`).
   */
  const openStripe = useCallback(
    async (result: { url: string | null } | undefined) => {
      if (!result?.url) {
        setError(t('error.generic'));
        return;
      }
      await WebBrowser.openBrowserAsync(result.url);
    },
    [t],
  );

  const checkoutSubscription = trpc.billing.checkoutSubscription.useMutation({
    onSuccess: (data) => void openStripe(data),
    onError: (e) => setError(e.message),
  });
  const checkoutCredits = trpc.billing.checkoutCredits.useMutation({
    onSuccess: (data) => void openStripe(data),
    onError: (e) => setError(e.message),
  });
  const portal = trpc.billing.portal.useMutation({
    onSuccess: (data) => void openStripe(data),
    onError: (e) => setError(e.message),
  });

  const pending = checkoutSubscription.isPending || checkoutCredits.isPending || portal.isPending;

  if (sessionPending || summary.isLoading) {
    return (
      <Screen>
        <ActivityIndicator color={c.brand} />
      </Screen>
    );
  }

  if (!session?.user) {
    return (
      <Screen scroll>
        <Title>{t('vip.title')}</Title>
        <Card>
          <ErrorText>{t('vip.signedOut')}</ErrorText>
        </Card>
      </Screen>
    );
  }

  // TanStack Query retries before settling, and then `isPending` stays false
  // with no data — conflating that with loading strands a returning customer
  // on a spinner. Branch on the error and offer a retry instead.
  if (summary.isError || !summary.data) {
    return (
      <Screen scroll>
        <Title>{t('vip.title')}</Title>
        <Card>
          <ErrorText>{t('error.generic')}</ErrorText>
          <Button
            title={t('common.retry')}
            variant="secondary"
            onPress={() => void refetchSummary()}
          />
        </Card>
      </Screen>
    );
  }

  const s = summary.data;
  const subscribed = !!s.subscription;
  const priceMinor = displaySubscriptionPriceMinor(s.currency);

  return (
    <Screen scroll>
      <Title>{t('vip.title')}</Title>

      {error ? <ErrorText testID="vip-error">{error}</ErrorText> : null}

      {!s.billingEnabled ? (
        <Card>
          <ErrorText testID="vip-disabled">{t('vip.disabled')}</ErrorText>
        </Card>
      ) : (
        <>
          {subscribed ? (
            <Card>
              <SectionLabel>{t('vip.subscription.title')}</SectionLabel>
              {/* An unknown status must fail closed rather than read as
                  "active" — the same rule web's panel applies. */}
              {s.subscription?.status === 'trialing' ? (
                <ErrorText testID="vip-trialing">{t('vip.subscription.trialing')}</ErrorText>
              ) : null}
              {s.subscription?.status === 'past_due' || s.subscription?.status === 'unpaid' ? (
                <ErrorText testID="vip-payment-problem">
                  {t('vip.subscription.paymentProblem')}
                </ErrorText>
              ) : null}
              {s.creditBalance > 0 ? (
                <View>
                  <SectionLabel>{t('vip.balance', { count: s.creditBalance })}</SectionLabel>
                </View>
              ) : null}
              <Button
                testID="vip-manage"
                title={t('vip.manage')}
                variant="secondary"
                loading={pending}
                onPress={() => {
                  setError(null);
                  portal.mutate(undefined);
                }}
              />
            </Card>
          ) : (
            <Card>
              <SectionLabel>{t('vip.subscription.title')}</SectionLabel>
              <Card>
                <View>
                  <SectionLabel>{t('vip.benefit.scans')}</SectionLabel>
                </View>
                <View>
                  <SectionLabel>
                    {t('vip.benefit.storage', { days: s.receiptRetentionDays })}
                  </SectionLabel>
                </View>
                <View>
                  <SectionLabel>{t('vip.benefit.cancel')}</SectionLabel>
                </View>
                <SectionLabel>
                  {t('vip.price.month', { price: formatCurrency(priceMinor, s.currency, locale) })}
                </SectionLabel>
              </Card>
              {s.subscriptionAvailable ? (
                <>
                  <Button
                    testID="vip-subscribe"
                    title={
                      s.trialEligible
                        ? t('vip.trial.subscribe', { trialDays: s.trialDays })
                        : t('vip.subscribe')
                    }
                    loading={pending}
                    onPress={() => {
                      setError(null);
                      checkoutSubscription.mutate(undefined);
                    }}
                  />
                  {s.trialEligible ? <SectionLabel>{t('vip.trial.note')}</SectionLabel> : null}
                </>
              ) : (
                // Stripe key present but no price for this currency: web
                // hides the button for exactly this case rather than offering
                // a checkout that fails with PRECONDITION_FAILED.
                <ErrorText testID="vip-subscription-unavailable">
                  {t('vip.subscription.unavailable')}
                </ErrorText>
              )}
            </Card>
          )}

          {s.packs.length > 0 ? (
            <Card>
              <SectionLabel>{t('vip.credits.title')}</SectionLabel>
              {s.packs.map((pack) => {
                // `summary.packs` carries only Stripe price ids, never an
                // amount, so the price comes from the same display table the
                // web panel and the landing page use. A pack with no display
                // price renders without one rather than with a wrong one.
                const packPriceMinor = displayPackPriceMinor(s.currency, pack.scans);
                return (
                  <View
                    key={pack.id}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}
                  >
                    <SectionLabel>{t('vip.credits.pack', { scans: pack.scans })}</SectionLabel>
                    {packPriceMinor === undefined ? null : (
                      <SectionLabel>
                        {formatCurrency(packPriceMinor, s.currency, locale)}
                      </SectionLabel>
                    )}
                    <Button
                      testID={`vip-buy-${pack.id}`}
                      title={t('vip.credits.buy')}
                      variant="secondary"
                      loading={pending}
                      onPress={() => {
                        setError(null);
                        // Web gates this behind an "immediate charge" checkbox.
                        // A native button press is its own acknowledgement, so
                        // the screen supplies it; the server re-checks anyway.
                        checkoutCredits.mutate({ packId: pack.id, acknowledgeImmediate: true });
                      }}
                    />
                  </View>
                );
              })}
              <SectionLabel>{t('vip.credits.ack')}</SectionLabel>
            </Card>
          ) : null}
        </>
      )}
    </Screen>
  );
}
