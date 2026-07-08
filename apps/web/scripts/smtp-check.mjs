/**
 * Standalone Seznam SMTP auth + send check — reproduces exactly what the app's
 * sendViaSmtp does. Run locally; your password stays in your shell env and is
 * never printed. Paste only the OUTPUT.
 *
 *   SMTP_PASS='your-seznam-password' TEST_TO='you@gmail.com' \
 *     node scripts/smtp-check.mjs
 *
 * Uses the repo's own nodemailer. TEST_TO is optional — without it, only the
 * auth handshake (transporter.verify) is tested.
 */
import nodemailer from 'nodemailer';

const cfg = {
  host: process.env.SMTP_HOST ?? 'smtp.seznam.cz',
  port: Number(process.env.SMTP_PORT ?? '587'),
  secure: process.env.SMTP_SECURE === 'true', // false → STARTTLS on 587
  user: process.env.SMTP_USER ?? 'noreply@lnrt.cz',
  from: process.env.EMAIL_FROM ?? 'EvenUp <noreply@lnrt.cz>',
};
const pass = process.env.SMTP_PASS;
const to = process.env.TEST_TO;

console.log(`config: host=${cfg.host} port=${cfg.port} secure=${cfg.secure} user=${cfg.user} from="${cfg.from}"`);
console.log(`password provided: ${pass ? `yes (${pass.length} chars)` : 'NO — set SMTP_PASS'}`);
if (!pass) process.exit(1);

const transporter = nodemailer.createTransport({
  host: cfg.host,
  port: cfg.port,
  secure: cfg.secure,
  auth: { user: cfg.user, pass },
  logger: false,
});

try {
  await transporter.verify();
  console.log('AUTH: ✓ transporter.verify() succeeded — credentials + STARTTLS OK');
} catch (e) {
  console.log('AUTH: ✗ FAILED');
  console.log(`  ${e.code ?? ''} ${e.responseCode ?? ''} ${e.message}`);
  if (e.response) console.log(`  server said: ${e.response}`);
  process.exit(2);
}

if (to) {
  try {
    const info = await transporter.sendMail({
      from: cfg.from,
      to,
      subject: 'EvenUp SMTP check',
      text: 'If you got this, Seznam SMTP delivery works.',
    });
    console.log(`SEND: ✓ accepted → ${info.accepted?.join(', ')} (messageId ${info.messageId})`);
    console.log('  Check that inbox (and spam). If accepted here but never arrives, it is a delivery/DMARC issue, not auth.');
  } catch (e) {
    console.log('SEND: ✗ FAILED');
    console.log(`  ${e.code ?? ''} ${e.responseCode ?? ''} ${e.message}`);
    if (e.response) console.log(`  server said: ${e.response}`);
  }
} else {
  console.log('SEND: skipped (set TEST_TO=you@example.com to also try a real send)');
}
