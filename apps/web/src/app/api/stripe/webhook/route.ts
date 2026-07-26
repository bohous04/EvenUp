/**
 * Stripe webhook. The signature MUST be verified against the raw body — a
 * re-serialised body fails verification, and skipping verification would make
 * this endpoint forgeable by anyone who knows the URL.
 */
import { prisma, Prisma } from '@evenup/db';
import { applyStripeEvent, getStripe } from '@evenup/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Prisma error codes that indicate a transient, infrastructure-level failure
 * — the database was briefly unreachable, a connection pool timed out, a
 * transaction hit a write conflict or deadlock. These are worth a 500 so
 * Stripe retries: the identical event will likely succeed a few minutes
 * later.
 */
const TRANSIENT_PRISMA_CODES = new Set([
  'P1001', // Can't reach database server
  'P1002', // Database server was reached but timed out
  'P1008', // Operations timed out
  'P1017', // Server has closed the connection
  'P2024', // Timed out fetching a connection from the pool
  'P2028', // Transaction API error
  'P2034', // Transaction failed due to a write conflict or deadlock
]);

/**
 * `applyStripeEvent` makes no outbound network calls of its own — every
 * error it throws is either one of the transient Prisma signals above, or
 * something deterministic for this event's payload: `subscriptionPeriod()`
 * throwing a plain `Error` on a subscription with no line items, a
 * `user.update` throwing P2025 because the metadata `userId` names a deleted
 * user, or `upsertSubscription`'s foreign-key violation for the same reason.
 * Stripe resends the exact same payload on retry, so those fail identically
 * forever — retrying for up to 3 days gains nothing and only delays anyone
 * noticing. Anything not affirmatively recognised as transient is therefore
 * treated as permanent; the loud logging on that path is what makes this
 * default safe rather than a silent way to drop a real payment event.
 */
function isTransientFailure(err: unknown): boolean {
  if (err instanceof Prisma.PrismaClientInitializationError) return true;
  if (err instanceof Prisma.PrismaClientRustPanicError) return true;
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    return TRANSIENT_PRISMA_CODES.has(err.code);
  }
  return false;
}

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

  try {
    await applyStripeEvent(prisma, event);
  } catch (err) {
    if (isTransientFailure(err)) {
      console.error(
        `[stripe-webhook] transient failure applying ${event.type} (${event.id}); Stripe will retry`,
        err,
      );
      return new Response('internal error', { status: 500 });
    }
    // A permanent 200 means Stripe will NEVER retry this event, so if it
    // represented real money this log line is the only signal anyone gets.
    console.error(
      `[stripe-webhook] PERMANENT failure applying ${event.type} (${event.id}); NOT retrying — investigate now`,
      err,
    );
    return new Response('unprocessable event, see logs', { status: 200 });
  }

  return new Response('ok', { status: 200 });
}
