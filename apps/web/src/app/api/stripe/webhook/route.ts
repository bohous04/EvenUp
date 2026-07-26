/**
 * Stripe webhook. The signature MUST be verified against the raw body — a
 * re-serialised body fails verification, and skipping verification would make
 * this endpoint forgeable by anyone who knows the URL.
 */
import { prisma } from '@evenup/db';
import { applyStripeEvent, getStripe } from '@evenup/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request): Promise<Response> {
  const stripe = getStripe();
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!stripe || !secret) return new Response('billing disabled', { status: 404 });

  const signature = req.headers.get('stripe-signature');
  if (!signature) return new Response('missing signature', { status: 400 });

  // Raw text, never req.json() — verification is byte-exact.
  const raw = await req.text();

  let event;
  try {
    event = stripe.webhooks.constructEvent(raw, signature, secret);
  } catch {
    return new Response('invalid signature', { status: 400 });
  }

  await applyStripeEvent(prisma, event);
  return new Response('ok', { status: 200 });
}
