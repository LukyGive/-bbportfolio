import { getAdminContext } from '@/lib/auth/server';
import { parseCreationMutationBody } from '@/lib/admin/payload';
import { createRemoteCreation, deleteRemoteCreation, updateRemoteCreation } from '@/lib/admin/remote';

export const runtime = 'nodejs';

function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : 'Unexpected error.';
  if (/already exists|duplicate/i.test(message)) return Response.json({ error: message }, { status: 409 });
  if (/not found/i.test(message)) return Response.json({ error: message }, { status: 404 });
  if (/required|invalid|unsafe|image|slug|filename|payload|json|maximum|10 mib|50 mib|unsupported|bbmodel|viewer|glb|upload|bucket|size/i.test(message)) {
    return Response.json({ error: message }, { status: 400 });
  }
  console.error('[admin] creation mutation failed', message);
  return Response.json({ error: 'Could not update the portfolio.' }, { status: 500 });
}

async function authorized() {
  const context = await getAdminContext();
  if (!context) return null;
  return context;
}

export async function POST(request: Request) {
  const context = await authorized();
  if (!context) return Response.json({ error: 'Unauthorized.' }, { status: 401 });

  try {
    const body = await request.json().catch(() => null);
    const parsed = parseCreationMutationBody(body, context.userId);
    const result = await createRemoteCreation(context.client, context.userId, parsed.input, parsed.uploads);
    return Response.json(result, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PUT(request: Request) {
  const context = await authorized();
  if (!context) return Response.json({ error: 'Unauthorized.' }, { status: 401 });

  try {
    const body = await request.json().catch(() => null);
    const parsed = parseCreationMutationBody(body, context.userId);
    if (!parsed.originalId) return Response.json({ error: 'originalId is required.' }, { status: 400 });
    const result = await updateRemoteCreation(
      context.client,
      context.userId,
      parsed.originalId,
      parsed.input,
      parsed.uploads,
      parsed.replaceCover,
    );
    return Response.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request) {
  const context = await authorized();
  if (!context) return Response.json({ error: 'Unauthorized.' }, { status: 401 });

  try {
    const body = await request.json().catch(() => null) as { id?: unknown } | null;
    if (!body || typeof body.id !== 'string' || !body.id.trim()) {
      return Response.json({ error: 'Creation id is required.' }, { status: 400 });
    }
    return Response.json({ ok: true, ...(await deleteRemoteCreation(context.client, body.id.trim())) });
  } catch (error) {
    return errorResponse(error);
  }
}
