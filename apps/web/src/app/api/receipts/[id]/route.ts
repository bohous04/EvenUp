import { prisma } from '@evenup/db';
import { auth } from '@/server/auth';
import { getObjectStore } from '@/server/object-store';

/**
 * Streams a stored receipt image to an authenticated user who has access to
 * the receipt's group (creator or a linked member — mirrors
 * `assertGroupAccess` in packages/api/src/access.ts).
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session?.user) return new Response('Unauthorized', { status: 401 });
  const { id } = await params;

  const receipt = await prisma.receipt.findUnique({
    where: { id },
    select: { storageKey: true, groupId: true },
  });
  if (!receipt || !receipt.storageKey) return new Response('Not found', { status: 404 });

  const group = await prisma.group.findUnique({
    where: { id: receipt.groupId },
    select: { createdById: true, members: { where: { userId: session.user.id }, select: { id: true } } },
  });
  const allowed = group && (group.createdById === session.user.id || group.members.length > 0);
  if (!allowed) return new Response('Forbidden', { status: 403 });

  const obj = await getObjectStore().getObject(receipt.storageKey);
  if (!obj) return new Response('Not found', { status: 404 });

  // Only ever serve a known-safe raster content type. This blocks stored XSS
  // via SVG (or any other script-capable type) that may have slipped past
  // upload-time validation — the browser can't render/execute a mismatched
  // or octet-stream response.
  const SAFE_IMAGE_TYPES = new Set([
    'image/png',
    'image/jpeg',
    'image/jpg',
    'image/webp',
    'image/gif',
    'image/heic',
    'image/heif',
    'image/avif',
  ]);
  const contentType = SAFE_IMAGE_TYPES.has(obj.contentType) ? obj.contentType : 'application/octet-stream';

  return new Response(Buffer.from(obj.bytes), {
    status: 200,
    headers: {
      'Content-Type': contentType,
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; sandbox;",
      'Cache-Control': 'private, max-age=300',
    },
  });
}
