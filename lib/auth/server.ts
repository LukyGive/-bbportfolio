import { redirect } from 'next/navigation';
import { checkAdminWithClient } from './admin';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export async function getAdminContext() {
  const client = await createServerSupabaseClient();
  const result = await checkAdminWithClient(client);
  return result.ok ? { client, userId: result.userId } : null;
}

export async function isAdmin(): Promise<boolean> {
  return Boolean(await getAdminContext());
}

export async function requireAdmin(): Promise<{ userId: string }> {
  const context = await getAdminContext();
  if (!context) return redirect('/admin/login');
  return { userId: context.userId };
}
