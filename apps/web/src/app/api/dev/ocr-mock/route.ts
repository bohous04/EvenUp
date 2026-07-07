import { env } from '@/server/env';

/**
 * Dev/E2E-only mock of the OpenRouter chat-completions endpoint. Point
 * OPENROUTER_BASE_URL at this route to exercise the OCR flow without live calls.
 * Disabled unless AUTH_DEV_ECHO=true.
 */
const RECEIPT = {
  merchant: 'Albert',
  date: '2026-06-22',
  currency: 'CZK',
  items: [
    { name: 'Mléko', quantity: 1, unitPrice: 24.9, totalPrice: 24.9 },
    { name: 'Chléb', quantity: 1, unitPrice: 35.1, totalPrice: 35.1 },
  ],
  subtotal: 60.0,
  tax: null,
  tip: null,
  total: 60.0,
  confidence: 0.97,
};

export async function POST() {
  if (!env.authDevEcho) {
    return Response.json({ error: 'disabled' }, { status: 404 });
  }
  return Response.json({
    choices: [{ message: { content: JSON.stringify(RECEIPT) } }],
    usage: { prompt_tokens: 100, completion_tokens: 60, total_tokens: 160 },
  });
}
