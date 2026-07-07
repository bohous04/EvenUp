/**
 * Email delivery for transactional messages (magic links). Tries, in order:
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
  // No provider configured — log it (dev). Magic links also surface via
  // AUTH_DEV_ECHO for local/E2E sign-in.
  // eslint-disable-next-line no-console
  console.log(
    `[email] (no provider) to=${message.to} subject="${message.subject}"\n${message.text}`,
  );
}

/** Branded bilingual (CZ/EN) magic-link email. */
export function magicLinkEmail(to: string, url: string): EmailMessage {
  const text = `Přihlaste se do EvenUp / Sign in to EvenUp\n\n${url}\n\nOdkaz platí omezenou dobu. Pokud jste o přihlášení nežádali, tento e-mail ignorujte.\nThis link expires shortly. If you didn't request it, you can ignore this email.`;
  const html = `<!doctype html><html><body style="margin:0;background:#f5f5f5;font-family:ui-sans-serif,system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;color:#171717">
  <div style="max-width:480px;margin:0 auto;padding:32px 20px">
    <div style="background:#fff;border:1px solid #e5e5e5;border-radius:16px;padding:28px;text-align:center">
      <div style="font-size:20px;font-weight:800;color:#2563eb">EvenUp</div>
      <p style="color:#525252;margin:8px 0 24px">Přihlaste se klepnutím na tlačítko · Sign in by tapping the button</p>
      <a href="${url}" style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;font-weight:700;padding:12px 24px;border-radius:10px">Přihlásit se / Sign in</a>
      <p style="color:#737373;font-size:12px;margin-top:24px;word-break:break-all">${url}</p>
    </div>
    <p style="color:#a3a3a3;font-size:12px;text-align:center;margin-top:16px">Odkaz brzy vyprší. Pokud jste o přihlášení nežádali, e-mail ignorujte.<br/>This link expires shortly. If you didn't request it, ignore this email.</p>
  </div></body></html>`;
  return { to, subject: 'Přihlášení do EvenUp / Sign in to EvenUp', html, text };
}
