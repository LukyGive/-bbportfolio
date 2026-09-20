import { getAdminContext } from '@/lib/auth/server';
import { deleteRemoteGalleryImage, moveRemoteGalleryImage } from '@/lib/admin/gallery';
import type { GalleryMoveDirection } from '@/lib/admin/gallery-order';

export const runtime = 'nodejs';

function failure(error: unknown) {
  const message = error instanceof Error ? error.message : 'Could not update gallery.';
  const status = /not found/i.test(message) ? 404 : 500;
  return Response.json({ error: message }, { status });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await getAdminContext();
  if (!context) return Response.json({ error: 'Unauthorized.' }, { status: 401 });

  try {
    const body = await request.json().catch(() => null) as { direction?: unknown } | null;
    if (!body || (body.direction !== 'up' && body.direction !== 'down')) {
      return Response.json({ error: 'Direction must be up or down.' }, { status: 400 });
    }
    const { id } = await params;
    const images = await moveRemoteGalleryImage(context.client, id, body.direction as GalleryMoveDirection);
    return Response.json({ images });
  } catch (error) {
    return failure(error);
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await getAdminContext();
  if (!context) return Response.json({ error: 'Unauthorized.' }, { status: 401 });

  try {
    const { id } = await params;
    return Response.json(await deleteRemoteGalleryImage(context.client, id));
  } catch (error) {
    return failure(error);
  }
}
