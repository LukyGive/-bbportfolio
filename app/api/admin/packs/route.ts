import { getAdminContext } from '@/lib/auth/server';
import { parsePackMutationBody } from '@/lib/admin/pack-payload';
import { createRemotePack, deleteRemotePack, updateRemotePack } from '@/lib/admin/pack-remote';

export const runtime = 'nodejs';

function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : 'Unexpected error.';
  if (/already exists|duplicate/i.test(message)) return Response.json({ error: message }, { status: 409 });
  if (/not found/i.test(message)) return Response.json({ error: message }, { status: 404 });
  if (/required|invalid|unsafe|slug|payload|uuid|creation|upload|bucket|size|image|cover|selected|exist/i.test(message)) {
    return Response.json({ error: message }, { status: 400 });
  }
  console.error('[admin] pack mutation failed', message);
  return Response.json({ error: 'Could not update the pack.' }, { status: 500 });
}

export async function POST(request: Request) {
  const context = await getAdminContext();
  if (!context) return Response.json({ error: 'Unauthorized.' }, { status: 401 });

  try {
    const body = await request.json().catch(() => null);
    const parsed = parsePackMutationBody(body, context.userId);
    const result = await createRemotePack(context.client, context.userId, parsed.input, parsed.uploads);
    return Response.json(result, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PUT(request: Request) {
  const context = await getAdminContext();
  if (!context) return Response.json({ error: 'Unauthorized.' }, { status: 401 });

  try {
    const body = await request.json().catch(() => null);
    const parsed = parsePackMutationBody(body, context.userId);
    if (!parsed.originalId) return Response.json({ error: 'originalId is required.' }, { status: 400 });
    const result = await updateRemotePack(
      context.client,
      context.userId,
      parsed.originalId,
      parsed.input,
      parsed.uploads,
      parsed.removeCover,
    );
    return Response.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request) {
  const context = await getAdminContext();
  if (!context) return Response.json({ error: 'Unauthorized.' }, { status: 401 });

  try {
    const body = await request.json().catch(() => null) as { id?: unknown } | null;
    if (!body || typeof body.id !== 'string' || !body.id.trim()) {
      return Response.json({ error: 'Pack id is required.' }, { status: 400 });
    }
    return Response.json({ ok: true, ...(await deleteRemotePack(context.client, body.id.trim())) });
  } catch (error) {
    return errorResponse(error);
  }
}
