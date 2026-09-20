import { redirect } from 'next/navigation';
import { checkAdminWithOperations } from './admin';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export async function getAdminContext() {
  const client = await createServerSupabaseClient();
  const result = await checkAdminWithOperations({
    getClaims: async () => {
      const { data, error } = await client.auth.getClaims();
      return {
        data: { claims: data?.claims ? { sub: data.claims.sub } : null },
        error,
      };
    },
    lookupAdmin: async (userId) => {
      const { data, error } = await client
        .from('admin_users')
        .select('user_id')
        .eq('user_id', userId)
        .maybeSingle();
      return { data, error };
    },
  });
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
