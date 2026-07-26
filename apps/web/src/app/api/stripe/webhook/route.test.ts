/**
 * Route-level coverage for the raw-body signature verification in
 * `route.ts` — the single highest-risk line in the billing feature, since a
 * bug there would make the webhook forgeable by anyone who knows the URL.
 * Also covers the transient-vs-permanent error handling around
 * `applyStripeEvent` (see route.ts for the reasoning).
 *
 * `getStripe` is left un-mocked so `stripe.webhooks.constructEvent` and
 * `generateTestHeaderString` run for real — genuine HMAC verification, no
 * network calls. Only `applyStripeEvent` is mocked, so no real database
 * writes happen here; that behaviour is covered by webhook.test.ts in
 * @evenup/api.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Prisma } from '@evenup/db';
import type * as EvenupApi from '@evenup/api';

vi.mock('@evenup/api', async (importOriginal) => {
  const actual = await importOriginal<typeof EvenupApi>();
  return { ...actual, applyStripeEvent: vi.fn() };
});

import { getStripe } from '@evenup/api';
import { applyStripeEvent } from '@evenup/api';
import { POST } from './route.js';

const WEBHOOK_SECRET = 'whsec_test_topsecret';
const savedEnv = { ...process.env };

function payloadFor(id: string, type = 'checkout.session.completed'): string {
  return JSON.stringify({
    id,
    object: 'event',
    type,
    data: { object: { id: 'cs_test_1', mode: 'payment', payment_status: 'unpaid' } },
  });
}

function sign(payload: string, secret = WEBHOOK_SECRET): string {
  const stripe = getStripe();
  if (!stripe) throw new Error('expected getStripe() to return a real client in tests');
  return stripe.webhooks.generateTestHeaderString({ payload, secret });
}

function request(payload: string, signature?: string): Request {
  const headers: Record<string, string> = {};
  if (signature !== undefined) headers['stripe-signature'] = signature;
  return new Request('http://localhost/api/stripe/webhook', {
    method: 'POST',
    headers,
    body: payload,
  });
}

describe('POST /api/stripe/webhook', () => {
  beforeEach(() => {
    process.env = {
      ...savedEnv,
      STRIPE_SECRET_KEY: 'sk_test_123',
      STRIPE_WEBHOOK_SECRET: WEBHOOK_SECRET,
    };
    vi.mocked(applyStripeEvent).mockReset();
    vi.mocked(applyStripeEvent).mockResolvedValue(undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    process.env = { ...savedEnv };
    vi.restoreAllMocks();
  });

  it('returns 404 when billing is disabled (no webhook secret configured)', async () => {
    delete process.env.STRIPE_WEBHOOK_SECRET;
    const payload = payloadFor('evt_disabled');
    const res = await POST(request(payload, 'irrelevant'));
    expect(res.status).toBe(404);
    expect(applyStripeEvent).not.toHaveBeenCalled();
  });

  it('returns 400 when the stripe-signature header is missing', async () => {
    const res = await POST(request(payloadFor('evt_no_sig')));
    expect(res.status).toBe(400);
    expect(applyStripeEvent).not.toHaveBeenCalled();
  });

  it('accepts a validly signed event and applies it', async () => {
    const payload = payloadFor('evt_valid');
    const res = await POST(request(payload, sign(payload)));
    expect(res.status).toBe(200);
    expect(applyStripeEvent).toHaveBeenCalledTimes(1);
    const [, appliedEvent] = vi.mocked(applyStripeEvent).mock.calls[0]!;
    expect(appliedEvent).toMatchObject({ id: 'evt_valid', type: 'checkout.session.completed' });
  });

  it('rejects a tampered body with 400 and never applies the event', async () => {
    const original = payloadFor('evt_tampered');
    const signature = sign(original); // signed for the ORIGINAL body
    const tampered = payloadFor('evt_tampered', 'checkout.session.async_payment_succeeded');
    const res = await POST(request(tampered, signature));
    expect(res.status).toBe(400);
    expect(applyStripeEvent).not.toHaveBeenCalled();
  });

  it('rejects a signature computed with the wrong secret with 400', async () => {
    const payload = payloadFor('evt_wrong_secret');
    const res = await POST(request(payload, sign(payload, 'whsec_not_the_configured_one')));
    expect(res.status).toBe(400);
    expect(applyStripeEvent).not.toHaveBeenCalled();
  });

  it('returns 200 and logs loudly on a permanent failure, so Stripe stops retrying', async () => {
    // Simulates `subscriptionPeriod()` throwing on a subscription with no
    // line items: a plain Error, deterministic for this event's payload.
    vi.mocked(applyStripeEvent).mockRejectedValueOnce(new Error('subscription sub_1 has no items'));
    const payload = payloadFor('evt_permanent');
    const res = await POST(request(payload, sign(payload)));
    expect(res.status).toBe(200);
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('PERMANENT'),
      expect.any(Error),
    );
  });

  it('returns 200 on a Prisma "record not found" failure (deleted user referenced by stale metadata)', async () => {
    vi.mocked(applyStripeEvent).mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError(
        'An operation failed because it depends on one or more records that were required but not found.',
        {
          code: 'P2025',
          clientVersion: '6.19.3',
        },
      ),
    );
    const payload = payloadFor('evt_deleted_user');
    const res = await POST(request(payload, sign(payload)));
    expect(res.status).toBe(200);
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('PERMANENT'),
      expect.anything(),
    );
  });

  it('returns 500 on a transient database failure, so Stripe retries', async () => {
    vi.mocked(applyStripeEvent).mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError("Can't reach database server", {
        code: 'P1001',
        clientVersion: '6.19.3',
      }),
    );
    const payload = payloadFor('evt_transient');
    const res = await POST(request(payload, sign(payload)));
    expect(res.status).toBe(500);
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('transient'),
      expect.anything(),
    );
  });
});
