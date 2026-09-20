# Online Admin + Private `.bbmodel` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the local filesystem admin with a production-safe online admin backed by Supabase Auth/Postgres/Storage, while keeping `.bbmodel` files private and preserving the public portfolio UX.

**Architecture:** Vercel continues to serve the Next.js 16 App Router application. Supabase becomes the single source of truth: public portfolio metadata is read from Postgres, renders are served from a public Storage bucket, and `.bbmodel` sources live in a private Storage bucket. Admin routes use SSR cookies plus RLS-backed authorization through an `admin_users` allowlist; public query functions explicitly omit private source-file fields.

**Tech Stack:** Next.js 16.3.3, React 19.3.0, TypeScript 5.8+, Vitest 3.2+, Playwright, Supabase Postgres/Auth/Storage, `@supabase/supabase-js`, `@supabase/ssr`, Vercel.

**Spec:** `docs/superpowers/specs/2026-09-20-online-admin-supabase-design.md`

## Global Constraints

- `.bbmodel` files are private and never exposed through public URLs, public API responses, repository files, or unauthenticated Storage policies.
- Only a UUID present in `public.admin_users` is an administrator.
- Do not authorize from e-mail alone, client state, `user_metadata`, or `TO authenticated` alone.
- RLS is enabled on every exposed application table.
- `bbmodels` is a private Storage bucket with no anonymous policy.
- Public portfolio queries explicitly select public columns and never `select('*')`.
- No service-role/secret key appears in browser code or a `NEXT_PUBLIC_*` variable.
- Use current publishable Supabase keys (`sb_publishable_*`), not a new legacy anon-key dependency.
- Because Supabase 2026 projects no longer auto-expose new public tables to the Data API, explicit `GRANT` statements are part of the schema migration.
- Admin uploads persist independently of Vercel deployments.
- Current public visual design and routes remain intact.
- Existing `data/creations.json` is retained as migration backup until production verification, then removed from runtime use.
- Supabase dependencies must be installed with exact versions and the lockfile committed.
- Existing limits remain 10 MB per image; `.bbmodel` initial limit is 50 MB unless the actual project Storage limit is lower.
- No public sign-up flow.
- One active `.bbmodel` attachment per creation in V1.
- Featured order remains manually controlled.

## Review Focus

1. **A normal authenticated but non-admin user** must still get denied on draft reads, CRUD, render writes, and every `bbmodels` operation.
2. **A forged/expired browser session** must not unlock `/admin`; route protection revalidates identity server-side with `getClaims()` and confirms `admin_users`.
3. **A `.bbmodel` with a misleading MIME type or uppercase extension** is accepted only when the filename safely ends in `.bbmodel` case-insensitively and size is within limit.
4. **Partial remote failures** (Storage succeeds, DB fails; DB delete succeeds, Storage cleanup fails) must produce deterministic cleanup/error reporting instead of false success.
5. **A public serialization regression** must be caught if `bbmodel_path`, `bbmodel_filename`, or `bbmodel_size` ever appear in public `Creation` mapping/output.

---

## File Structure

### New files

```text
supabase/
  migrations/
    <generated>-portfolio_online_admin.sql

lib/
  supabase/
    client.ts
    server.ts
    proxy.ts
  auth/
    admin.ts
  creations/
    public.ts
    mapper.ts
  admin/
    creations.ts
    files.ts
    actions.ts

app/
  admin/
    layout.tsx
    login/
      page.tsx
    new/
      page.tsx
    [id]/
      edit/
        page.tsx
  auth/
    signout/
      route.ts

components/
  admin/
    LoginForm.tsx
    BbmodelField.tsx
    AdminCreationList.tsx

proxy.ts

__tests__/
  auth/
    admin.test.ts
  creations/
    mapper.test.ts
    public.test.ts
  admin/
    files.test.ts
    actions.test.ts
  integration/
    rls.test.ts
  e2e/
    online-admin.spec.ts
```

### Modified files

```text
package.json
package-lock.json
.env.example
lib/creations/types.ts
lib/creations/read.ts
app/page.tsx
app/creations/page.tsx
app/creations/[slug]/page.tsx
app/admin/page.tsx
components/admin/AdminDashboard.tsx
components/admin/CreationEditor.tsx
components/admin/ImageField.tsx
app/globals.css
README.md
playwright.config.ts
```

### Retired after cutover verification

```text
app/api/admin/creations/route.ts
lib/admin/storage.ts
```

`lib/admin/payload.ts`, `lib/admin/guards.ts`, and reusable filename/slug validators may be kept only if reused by the new server-side admin implementation.

---

### Task 1: Provision Supabase safely and pin client dependencies

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `.env.example`
- Create: `lib/supabase/env.ts`
- Test: `__tests__/supabase/env.test.ts`

**Interfaces:**
- Produces: `getSupabasePublicEnv(): { url: string; publishableKey: string }`
- Operational output: a dedicated Supabase project ID, project URL, and publishable key for this portfolio.

- [ ] **Step 1: Before creating anything, ask the user which Supabase organization should own the portfolio project.**

Use `Supabase.list_organizations`, present the organization choices, then call `Supabase.get_cost(type="project", organization_id=...)`. Repeat the returned amount/recurrence to the user and obtain explicit confirmation before `confirm_cost` / `create_project`.

Do **not** reuse the existing unrelated `Agent IA 1` project.

- [ ] **Step 2: Create the portfolio project in the user-approved organization.**

