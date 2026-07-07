import { env } from '@/server/env';

/**
 * Dev/E2E-only mock of the Frankfurter FX provider. Point FX_PROVIDER_URL at
 * this route to exercise `fx.resolve` (and any on-demand rate fetch) without
 * live calls. Disabled unless AUTH_DEV_ECHO=true.
 *
 * `fetchRate` builds `${FX_PROVIDER_URL}/{YYYY-MM-DD}?from={quote}&to={base}`,
 * so the date is a path segment and `from`/`to` are query params.
 */
export async function GET(request: Request, { params }: { params: Promise<{ seg?: string[] }> }) {
  if (!env.authDevEcho) {
    return Response.json({ error: 'disabled' }, { status: 404 });
  }
  const { seg } = await params;
  const date = seg?.[0] ?? 'latest';
  const { searchParams } = new URL(request.url);
  const from = searchParams.get('from') ?? '';
  const to = searchParams.get('to') ?? '';
  return Response.json({
    base: from,
    date,
    rates: { [to]: 25 },
  });
}
