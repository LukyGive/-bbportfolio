const SAFE_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function isDevelopmentWriteEnabled(env = process.env.NODE_ENV): boolean {
  return env === 'development';
}

export function assertDevelopmentWriteEnabled(env = process.env.NODE_ENV): void {
  if (!isDevelopmentWriteEnabled(env)) {
    throw new Error('Admin writes are disabled outside development.');
  }
}

export function assertSafeSlug(slug: string): void {
  if (!SAFE_SLUG.test(slug)) throw new Error('Unsafe slug.');
}