Use:
- project name: `bbportfolio`
- region: `eu-west-3` unless the user explicitly selects another region
- the cost confirmation ID returned by Supabase.

Wait until `Supabase.get_project` reports an active/healthy project.

- [ ] **Step 3: Inspect current Supabase changelog/docs again immediately before implementation.**

Confirm:
- current Next.js SSR package guidance;
- private Storage behavior;
- current publishable-key guidance;
- Data API grant behavior.

The 2026 Data API change requires explicit grants for newly created tables.

- [ ] **Step 4: Write the failing environment validation test.**

```ts
import { afterEach, describe, expect, it } from 'vitest';
import { getSupabasePublicEnv } from '@/lib/supabase/env';

const original = { ...process.env };

afterEach(() => {
  process.env = { ...original };
});

describe('getSupabasePublicEnv', () => {
  it('throws when URL is missing', () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_test';
    expect(() => getSupabasePublicEnv()).toThrow(/NEXT_PUBLIC_SUPABASE_URL/);
  });

  it('returns validated public config', () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_test';
    expect(getSupabasePublicEnv()).toEqual({
      url: 'https://example.supabase.co',
      publishableKey: 'sb_publishable_test',
    });
  });
});
```

- [ ] **Step 5: Run the test and verify it fails.**

Run:

```bash
npm run test:run -- __tests__/supabase/env.test.ts
```

Expected: FAIL because `lib/supabase/env.ts` does not exist.

- [ ] **Step 6: Install exact current Supabase package versions.**

```bash
SUPABASE_JS_VERSION="$(npm view @supabase/supabase-js version)"
SUPABASE_SSR_VERSION="$(npm view @supabase/ssr version)"
npm install --save-exact "@supabase/supabase-js@$SUPABASE_JS_VERSION" "@supabase/ssr@$SUPABASE_SSR_VERSION"
```

Verify `package.json` has non-range versions for both packages and commit `package-lock.json`.

- [ ] **Step 7: Implement environment validation.**

```ts
export function getSupabasePublicEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url) throw new Error('NEXT_PUBLIC_SUPABASE_URL is required.');
  if (!publishableKey) throw new Error('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY is required.');

  return { url, publishableKey };
}
```

- [ ] **Step 8: Add the non-secret environment template.**

```dotenv
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
```

- [ ] **Step 9: Run the test and dependency checks.**

```bash
npm run test:run -- __tests__/supabase/env.test.ts
npm ls @supabase/supabase-js @supabase/ssr
```

Expected: PASS; both dependencies resolve to exact installed versions.

- [ ] **Step 10: Commit.**

```bash
git add package.json package-lock.json .env.example lib/supabase/env.ts __tests__/supabase/env.test.ts
git commit -m "chore: add pinned Supabase client dependencies"
```

---

### Task 2: Create Postgres schema, Data API grants, RLS, and Storage policies

**Files:**
- Create via Supabase CLI: `supabase/migrations/<timestamp>_portfolio_online_admin.sql`
- Test: `__tests__/integration/rls.test.ts`

**Interfaces:**
- Produces tables: `public.admin_users`, `public.creations`, `public.creation_images`
- Produces buckets: `portfolio-renders` (public), `bbmodels` (private)
- Produces authorization contract: only `admin_users.user_id = auth.uid()` may mutate/admin-read private content.

- [ ] **Step 1: Create the migration file using the CLI, never by inventing the migration timestamp.**

```bash
npx supabase migration new portfolio_online_admin
```

- [ ] **Step 2: Put this schema and grants into the generated migration.**

