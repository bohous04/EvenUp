/**
 * The email transport for the notification spine (PRD §4.11).
 *
 * `packages/api` decides what to say and to whom; this is the only place that
 * knows what a mail server is. It renders the structured payload in the
 * recipient's locale (FR-10.1, FR-10.4) and hands it to the existing
 * Resend → SMTP → console cascade in `email.ts`.
 *
 * Push channels drop in beside this one with no change to the spine.
 */
import 'server-only';
import type { NotifiableUser, NotificationChannel, NotificationPayload } from '@evenup/api';
import { t, catalogs, formatCurrency, type Locale, type MessageKey } from '@evenup/i18n';
import { isSupportedCurrency } from '@evenup/core';
import { sendEmail, type EmailMessage } from './email.js';
import { env } from './env.js';

function localeOf(user: NotifiableUser): Locale {
  return user.locale === 'en' ? 'en' : 'cs';
}

/**
 * Activity actions are free-form strings in the database, so a catalog miss is
 * possible (a new action shipped before its translation). `t()` would throw on
 * an unknown key, which would fail the whole digest; fall back to the raw
 * action instead. An ugly line beats a silent email outage.
 */
function activityLabel(locale: Locale, action: string): string {
  const key = `activityType.${action}`;
  return key in catalogs[locale] ? t(locale, key as MessageKey) : action;
}

/** Fall back to a bare number rather than throwing on an exotic currency. */
function money(minorUnits: number, currency: string, locale: Locale): string {
  if (!isSupportedCurrency(currency)) return `${(minorUnits / 100).toFixed(2)} ${currency}`;
  return formatCurrency(minorUnits, currency, locale);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function shell(title: string, bodyHtml: string, ctaUrl: string, ctaLabel: string): string {
  return `<!doctype html><html><body style="margin:0;background:#f5f5f5;font-family:ui-sans-serif,system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;color:#171717">
  <div style="max-width:480px;margin:0 auto;padding:32px 20px">
    <div style="background:#fff;border:1px solid #e5e5e5;border-radius:16px;padding:28px">
      <div style="font-size:20px;font-weight:800;color:#4f46e5;text-align:center">EvenUp</div>
      <h1 style="font-size:17px;margin:16px 0 12px">${escapeHtml(title)}</h1>
      ${bodyHtml}
      <p style="text-align:center;margin-top:24px">
        <a href="${ctaUrl}" style="display:inline-block;background:#4f46e5;color:#fff;text-decoration:none;font-weight:700;padding:12px 24px;border-radius:10px">${escapeHtml(ctaLabel)}</a>
      </p>
    </div>
  </div></body></html>`;
}

interface Rendered {
  readonly subject: string;
  readonly title: string;
  readonly lines: readonly string[];
  readonly ctaPath: string;
}

function render(payload: NotificationPayload, locale: Locale): Rendered {
  switch (payload.kind) {
    case 'digest': {
      const lines = payload.items.map((item) =>
        t(locale, 'notify.digest.line', {
          count: item.count,
          what: activityLabel(locale, item.action),
        }),
      );
      const net = payload.netMinorUnits;
      const balance =
        net < 0
          ? t(locale, 'notify.digest.youOwe', {
              amount: money(Math.abs(net), payload.currency, locale),
            })
          : net > 0
            ? t(locale, 'notify.digest.youAreOwed', {
                amount: money(net, payload.currency, locale),
              })
            : t(locale, 'notify.digest.settled');
      return {
        subject: t(locale, 'notify.digest.subject', { group: payload.groupName }),
        title: t(locale, 'notify.digest.title', { group: payload.groupName }),
        lines: [...lines, '', balance],
        ctaPath: `/groups/${payload.groupId}`,
      };
    }
    case 'reminder': {
      const amount = money(payload.amountMinorUnits, payload.currency, locale);
      const lines = [t(locale, 'notify.reminder.body', { amount, creditor: payload.creditorName })];
      if (payload.spayd) lines.push('', t(locale, 'notify.reminder.qrHint'));
      return {
        subject: t(locale, 'notify.reminder.subject', { group: payload.groupName }),
        title: t(locale, 'notify.reminder.title', { group: payload.groupName }),
        lines,
        ctaPath: `/groups/${payload.groupId}`,
      };
    }
    case 'settlement.received': {
      const amount = money(payload.amountMinorUnits, payload.currency, locale);
      return {
        subject: t(locale, 'notify.settlement.subject', { payer: payload.payerName }),
        title: t(locale, 'notify.settlement.title'),
        lines: [
          t(locale, 'notify.settlement.body', {
            payer: payload.payerName,
            amount,
            group: payload.groupName,
          }),
        ],
        ctaPath: `/groups/${payload.groupId}`,
      };
    }
  }
}

function toMessage(user: NotifiableUser, payload: NotificationPayload): EmailMessage {
  const locale = localeOf(user);
  const { subject, title, lines, ctaPath } = render(payload, locale);
  const url = `${env.authUrl}${ctaPath}`;
  const ctaLabel = t(locale, 'notify.cta.openGroup');

  const bodyHtml = lines
    .map((line) =>
      line === ''
        ? '<div style="height:8px"></div>'
        : `<p style="color:#525252;margin:6px 0">${escapeHtml(line)}</p>`,
    )
    .join('');

  const text = [
    title,
    '',
    ...lines,
    '',
    `${ctaLabel}: ${url}`,
    '',
    t(locale, 'notify.footer'),
  ].join('\n');

  return { to: user.email, subject, html: shell(title, bodyHtml, url, ctaLabel), text };
}

/**
 * Reachable iff we have an address. `sendEmail` itself degrades to a console
 * log when no provider is configured, so a self-hoster without SMTP sees the
 * notification in their logs rather than an exception.
 */
export const emailChannel: NotificationChannel = {
  id: 'email',
  supports: (user) => user.email.length > 0,
  send: async (user, payload) => {
    await sendEmail(toMessage(user, payload));
  },
};
