import { describe, expect, it, vi } from 'vitest';
import { checkAdminWithOperations } from '@/lib/auth/admin';

describe('checkAdminWithOperations', () => {
  it('rejects when validated claims are missing without querying the allowlist', async () => {
    const lookupAdmin = vi.fn();
    await expect(checkAdminWithOperations({
      getClaims: vi.fn().mockResolvedValue({ data: { claims: null }, error: null }),
      lookupAdmin,
    })).resolves.toEqual({ ok: false });
    expect(lookupAdmin).not.toHaveBeenCalled();
  });

  it('rejects a signed-in user who is not allowlisted', async () => {
    await expect(checkAdminWithOperations({
      getClaims: vi.fn().mockResolvedValue({ data: { claims: { sub: 'u1' } }, error: null }),
      lookupAdmin: vi.fn().mockResolvedValue({ data: null, error: null }),
    })).resolves.toEqual({ ok: false });
  });

  it('accepts only the allowlisted authenticated user', async () => {
    await expect(checkAdminWithOperations({
      getClaims: vi.fn().mockResolvedValue({ data: { claims: { sub: 'u1' } }, error: null }),
      lookupAdmin: vi.fn().mockResolvedValue({ data: { user_id: 'u1' }, error: null }),
    })).resolves.toEqual({ ok: true, userId: 'u1' });
  });
});