```sql
create extension if not exists pgcrypto;

create table public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.creations (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique
    check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  name text not null check (char_length(trim(name)) > 0),
  category text not null check (char_length(trim(category)) > 0),
  tags text[] not null default '{}',
  description text not null default '',
  animations text[] not null default '{}',
  featured boolean not null default false,
  featured_order integer,
  published boolean not null default true,
  created_at date not null default current_date,
  updated_at timestamptz not null default now(),
  software text,
  model_type text,
  version text,
  notes text,
  cover_image_path text,
  bbmodel_path text,
  bbmodel_filename text,
  bbmodel_size bigint,
  check (featured_order is null or featured_order >= 0),
  check (bbmodel_size is null or bbmodel_size >= 0)
);

create table public.creation_images (
  id uuid primary key default gen_random_uuid(),
  creation_id uuid not null references public.creations(id) on delete cascade,
  storage_path text not null,
  alt_text text not null default '',
  sort_order integer not null default 0 check (sort_order >= 0),
  created_at timestamptz not null default now()
);

create index creation_images_creation_sort_idx
  on public.creation_images (creation_id, sort_order, created_at);

alter table public.admin_users enable row level security;
alter table public.creations enable row level security;
alter table public.creation_images enable row level security;

revoke all on public.admin_users from anon, authenticated;
revoke all on public.creations from anon, authenticated;
revoke all on public.creation_images from anon, authenticated;

grant select on public.admin_users to authenticated;
grant select on public.creations to anon, authenticated;
grant insert, update, delete on public.creations to authenticated;
grant select on public.creation_images to anon, authenticated;
grant insert, update, delete on public.creation_images to authenticated;

create policy "admin can identify self"
on public.admin_users
for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "published creations are public"
on public.creations
for select
to anon, authenticated
using (published = true);

create policy "admin can read all creations"
on public.creations
for select
to authenticated
using (
  exists (
    select 1 from public.admin_users au
    where au.user_id = (select auth.uid())
  )
);

create policy "admin can insert creations"
on public.creations
for insert
to authenticated
with check (
  exists (
    select 1 from public.admin_users au
    where au.user_id = (select auth.uid())
  )
);

create policy "admin can update creations"
on public.creations
for update
to authenticated
using (
  exists (
    select 1 from public.admin_users au
    where au.user_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1 from public.admin_users au
    where au.user_id = (select auth.uid())
  )
);

create policy "admin can delete creations"
on public.creations
for delete
to authenticated
using (
  exists (
    select 1 from public.admin_users au
    where au.user_id = (select auth.uid())
  )
);

create policy "published creation images are public"
on public.creation_images
for select
to anon, authenticated
using (
  exists (
    select 1
    from public.creations c
    where c.id = creation_id and c.published = true
  )
);

create policy "admin can read all creation images"
on public.creation_images
for select
to authenticated
using (
  exists (
    select 1 from public.admin_users au
    where au.user_id = (select auth.uid())
  )
);

create policy "admin can insert creation images"
on public.creation_images
for insert
to authenticated
with check (
  exists (
    select 1 from public.admin_users au
    where au.user_id = (select auth.uid())
  )
);

create policy "admin can update creation images"
on public.creation_images
for update
to authenticated
using (
  exists (
    select 1 from public.admin_users au
    where au.user_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1 from public.admin_users au
    where au.user_id = (select auth.uid())
  )
);

create policy "admin can delete creation images"
on public.creation_images
for delete
to authenticated
using (
  exists (
    select 1 from public.admin_users au
    where au.user_id = (select auth.uid())
  )
);

insert into storage.buckets (id, name, public, file_size_limit)
values
  ('portfolio-renders', 'portfolio-renders', true, 10485760),
  ('bbmodels', 'bbmodels', false, 52428800)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit;

create policy "admin can read render objects"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'portfolio-renders'
  and exists (
    select 1 from public.admin_users au
    where au.user_id = (select auth.uid())
  )
);

create policy "admin can insert render objects"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'portfolio-renders'
  and exists (
    select 1 from public.admin_users au
    where au.user_id = (select auth.uid())
  )
);

create policy "admin can update render objects"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'portfolio-renders'
  and exists (
    select 1 from public.admin_users au
    where au.user_id = (select auth.uid())
  )
)
with check (
  bucket_id = 'portfolio-renders'
  and exists (
    select 1 from public.admin_users au
    where au.user_id = (select auth.uid())
  )
);

create policy "admin can delete render objects"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'portfolio-renders'
  and exists (
    select 1 from public.admin_users au
    where au.user_id = (select auth.uid())
  )
);

create policy "admin can read bbmodels"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'bbmodels'
  and exists (
    select 1 from public.admin_users au
    where au.user_id = (select auth.uid())
  )
);

create policy "admin can insert bbmodels"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'bbmodels'
  and exists (
    select 1 from public.admin_users au
    where au.user_id = (select auth.uid())
  )
);

create policy "admin can update bbmodels"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'bbmodels'
  and exists (
    select 1 from public.admin_users au
    where au.user_id = (select auth.uid())
  )
)
with check (
  bucket_id = 'bbmodels'
  and exists (
    select 1 from public.admin_users au
    where au.user_id = (select auth.uid())
  )
);

create policy "admin can delete bbmodels"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'bbmodels'
  and exists (
    select 1 from public.admin_users au
    where au.user_id = (select auth.uid())
  )
);
```

- [ ] **Step 3: Apply the migration to the dedicated project.**

Use Supabase migration tooling / connector on the portfolio project, not the unrelated project.

- [ ] **Step 4: Create exactly one admin Auth account manually through Supabase Auth.**

Ask the user for the e-mail address they want to use. Create the account in the Supabase dashboard with e-mail + password and **disable public sign-ups** in Auth settings.

Then query the server-side Auth table for the exact UUID:

```sql
select id, email
from auth.users
where lower(email) = lower('<the email supplied in this execution step>');
```

Insert the returned UUID:

```sql
insert into public.admin_users (user_id)
values ('<the UUID returned by the preceding query>');
```

The executor must substitute only values returned in the same execution step; do not guess either value.

- [ ] **Step 5: Verify bucket privacy and admin allowlist directly with SQL.**

```sql
select id, public, file_size_limit
from storage.buckets
where id in ('portfolio-renders', 'bbmodels')
order by id;

select user_id from public.admin_users;
```

Expected:
- `portfolio-renders.public = true`
- `bbmodels.public = false`
- exactly the intended admin UUID is present.

- [ ] **Step 6: Write RLS integration tests before app CRUD implementation.**

The test harness should create:
- an anonymous Supabase client;
- an authenticated admin client;
- an authenticated non-admin test client if test Auth provisioning is available.

Assertions:

```ts
expect((await anon.from('creations').select('slug').eq('published', false)).data).toEqual([]);
expect((await anon.storage.from('bbmodels').list()).error).toBeTruthy();
expect((await nonAdmin.from('creations').insert(validCreation)).error).toBeTruthy();
expect((await admin.from('creations').insert(validCreation)).error).toBeNull();
```

If automated test-user provisioning is not available through the chosen test environment, execute equivalent REST/Auth checks in a local Supabase stack and document the commands in `README.md`.

- [ ] **Step 7: Run Supabase security and performance advisors.**

