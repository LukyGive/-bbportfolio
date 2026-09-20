type ClaimsResult = {
  data?: { claims?: { sub?: string } | null } | null;
  error?: unknown;
};

type MaybeSingleResult = {
  data?: { user_id?: string } | null;
  error?: unknown;
};

type AdminCheckClient = {
  auth: { getClaims(): Promise<ClaimsResult> };
  from(table: 'admin_users'): {
    select(columns: 'user_id'): {
      eq(column: 'user_id', value: string): {
        maybeSingle(): Promise<MaybeSingleResult>;
      };
    };
  };
};

export type AdminCheck = { ok: true; userId: string } | { ok: false };

export async function checkAdminWithClient(client: AdminCheckClient): Promise<AdminCheck> {
  const claimsResult = await client.auth.getClaims();
  const userId = claimsResult.error ? undefined : claimsResult.data?.claims?.sub;
  if (!userId) return { ok: false };

  const { data, error } = await client
    .from('admin_users')
    .select('user_id')
    .eq('user_id', userId)
    .maybeSingle();

  if (error || data?.user_id !== userId) return { ok: false };
  return { ok: true, userId };
}
