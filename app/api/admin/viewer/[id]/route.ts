import { getAdminContext } from '@/lib/auth/server';
import { parseViewerReplacementBody } from '@/lib/admin/payload';
import { recordViewerError, replaceRemoteViewer } from '@/lib/admin/remote';

export const runtime = 'nodejs';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await getAdminContext();
  if (!context) return Response.json({ error: 'Unauthorized.' }, { status: 401 });

  try {
    const { id } = await params;
    const body = await request.json().catch(() => null);
    const viewer = parseViewerReplacementBody(body, context.userId);
    return Response.json({
      ok: true,
      ...(await replaceRemoteViewer(context.client, context.userId, id, viewer)),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not regenerate viewer.';
    return Response.json({ error: message }, { status: /not found|no \.bbmodel/i.test(message) ? 404 : 400 });
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await getAdminContext();
  if (!context) return Response.json({ error: 'Unauthorized.' }, { status: 401 });

  try {
    const { id } = await params;
    const body = await request.json().catch(() => null) as { error?: unknown } | null;
    if (!body || typeof body.error !== 'string' || !body.error.trim()) {
      return Response.json({ error: 'Viewer error message is required.' }, { status: 400 });
    }
    return Response.json({ ok: true, ...(await recordViewerError(context.client, id, body.error.trim().slice(0, 500))) });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not save viewer error.';
    return Response.json({ error: message }, { status: /not found/i.test(message) ? 404 : 500 });
  }
}