Use:
- `Supabase.get_advisors(type="security")`
- `Supabase.get_advisors(type="performance")`

Fix any relevant RLS/security issue before proceeding.

- [ ] **Step 8: Commit.**

```bash
git add supabase/migrations __tests__/integration/rls.test.ts
git commit -m "feat: secure portfolio schema and storage"
```

---

### Task 3: Add SSR Supabase clients, session refresh, and admin authorization helper

**Files:**
- Create: `lib/supabase/client.ts`
- Create: `lib/supabase/server.ts`
- Create: `lib/supabase/proxy.ts`
- Create: `lib/auth/admin.ts`
- Create: `proxy.ts`
- Test: `__tests__/auth/admin.test.ts`

**Interfaces:**
- Produces: `createBrowserSupabaseClient()`
- Produces: `createServerSupabaseClient()`
- Produces: `requireAdmin(): Promise<{ userId: string }>`
- Produces: `isAdmin(): Promise<boolean>`

- [ ] **Step 1: Write authorization tests against an injectable client.**

```ts
import { describe, expect, it, vi } from 'vitest';
import { checkAdminWithClient } from '@/lib/auth/admin';

describe('checkAdminWithClient', () => {
  it('rejects when claims are missing', async () => {
    const client = {
      auth: { getClaims: vi.fn().mockResolvedValue({ data: { claims: null }, error: null }) },
    };
    await expect(checkAdminWithClient(client as never)).resolves.toEqual({ ok: false });
  });

  it('requires allowlist membership after valid claims', async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
    const client = {
      auth: { getClaims: vi.fn().mockResolvedValue({ data: { claims: { sub: 'u1' } }, error: null }) },
      from: vi.fn(() => ({
        select: () => ({ eq: () => ({ maybeSingle }) }),
      })),
    };
    await expect(checkAdminWithClient(client as never)).resolves.toEqual({ ok: false });
  });
});
```

- [ ] **Step 2: Run the tests and verify failure.**

```bash
npm run test:run -- __tests__/auth/admin.test.ts
```

- [ ] **Step 3: Implement browser/server clients using the current `@supabase/ssr` pattern.**

`lib/supabase/client.ts`:

```ts
import { createBrowserClient } from '@supabase/ssr';
import { getSupabasePublicEnv } from './env';

export function createBrowserSupabaseClient() {
  const { url, publishableKey } = getSupabasePublicEnv();
  return createBrowserClient(url, publishableKey);
}
```

`lib/supabase/server.ts` uses `cookies()` and request-scoped `createServerClient`, never a module-global client.

- [ ] **Step 4: Implement `checkAdminWithClient`, `isAdmin`, and `requireAdmin`.**

Authorization sequence:
1. `auth.getClaims()`;
2. require `claims.sub`;
3. query `admin_users` for `user_id = claims.sub`;
4. return admin only when the row exists.

`requireAdmin()` redirects unauthenticated/unauthorized browser page requests to `/admin/login` or throws a controlled `Unauthorized` error for server actions.

- [ ] **Step 5: Add `proxy.ts` using the current Supabase SSR token-refresh example.**

Matcher excludes:
- `_next/static`
- `_next/image`
- favicon
- static image extensions.

Do not protect the whole public site. The proxy refreshes sessions; `/admin` pages themselves call `requireAdmin()`.

- [ ] **Step 6: Run tests.**

```bash
npm run test:run -- __tests__/auth/admin.test.ts __tests__/supabase/env.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit.**

```bash
git add lib/supabase lib/auth proxy.ts __tests__/auth
git commit -m "feat: add Supabase SSR admin authentication"
```

---

### Task 4: Define database/public models and guarantee private fields cannot leak

**Files:**
- Modify: `lib/creations/types.ts`
- Create: `lib/creations/mapper.ts`
- Test: `__tests__/creations/mapper.test.ts`

**Interfaces:**
- Produces: `Creation` public UI type, unchanged where practical.
- Produces: `AdminCreation` with private attachment metadata.
- Produces: `mapPublicCreation(row): Creation`
- Produces: `mapAdminCreation(row): AdminCreation`

- [ ] **Step 1: Write a regression test that fails if private fields serialize publicly.**

```ts
import { describe, expect, it } from 'vitest';
import { mapPublicCreation } from '@/lib/creations/mapper';

