import { createCreation, deleteCreation, updateCreation } from '@/lib/admin/storage';
import { parseCreationFormData } from '@/lib/admin/payload';

export const runtime = 'nodejs';

function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : 'Unexpected error.';
  if (/duplicate/i.test(message)) return Response.json({ error: message }, { status: 409 });
  if (/not found/i.test(message)) return Response.json({ error: message }, { status: 404 });
  if (/required|invalid|unsafe|image|slug|filename|payload|json|maximum|10 mb|unsupported/i.test(message)) {
    return Response.json({ error: message }, { status: 400 });
  }
  console.error('[admin] creation mutation failed', error instanceof Error ? error.message : error);
  return Response.json({ error: 'Could not update the local portfolio.' }, { status: 500 });
}

export async function POST(request: Request) {
  if (process.env.NODE_ENV !== 'development') {
    return Response.json({ error: 'Admin writes are disabled.' }, { status: 404 });
  }
  try {
    const { input, images } = parseCreationFormData(await request.formData());
    const creation = await createCreation(input, images);
    return Response.json({ creation }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PUT(request: Request) {
  if (process.env.NODE_ENV !== 'development') {
    return Response.json({ error: 'Admin writes are disabled.' }, { status: 404 });
  }
  try {
    const { input, images, originalId } = parseCreationFormData(await request.formData());
    if (!originalId) return Response.json({ error: 'originalId is required.' }, { status: 400 });
    const creation = await updateCreation(originalId, input, images);
    return Response.json({ creation });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request) {
  if (process.env.NODE_ENV !== 'development') {
    return Response.json({ error: 'Admin writes are disabled.' }, { status: 404 });
  }
  try {
    const body = await request.json().catch(() => null) as { id?: unknown } | null;
    if (!body || typeof body.id !== 'string' || !body.id.trim()) {
      return Response.json({ error: 'Creation id is required.' }, { status: 400 });
    }
    await deleteCreation(body.id.trim());
    return Response.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
