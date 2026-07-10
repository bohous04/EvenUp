/**
 * Email delivery for transactional messages (password reset + email
 * verification). Tries, in order:
 *   1. Resend (if RESEND_API_KEY) — HTTP API, no extra dependency
 *   2. SMTP via nodemailer (if SMTP_HOST) — universal, for self-hosting
 *   3. console fallback (dev) — logs the message instead of sending
 * Self-hostable by design (PRD §12): plug in whichever provider you have.
 */
import 'server-only';
import { env } from './env.js';

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
}

async function sendViaResend(message: EmailMessage): Promise<void> {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.email.resendApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: env.email.from,
      to: [message.to],
      subject: message.subject,
      html: message.html,
      text: message.text,
    }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Resend send failed (HTTP ${res.status}): ${detail.slice(0, 300)}`);
  }
}

async function sendViaSmtp(message: EmailMessage): Promise<void> {
  // Imported lazily so projects without SMTP configured don't pay for it.
  const nodemailer = await import('nodemailer');
  const { host, port, secure, user, pass } = env.email.smtp;
  const transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: user && pass ? { user, pass } : undefined,
  });
  await transporter.sendMail({
    from: env.email.from,
    to: message.to,
    subject: message.subject,
    html: message.html,
    text: message.text,
  });
}

/** Send an email through the configured provider, falling back to the console. */
export async function sendEmail(message: EmailMessage): Promise<void> {
  if (env.email.resendApiKey) {
    await sendViaResend(message);
    return;
  }
  if (env.email.smtp.host) {
    await sendViaSmtp(message);
    return;
  }
  // No provider configured — log it (dev).
  // eslint-disable-next-line no-console
  console.log(
    `[email] (no provider) to=${message.to} subject="${message.subject}"\n${message.text}`,
  );
}

export const EMAIL_BRAND_COLOR = '#4f46e5';

/** The primary call-to-action button, styled once for every transactional email. */
export function emailButton(url: string, label: string): string {
  return `<a href="${url}" style="display:inline-block;background:${EMAIL_BRAND_COLOR};color:#fff;text-decoration:none;font-weight:700;padding:12px 24px;border-radius:10px">${label}</a>`;
}

/**
 * The branded page chrome every EvenUp email shares: grey page, centred white
 * card, wordmark. `cardStyle` lets a caller centre its content; `belowCard` is
 * for fine print that sits outside the card.
 */
export function emailShell(
  innerHtml: string,
  opts: { cardStyle?: string; belowCard?: string } = {},
): string {
  const extra = opts.cardStyle ? `;${opts.cardStyle}` : '';
  return `<!doctype html><html><body style="margin:0;background:#f5f5f5;font-family:ui-sans-serif,system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;color:#171717">
  <div style="max-width:480px;margin:0 auto;padding:32px 20px">
    <div style="background:#fff;border:1px solid #e5e5e5;border-radius:16px;padding:28px${extra}">
      <div style="font-size:20px;font-weight:800;color:${EMAIL_BRAND_COLOR}">EvenUp</div>
      ${innerHtml}
    </div>${opts.belowCard ?? ''}
  </div></body></html>`;
}

/** Shared branded HTML shell for a single-button transactional email. */
function brandedButton(url: string, intro: string, cta: string): string {
  return emailShell(
    `<p style="color:#525252;margin:8px 0 24px">${intro}</p>
      ${emailButton(url, cta)}
      <p style="color:#737373;font-size:12px;margin-top:24px;word-break:break-all">${url}</p>`,
    {
      cardStyle: 'text-align:center',
      belowCard: `
    <p style="color:#a3a3a3;font-size:12px;text-align:center;margin-top:16px">Odkaz brzy vyprší. Pokud jste o přihlášení nežádali, e-mail ignorujte.<br/>This link expires shortly. If you didn't request it, ignore this email.</p>`,
    },
  );
}

/** Branded bilingual (CZ/EN) password-reset email. */
export function resetPasswordEmail(to: string, url: string): EmailMessage {
  const text = `Obnovení hesla EvenUp / Reset your EvenUp password\n\n${url}\n\nPokud jste o obnovení nežádali, tento e-mail ignorujte.\nIf you didn't request this, ignore this email.`;
  const html = brandedButton(
    url,
    'Obnovte heslo klepnutím na tlačítko · Reset your password',
    'Obnovit heslo / Reset password',
  );
  return { to, subject: 'Obnovení hesla EvenUp / Reset your EvenUp password', html, text };
}

/** Branded bilingual (CZ/EN) email-verification email. */
export function verifyEmail(to: string, url: string): EmailMessage {
  const text = `Ověření e-mailu EvenUp / Verify your EvenUp email\n\n${url}\n\nPokud jste si účet nezakládali, tento e-mail ignorujte.\nIf you didn't create an account, ignore this email.`;
  const html = brandedButton(
    url,
    'Ověřte e-mail klepnutím na tlačítko · Verify your email',
    'Ověřit e-mail / Verify email',
  );
  return { to, subject: 'Ověření e-mailu EvenUp / Verify your EvenUp email', html, text };
}