it('never maps bbmodel metadata into the public creation object', () => {
  const result = mapPublicCreation({
    id: '7c00c69f-5b12-4eed-b981-e969221a1fd2',
    slug: 'vorakh',
    name: 'Vorakh',
    category: 'Boss',
    tags: ['Ice'],
    description: 'Boss',
    animations: ['Idle'],
    featured: true,
    featured_order: 1,
    published: true,
    created_at: '2026-09-20',
    software: 'Blockbench',
    model_type: 'Entity',
    version: null,
    notes: null,
    cover_image_path: null,
    bbmodel_path: 'secret/vorakh.bbmodel',
    bbmodel_filename: 'vorakh.bbmodel',
    bbmodel_size: 123,
    creation_images: [],
  } as never);

  expect(JSON.stringify(result)).not.toMatch(/bbmodel/i);
});
```

- [ ] **Step 2: Run and verify failure.**

```bash
npm run test:run -- __tests__/creations/mapper.test.ts
```

- [ ] **Step 3: Extend types.**

Keep public:

```ts
export type Creation = {
  id: string;
  slug: string;
  name: string;
  category: string;
  tags: string[];
  description: string;
  coverImage: string;
  images: string[];
  animations: string[];
  featured: boolean;
  featuredOrder?: number;
  published: boolean;
  createdAt: string;
  software?: string;
  modelType?: string;
  version?: string;
  notes?: string;
};
```

Add admin-only:

```ts
export type AdminCreation = Creation & {
  bbmodel?: {
    filename: string;
    size: number;
  };
};
```

Do **not** put `bbmodelPath` on `Creation`.

- [ ] **Step 4: Implement mapping helpers.**

Use local fallback:

```ts
const PLACEHOLDER = '/models/_placeholder/creation-placeholder.svg';
```

Map public render paths to the public Storage URL; sort `creation_images` by `sort_order`; never copy private columns.

- [ ] **Step 5: Run mapper tests plus current creation tests.**

```bash
npm run test:run -- __tests__/creations
```

Expected: PASS.

- [ ] **Step 6: Commit.**

```bash
git add lib/creations/types.ts lib/creations/mapper.ts __tests__/creations/mapper.test.ts
git commit -m "refactor: separate public and admin creation data"
```

---

### Task 5: Replace filesystem public reads with Supabase queries

**Files:**
- Create: `lib/creations/public.ts`
- Modify: `lib/creations/read.ts`
- Modify: `app/page.tsx`
- Modify: `app/creations/page.tsx`
- Modify: `app/creations/[slug]/page.tsx`
- Test: `__tests__/creations/public.test.ts`

**Interfaces:**
- Produces: `getPublishedCreations()`
- Produces: `getFeaturedCreations()`
- Produces: `getCreationBySlug(slug)`
- Produces: `getCategories()`

- [ ] **Step 1: Write query behavior tests with a mocked Supabase client.**

Pin:
- `.eq('published', true)`;
- public column list does not contain `bbmodel_`;
- Featured sorts by order then date/name;
- missing slug returns `undefined`.

- [ ] **Step 2: Run tests and verify failure.**

```bash
npm run test:run -- __tests__/creations/public.test.ts
```

- [ ] **Step 3: Implement a single explicit public column selection constant.**

```ts
export const PUBLIC_CREATION_SELECT = `
  id,
  slug,
  name,
  category,
  tags,
  description,
  animations,
  featured,
  featured_order,
  published,
  created_at,
  software,
  model_type,
  version,
  notes,
  cover_image_path,
  creation_images (
    id,
    storage_path,
    alt_text,
    sort_order,
    created_at
  )
`;
```

Add a regression assertion:

```ts
expect(PUBLIC_CREATION_SELECT).not.toMatch(/bbmodel_/);
```

- [ ] **Step 4: Implement public query functions using a server Supabase client.**

No filesystem reads. No `select('*')`.

- [ ] **Step 5: Keep the existing public page components and switch imports only.**

The rendered page structure should remain visually unchanged.

- [ ] **Step 6: Run unit/component tests.**

```bash
npm run test:run -- __tests__/creations __tests__/components
```

- [ ] **Step 7: Commit.**

```bash
git add lib/creations app/page.tsx app/creations __tests__/creations
git commit -m "feat: read public portfolio from Supabase"
```

---

### Task 6: Add robust image and `.bbmodel` validation/storage helpers

**Files:**
- Create: `lib/admin/files.ts`
- Reuse/Modify: `lib/utils/filenames.ts`
- Test: `__tests__/admin/files.test.ts`

**Interfaces:**
- Produces: `validateImageFile(file: File): void`
- Produces: `validateBbmodelFile(file: File): void`
- Produces: `safeBbmodelFilename(name: string): string`
- Produces: `uploadRender(...)`
- Produces: `uploadBbmodel(...)`
- Produces: `removeObjects(...)`

- [ ] **Step 1: Write file validation tests.**

```ts
import { describe, expect, it } from 'vitest';
import { safeBbmodelFilename, validateBbmodelFile } from '@/lib/admin/files';

it('accepts uppercase bbmodel extension', () => {
  const file = new File(['{}'], 'Vorakh.BBMODEL', { type: 'application/octet-stream' });
  expect(() => validateBbmodelFile(file)).not.toThrow();
});

it('rejects misleading extension', () => {
  const file = new File(['x'], 'vorakh.bbmodel.exe', { type: 'application/octet-stream' });
  expect(() => validateBbmodelFile(file)).toThrow(/bbmodel/i);
});

it('sanitizes source filename without path traversal', () => {
  expect(safeBbmodelFilename('../My Boss.bbmodel')).toBe('My-Boss.bbmodel');
});

