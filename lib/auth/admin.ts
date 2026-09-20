type ClaimsResult = {
  data?: { claims?: { sub?: string } | null } | null;
  error?: unknown;
};

type MaybeSingleResult = {
  data?: { user_id?: string } | null;
  error?: unknown;
};

type AdminCheckOperations = {
  getClaims(): PromiseLike<ClaimsResult>;
  lookupAdmin(userId: string): PromiseLike<MaybeSingleResult>;
};

export type AdminCheck = { ok: true; userId: string } | { ok: false };

export async function checkAdminWithOperations(operations: AdminCheckOperations): Promise<AdminCheck> {
  const claimsResult = await operations.getClaims();
  const userId = claimsResult.error ? undefined : claimsResult.data?.claims?.sub;
  if (!userId) return { ok: false };

  const { data, error } = await operations.lookupAdmin(userId);
  if (error || data?.user_id !== userId) return { ok: false };
  return { ok: true, userId };
}