it('rejects a bbmodel larger than 50 MB', () => {
  const file = new File([new Uint8Array(50 * 1024 * 1024 + 1)], 'huge.bbmodel');
  expect(() => validateBbmodelFile(file)).toThrow(/50 MB/i);
});
```

- [ ] **Step 2: Run and verify failure.**

```bash
npm run test:run -- __tests__/admin/files.test.ts
```

- [ ] **Step 3: Implement validators.**

Rules:
- image MIME allowlist: PNG/JPEG/WebP/AVIF;
- image max: 10 MiB;
- `.bbmodel`: extension check, not MIME-only;
- `.bbmodel` max: 50 MiB;
- sanitized filename removes path segments and unsafe characters.

- [ ] **Step 4: Implement Storage helpers using the authenticated request client.**

Paths:
- cover: `<creation-id>/cover-<uuid>.<ext>`
- gallery: `<creation-id>/gallery/<uuid>.<ext>`
- `.bbmodel`: `<creation-id>/<safe-filename>`

Never call `getPublicUrl` on `bbmodels`.

- [ ] **Step 5: Add failure cleanup tests.**

Mock Storage so upload succeeds then a later step fails; verify the cleanup helper receives the exact uploaded object path.

- [ ] **Step 6: Run tests.**

```bash
npm run test:run -- __tests__/admin/files.test.ts __tests__/admin/guards.test.ts
```

- [ ] **Step 7: Commit.**

```bash
git add lib/admin/files.ts lib/utils/filenames.ts __tests__/admin/files.test.ts
git commit -m "feat: validate and store portfolio uploads safely"
```

---

### Task 7: Implement authenticated admin CRUD with compensating cleanup

**Files:**
- Create: `lib/admin/creations.ts`
- Create: `lib/admin/actions.ts`
- Test: `__tests__/admin/actions.test.ts`

**Interfaces:**
- Produces server actions:
  - `createCreationAction(formData: FormData)`
  - `updateCreationAction(id: string, formData: FormData)`
  - `deleteCreationAction(id: string)`
  - `removeBbmodelAction(id: string)`
- Produces admin query:
  - `getAllCreationsForAdmin()`
  - `getAdminCreation(id)`

- [ ] **Step 1: Write server-action tests around injected dependencies.**

Test:
- `requireAdmin` runs before Storage/DB work;
- duplicate slug returns a user-readable conflict;
- successful `.bbmodel` upload followed by DB failure removes the uploaded object;
- failed delete cleanup returns `partialCleanup: true`;
- updating Featured with unchecked toggle clears `featured_order`.

- [ ] **Step 2: Run tests and verify failure.**

```bash
npm run test:run -- __tests__/admin/actions.test.ts
```

- [ ] **Step 3: Implement normalized form parsing.**

Normalize:
- trimmed name/category;
- generated or validated slug;
- comma-separated tags/animations to unique arrays;
- optional strings to `null`;
- Featured off => `featured_order = null`.

- [ ] **Step 4: Implement create transaction sequence.**

Sequence:
1. `requireAdmin`;
2. validate form/files;
3. insert base `creations` row to obtain UUID;
4. upload cover/gallery/`.bbmodel`;
5. insert `creation_images`;
6. update creation paths/source metadata;
7. `revalidatePath('/')`, `/creations`, and the creation route.

If steps 4–6 fail:
- remove uploaded objects;
- delete partially inserted DB row where safe;
- return explicit error.

- [ ] **Step 5: Implement update sequence.**

Never delete an old source/render until the replacement upload succeeds and DB metadata is updated. Then clean the superseded object.

- [ ] **Step 6: Implement delete sequence.**

Capture object paths before deleting the DB row. Delete Storage objects and DB data with explicit reporting if object cleanup fails.

- [ ] **Step 7: Run action tests.**

```bash
npm run test:run -- __tests__/admin/actions.test.ts
```

- [ ] **Step 8: Commit.**

```bash
git add lib/admin/creations.ts lib/admin/actions.ts __tests__/admin/actions.test.ts
git commit -m "feat: add authenticated online portfolio CRUD"
```

---

### Task 8: Build online login and protected admin routes

**Files:**
- Create: `app/admin/layout.tsx`
- Create: `app/admin/login/page.tsx`
- Create: `components/admin/LoginForm.tsx`
- Create: `app/auth/signout/route.ts`
- Modify: `app/admin/page.tsx`
- Test: `__tests__/components/LoginForm.test.tsx`

**Interfaces:**
- `/admin/login`: sign-in form
- `/admin`: protected dashboard
- `/auth/signout`: signs out and redirects to `/admin/login`

- [ ] **Step 1: Write login UI tests.**

Test:
- e-mail/password fields exist;
- invalid credentials surface inline error;
- submit disables while pending;
- no sign-up link is rendered.

- [ ] **Step 2: Run and verify failure.**

```bash
npm run test:run -- __tests__/components/LoginForm.test.tsx
```

- [ ] **Step 3: Implement `LoginForm` using `signInWithPassword`.**

On success:
- call `router.replace('/admin')`;
- call `router.refresh()`.

No sign-up function exists in the component.

- [ ] **Step 4: Implement `/admin/login`.**

If `isAdmin()` is already true, redirect to `/admin`.

Set:

```ts
export const metadata = {
  title: 'Admin Login',
  robots: { index: false, follow: false },
};
```

- [ ] **Step 5: Replace the development-only guard in `app/admin/page.tsx`.**

Remove:

```ts
if (process.env.NODE_ENV !== 'development') notFound();
```

Use:

```ts
await requireAdmin();
```

Load `getAllCreationsForAdmin()` instead of filesystem JSON.

- [ ] **Step 6: Add protected admin layout and sign-out route.**

The layout can render an admin shell; every protected page still calls authorization server-side rather than relying only on client navigation.

- [ ] **Step 7: Run auth/UI tests.**

```bash
npm run test:run -- __tests__/auth __tests__/components/LoginForm.test.tsx
```

- [ ] **Step 8: Commit.**

```bash
git add app/admin app/auth components/admin/LoginForm.tsx __tests__/components/LoginForm.test.tsx
git commit -m "feat: add protected online admin login"
```

---

### Task 9: Upgrade the admin editor for remote images and private `.bbmodel`

**Files:**
- Modify: `components/admin/AdminDashboard.tsx`
- Modify: `components/admin/CreationEditor.tsx`
- Modify: `components/admin/ImageField.tsx`
- Create: `components/admin/BbmodelField.tsx`
- Create: `components/admin/AdminCreationList.tsx`
- Create: `app/admin/new/page.tsx`
- Create: `app/admin/[id]/edit/page.tsx`
- Modify: `app/globals.css`
- Test: `__tests__/components/CreationEditor.test.tsx`
- Test: `__tests__/components/BbmodelField.test.tsx`

**Interfaces:**
- New/edit pages operate through server actions.
- `BbmodelField` accepts a new file and shows existing private filename/size only to admin.

- [ ] **Step 1: Write editor tests before changing UI.**

Pin:
- `.bbmodel` input uses `accept=".bbmodel"`;
- current source filename/size is visible when editing;
- no source URL is rendered;
- Published and Featured controls keep existing behavior;
- Featured order hides/clears when Featured is off.

- [ ] **Step 2: Run and verify failure.**

```bash
npm run test:run -- __tests__/components/CreationEditor.test.tsx __tests__/components/BbmodelField.test.tsx
```

- [ ] **Step 3: Implement `BbmodelField`.**

Display:

```text
Blockbench source
Vorakh.bbmodel · 3.8 MB · Private
[Download] [Replace] [Remove]
```

Download must call an authenticated admin-only route/action that returns the private object, not a public/signed URL embedded in page HTML.

- [ ] **Step 4: Refactor `CreationEditor` to submit through server actions.**

Keep the current field set and visual style. Add:
- cover selection;
- gallery upload;
- `.bbmodel` source;
- existing source metadata.

- [ ] **Step 5: Split navigation into dedicated routes.**

`+ New creation` links to `/admin/new`.

Editing links to `/admin/<uuid>/edit`.

This makes refresh/back navigation reliable and avoids keeping the whole editor state only in one client component.

- [ ] **Step 6: Update dashboard labels.**

Replace `LOCAL ADMIN` with `PORTFOLIO ADMIN`.

Show:
- Published/Draft;
- Featured;
- source attached lock indicator.

- [ ] **Step 7: Run component tests.**

```bash
npm run test:run -- __tests__/components
```

- [ ] **Step 8: Commit.**

```bash
git add app/admin components/admin app/globals.css __tests__/components
git commit -m "feat: manage private Blockbench sources online"
```

---

### Task 10: Migrate the existing JSON data and preserve the public fallback artwork

**Files:**
- Create: `scripts/migrate-creations-to-supabase.mjs`
- Keep temporarily: `data/creations.json`
- Test: `__tests__/creations/migration.test.ts`

**Interfaces:**
- Migration is idempotent by `slug`.
- Existing rows: Vorakh, Sakura Bow, Alchemist NPC.
- Placeholder remains `/models/_placeholder/creation-placeholder.svg` when no Storage render exists.

- [ ] **Step 1: Write migration mapping tests.**

Verify old JSON:
- maps camelCase to DB snake_case;
- does not treat placeholder SVG as a Storage path;
- keeps `featuredOrder`;
- generates no `.bbmodel` metadata.

- [ ] **Step 2: Run and verify failure.**

```bash
npm run test:run -- __tests__/creations/migration.test.ts
```

- [ ] **Step 3: Implement migration script with a server-only key supplied interactively/local environment.**

The migration script is a one-off maintenance tool, never imported by the app.

It:
1. reads `data/creations.json`;
2. upserts by slug;
3. writes `cover_image_path = null` for the local placeholder;
4. imports metadata;
5. does not upload `.bbmodel`;
6. exits non-zero on any failed record.

Do not commit a secret key.

- [ ] **Step 4: Run dry validation locally.**

```bash
node scripts/migrate-creations-to-supabase.mjs --check
```

Expected: reports exactly 3 valid records and no writes.

- [ ] **Step 5: Run actual migration once against the portfolio project.**

Verify:

```sql
select slug, featured, featured_order, published
from public.creations
order by featured_order nulls last, slug;
```

Expected slugs:
- `vorakh`
- `sakura-bow`
- `alchemist-npc`

- [ ] **Step 6: Verify the deployed/public code reads the migrated records.**

No runtime filesystem dependency should be required for the three sample entries.

- [ ] **Step 7: Commit script/tests, retaining JSON only as migration backup.**

```bash
git add scripts/migrate-creations-to-supabase.mjs __tests__/creations/migration.test.ts data/creations.json
git commit -m "chore: migrate portfolio data to Supabase"
```

---

### Task 11: Remove local write API and filesystem mutation code after cutover

**Files:**
- Delete: `app/api/admin/creations/route.ts`
- Delete: `lib/admin/storage.ts`
- Modify/Delete tests: `__tests__/admin/storage.test.ts`
- Modify: `README.md`

**Interfaces:**
- The only creation mutations after this task are authenticated Supabase-backed server actions.
- `data/creations.json` is no longer a runtime data source.

- [ ] **Step 1: Add a source regression test.**

The test must fail if production code imports:
- `lib/admin/storage`;
- `node:fs/promises` for creation CRUD;
- `data/creations.json` as runtime portfolio data.

- [ ] **Step 2: Run and see the expected failure before deletion.**

```bash
npm run test:run -- __tests__/admin/no-local-storage.test.ts
```

- [ ] **Step 3: Delete the old API/filesystem write implementation.**

Remove old development-only API route and filesystem mutation layer.

Keep reusable pure validators only.

- [ ] **Step 4: Update README workflow.**

Replace:

```text
run locally -> /admin -> commit -> push
```

with:

```text
visit production /admin -> sign in -> upload/edit -> changes are stored immediately in Supabase
```

Document that `.bbmodel` files are private.

- [ ] **Step 5: Run tests.**

```bash
npm run test:run
```

Expected: PASS.

- [ ] **Step 6: Commit.**

```bash
git add -A
git commit -m "refactor: retire local filesystem admin"
```

---

### Task 12: Configure Vercel, run E2E/security verification, and deploy

**Files:**
- Modify: `playwright.config.ts`
- Create/Modify: `__tests__/e2e/online-admin.spec.ts`
- Modify: `README.md`

**Interfaces:**
- Production environment has the two public Supabase variables.
- Production `/admin` is usable only by the allowlisted account.

- [ ] **Step 1: Add Vercel environment variables in the project dashboard.**

Set for Production and Preview as appropriate:

```text
NEXT_PUBLIC_SUPABASE_URL=<value returned by Supabase.get_project_url>
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<active value returned by Supabase.get_publishable_keys>
```

These are publishable values, not secrets.

- [ ] **Step 2: Write E2E flow.**

Use environment-provided test admin credentials:

```ts
test('admin can create a private-source portfolio entry', async ({ page }) => {
  await page.goto('/admin');
  await expect(page).toHaveURL(/\/admin\/login/);

  await page.getByLabel('Email').fill(process.env.E2E_ADMIN_EMAIL!);
  await page.getByLabel('Password').fill(process.env.E2E_ADMIN_PASSWORD!);
  await page.getByRole('button', { name: /sign in/i }).click();

  await page.getByRole('link', { name: /new creation/i }).click();
  await page.getByLabel('Name').fill('E2E Private Source');
  await page.getByLabel('Category').fill('Items');
  await page.getByLabel(/blockbench/i).setInputFiles({
    name: 'e2e-private.bbmodel',
    mimeType: 'application/octet-stream',
    buffer: Buffer.from('{}'),
  });
  await page.getByRole('button', { name: /save creation/i }).click();

  await page.goto('/creations/e2e-private-source');
  await expect(page.getByText('E2E Private Source')).toBeVisible();
  await expect(page.getByText(/bbmodel/i)).toHaveCount(0);
});
```

Add cleanup through the admin UI or an authenticated test helper so repeated runs are idempotent.

- [ ] **Step 3: Run the complete local verification suite.**

```bash
npm run test:run
npm run lint
npm run build
npm run test:e2e
```

All must pass before deployment.

- [ ] **Step 4: Run Supabase advisors again.**

Security and performance advisor results must have no unresolved issue introduced by this migration.

- [ ] **Step 5: Deploy through the existing GitHub → Vercel integration.**

Push the implementation branch / merge as agreed, then wait for Vercel build status `success`.

- [ ] **Step 6: Verify production manually and via public fetch.**

Check:
- `/`
- `/creations`
- one creation detail
- `/admin` redirects to login while signed out
- admin login succeeds
- new creation persists after a Vercel redeploy
- `.bbmodel` download works only inside admin
- direct unauthenticated `bbmodels` access is denied
- no `.bbmodel` path or filename appears in public HTML/source/network payload.

- [ ] **Step 7: Remove runtime dependence on the JSON backup only after production verification.**

Keep the JSON file in Git history; either delete it from the active branch or move it under `docs/migration-backups/`. It must not be read at runtime.

- [ ] **Step 8: Final commit if verification changes were needed.**

```bash
git add -A
git commit -m "test: verify online admin migration"
```

---

## Self-Review

### Spec coverage

- Online e-mail/password admin login: Tasks 3, 8.
- Single-admin allowlist: Tasks 2, 3.
- Database migration: Tasks 2, 10.
- Public render Storage: Tasks 2, 6, 7.
- Private `.bbmodel` Storage: Tasks 2, 6, 7, 9.
- Public/private query boundary: Tasks 4, 5.
- Featured/manual ordering: Tasks 4, 5, 7, 9.
- Create/edit/delete online: Tasks 7, 8, 9.
- Migration from JSON: Task 10.
- Retirement of local-only writes: Task 11.
- Vercel environment/deployment: Task 12.
- Security/RLS/advisors: Tasks 2, 12.
- Unit/integration/E2E tests: Tasks 1–12.

### Placeholder scan

The only variable values left for execution are values that must be supplied or returned at runtime:
- user-selected Supabase organization;
- cost confirmation token;
- Auth admin e-mail/password;
- UUID returned by `auth.users`;
- Supabase project URL/publishable key;
- migration filename generated by the Supabase CLI.

These are runtime inputs, not implementation placeholders.

### Type consistency

- Public UI uses `Creation`.
- Admin UI uses `AdminCreation`.
- Private file path is DB/server-only and is never a field on `Creation`.
- Public query functions return public `Creation` objects.
- Admin actions always call `requireAdmin()`.

### Review Focus coverage

- Non-admin authenticated user: Task 2 integration tests.
- Forged/expired session: Task 3 auth tests + Task 12 E2E.
- `.bbmodel` extension/MIME/size: Task 6.
- Partial remote failure cleanup: Task 7.
- Public private-field leakage: Task 4 + Task 5 regression tests.
