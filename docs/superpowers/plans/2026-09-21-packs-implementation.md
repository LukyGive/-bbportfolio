# Pack Collections Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a first-class Pack system that groups existing Blockbench creations into independently browsable `/packs` collections while preserving every creation as an individual `/creations/[slug]` item.

**Architecture:** Add `packs` plus a many-to-many `pack_creations` table, keep creation rows as the source of truth, and build a small pack domain/query layer around the existing creation mapper. Public pack queries explicitly filter both packs and member creations by `published`, even when an authenticated admin session is present. Admin mutations reuse the existing signed render-upload pipeline and follow the current authenticated POST/PUT/DELETE route pattern.

**Tech Stack:** Next.js 16.3.3 App Router, React 19.3.0, TypeScript 5.8, Supabase/Postgres/RLS/Storage, Vitest 3.2 + Testing Library, Playwright 1.55, Node 22.

**Spec:** `docs/superpowers/specs/2026-09-21-packs-design.md`

## Global Constraints

- `/creations` continues to list individual creations only; packs never become a `creation` subtype.
- Public pack archive and detail routes are `/packs` and `/packs/[slug]`.
- A creation may belong to multiple packs; no model, render, viewer, or metadata is duplicated.
- A published pack may contain draft creations, but draft creations must never appear in public pack grids, mosaics, or counts.
- Pack covers reuse the existing `portfolio-renders` bucket and signed `render` upload flow; no new storage bucket is introduced.
- Pack cover precedence is manual cover first, automatic 2D mosaic fallback second.
- Automatic mosaics use at most four public member creations and must not instantiate `ModelThumbnail`, `ModelThumbnailV2`, Three.js, or any WebGL viewer.
- Member order is administrator-defined and persisted through `sort_order`.
- Pack deletion never deletes creations; creation deletion removes only its membership rows via `ON DELETE CASCADE`.
- The implementation does not add pricing, downloads, pack `.bbmodel` files, pack 3D scenes, nested packs, homepage-featured packs, or pack-specific categories/tags.
- Do not apply the Supabase migration automatically and do not deploy/redeploy Vercel automatically. The user will perform those two actions manually.

## Review Focus

- **Authenticated-public leakage:** visiting `/packs` while logged in as an admin must still hide draft packs and draft member creations; Task 2 pins this with mapper/query tests that filter on row data, not only RLS.
- **Bad membership input:** duplicate, malformed, or non-existent creation IDs must fail before a destructive replacement can corrupt ordering; Tasks 1 and 3 pin this with SQL-function and payload/mutation tests.
- **Cover replacement/removal:** the old cover must remain untouched until the database mutation succeeds, and a newly uploaded cover must be cleaned when finalization never begins; Tasks 3 and 5 pin both directions.
- **Empty public packs:** a published pack with zero public members must render a stable fallback, `0 models`, and no zero-value category chips; Tasks 2 and 4 pin this.
- **Reordering accessibility:** drag/drop and the up/down fallback must submit exactly the same ordered ID array without duplicates; Task 5 tests both interaction paths.

---

## File Structure

### New database/domain files

- `supabase/migrations/20260921131000_pack_collections.sql` — schema, indexes, grants, RLS policies, and atomic membership replacement RPC.
- `lib/packs/types.ts` — `Pack`, `AdminPack`, `PackInput`, and `PackStat` interfaces.
- `lib/packs/mapper.ts` — map Supabase rows to public/admin pack domain objects, including explicit public draft filtering.
- `lib/packs/public.ts` — `getPublishedPacks()` and `getPackBySlug()`.
- `lib/packs/stats.ts` — category-count derivation and mosaic-member selection.

### New admin backend files

- `lib/admin/pack-payload.ts` — parse/validate API JSON and cover upload metadata.
- `lib/admin/pack-query.ts` — authenticated pack reads for `/admin`.
- `lib/admin/pack-remote.ts` — create/update/delete pack persistence and storage cleanup.
- `app/api/admin/packs/route.ts` — authenticated POST/PUT/DELETE API.

### New public UI files

- `components/portfolio/PackMosaic.tsx` — manual-cover-or-2D-mosaic visual with no viewer imports.
- `components/portfolio/PackCard.tsx` — archive card.
- `components/portfolio/PackGallery.tsx` — pack grid/empty state.
- `components/portfolio/PackStats.tsx` — total/category stat strip.
- `app/packs/page.tsx` — public pack archive.
- `app/packs/[slug]/page.tsx` — version-C detail layout.

### New admin UI files

- `components/admin/PackEditor.tsx` — pack form, optional cover upload, membership selection, save flow.
- `components/admin/PackMemberPicker.tsx` — searchable available list plus ordered drag/drop/up/down list.

### Existing files to modify

- `lib/supabase/database.types.ts` — add `packs`, `pack_creations`, relationships, and `replace_pack_creations` RPC typing.
- `lib/admin/upload-contracts.ts` — add `PackUploads` type only; keep existing upload kinds/buckets unchanged.
- `app/admin/page.tsx` — fetch packs alongside creations and pass both to the dashboard.
- `components/admin/AdminDashboard.tsx` — add `Creations | Packs` section switching, pack list/create/edit/delete flow.
- `components/portfolio/Header.tsx` — add `Packs` between `Work` and `Categories`.
- `app/globals.css` — pack archive/detail/admin picker responsive styles.
- `__tests__/e2e/public-portfolio.spec.ts` — public packs smoke coverage and mobile overflow coverage.
- `__tests__/e2e/online-admin.spec.ts` — authenticated pack create/reorder/delete flow.

### New tests

- `__tests__/supabase/packs-migration.test.ts`
- `__tests__/packs/mapper.test.ts`
- `__tests__/packs/stats.test.ts`
- `__tests__/admin/pack-payload.test.ts`
- `__tests__/admin/remote-packs.test.ts`
- `__tests__/admin/pack-routes.test.ts`
- `__tests__/components/PackMosaic.test.tsx`
- `__tests__/components/PackCard.test.tsx`
- `__tests__/components/PackEditor.test.tsx`
- `__tests__/components/PackMemberPicker.test.tsx`
- `__tests__/components/AdminDashboardPacks.test.tsx`

---

### Task 1: Add the relational pack schema, RLS, atomic membership replacement, and TypeScript database contract

**Files:**
- Create: `supabase/migrations/20260921131000_pack_collections.sql`
- Modify: `lib/supabase/database.types.ts`
- Create: `__tests__/supabase/packs-migration.test.ts`

**Interfaces:**
- Produces table `public.packs`.
- Produces table `public.pack_creations`.
- Produces RPC `replace_pack_creations(target_pack_id uuid, ordered_creation_ids uuid[]) -> void`.
- Produces typed Supabase access through `Database['public']['Tables']['packs']`, `Database['public']['Tables']['pack_creations']`, and `Database['public']['Functions']['replace_pack_creations']`.

- [ ] **Step 1: Write the failing schema-contract test**

```ts
// __tests__/supabase/packs-migration.test.ts
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const sql = readFileSync('supabase/migrations/20260921131000_pack_collections.sql', 'utf8');

describe('pack collections migration', () => {
  it('creates many-to-many pack membership with cascade cleanup and ordered rows', () => {
    expect(sql).toMatch(/create table public\.packs/i);
    expect(sql).toMatch(/slug text not null unique/i);
    expect(sql).toMatch(/create table public\.pack_creations/i);
    expect(sql).toMatch(/pack_id uuid not null references public\.packs\(id\) on delete cascade/i);
    expect(sql).toMatch(/creation_id uuid not null references public\.creations\(id\) on delete cascade/i);
    expect(sql).toMatch(/primary key \(pack_id, creation_id\)/i);
    expect(sql).toMatch(/sort_order integer not null default 0 check \(sort_order >= 0\)/i);
  });

  it('keeps public reads publication-safe and admin writes restricted', () => {
    expect(sql).toMatch(/published packs are public/i);
    expect(sql).toMatch(/published pack creations are public/i);
    expect(sql).toMatch(/c\.published = true/i);
    expect(sql).toMatch(/p\.published = true/i);
    expect(sql).toMatch(/admin can insert packs/i);
    expect(sql).toMatch(/admin can update pack creations/i);
    expect(sql).toMatch(/admin can delete pack creations/i);
  });

  it('replaces ordered memberships inside one postgres function call', () => {
    expect(sql).toMatch(/function public\.replace_pack_creations/i);
    expect(sql).toMatch(/with ordinality/i);
    expect(sql).toMatch(/duplicate creation ids are not allowed/i);
  });
});
```

- [ ] **Step 2: Run the test and verify it fails because the migration file does not exist**

Run:

```bash
npm run test:run -- __tests__/supabase/packs-migration.test.ts
```

Expected: FAIL with an `ENOENT` for `20260921131000_pack_collections.sql`.

- [ ] **Step 3: Add the migration and database typings**

Migration core:

```sql
create table public.packs (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  name text not null check (char_length(trim(name)) > 0),
  description text not null default '',
  cover_image_path text,
  published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.pack_creations (
  pack_id uuid not null references public.packs(id) on delete cascade,
  creation_id uuid not null references public.creations(id) on delete cascade,
  sort_order integer not null default 0 check (sort_order >= 0),
  primary key (pack_id, creation_id)
);

create index pack_creations_pack_sort_idx on public.pack_creations (pack_id, sort_order, creation_id);
create index pack_creations_creation_idx on public.pack_creations (creation_id);

alter table public.packs enable row level security;
alter table public.pack_creations enable row level security;
revoke all on public.packs from anon, authenticated;
revoke all on public.pack_creations from anon, authenticated;
grant select on public.packs to anon, authenticated;
grant insert, update, delete on public.packs to authenticated;
grant select on public.pack_creations to anon, authenticated;
grant insert, update, delete on public.pack_creations to authenticated;

create policy "published packs are public"
on public.packs for select to anon, authenticated
using (published = true);

create policy "admin can read all packs"
on public.packs for select to authenticated
using (exists (select 1 from public.admin_users au where au.user_id = (select auth.uid())));
create policy "admin can insert packs"
on public.packs for insert to authenticated
with check (exists (select 1 from public.admin_users au where au.user_id = (select auth.uid())));
create policy "admin can update packs"
on public.packs for update to authenticated
using (exists (select 1 from public.admin_users au where au.user_id = (select auth.uid())))
with check (exists (select 1 from public.admin_users au where au.user_id = (select auth.uid())));
create policy "admin can delete packs"
on public.packs for delete to authenticated
using (exists (select 1 from public.admin_users au where au.user_id = (select auth.uid())));

create policy "published pack creations are public"
on public.pack_creations for select to anon, authenticated
using (
  exists (select 1 from public.packs p where p.id = pack_id and p.published = true)
  and exists (select 1 from public.creations c where c.id = creation_id and c.published = true)
);

create policy "admin can read all pack creations"
on public.pack_creations for select to authenticated
using (exists (select 1 from public.admin_users au where au.user_id = (select auth.uid())));
create policy "admin can insert pack creations"
on public.pack_creations for insert to authenticated
with check (exists (select 1 from public.admin_users au where au.user_id = (select auth.uid())));
create policy "admin can update pack creations"
on public.pack_creations for update to authenticated
using (exists (select 1 from public.admin_users au where au.user_id = (select auth.uid())))
with check (exists (select 1 from public.admin_users au where au.user_id = (select auth.uid())));
create policy "admin can delete pack creations"
on public.pack_creations for delete to authenticated
using (exists (select 1 from public.admin_users au where au.user_id = (select auth.uid())));

create or replace function public.replace_pack_creations(
  target_pack_id uuid,
  ordered_creation_ids uuid[]
) returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  if exists (
    select 1
    from unnest(coalesce(ordered_creation_ids, '{}'::uuid[])) as ids(id)
    group by id
    having count(*) > 1
  ) then
    raise exception 'Duplicate creation ids are not allowed.' using errcode = '22023';
  end if;

  delete from public.pack_creations where pack_id = target_pack_id;

  insert into public.pack_creations (pack_id, creation_id, sort_order)
  select target_pack_id, member.creation_id, (member.ordinality - 1)::integer
  from unnest(coalesce(ordered_creation_ids, '{}'::uuid[])) with ordinality as member(creation_id, ordinality);
end;
$$;

revoke all on function public.replace_pack_creations(uuid, uuid[]) from public;
grant execute on function public.replace_pack_creations(uuid, uuid[]) to authenticated;
```

Add handwritten typings matching the repository style, including these function args exactly:

```ts
Functions: {
  replace_pack_creations: {
    Args: { target_pack_id: string; ordered_creation_ids: string[] };
    Returns: undefined;
  };
};
```

- [ ] **Step 4: Run the migration-contract test and TypeScript/build check**

Run:

```bash
npm run test:run -- __tests__/supabase/packs-migration.test.ts
npm run build
```

Expected: PASS; Next build type-checks the new database contract.

- [ ] **Step 5: Commit the schema contract**

```bash
git add supabase/migrations/20260921131000_pack_collections.sql lib/supabase/database.types.ts __tests__/supabase/packs-migration.test.ts
git commit -m "feat: add pack collection schema"
```

---

### Task 2: Build pack domain types, mapping, explicit publication filtering, stats, and public queries

**Files:**
- Create: `lib/packs/types.ts`
- Create: `lib/packs/mapper.ts`
- Create: `lib/packs/stats.ts`
- Create: `lib/packs/public.ts`
- Create: `__tests__/packs/mapper.test.ts`
- Create: `__tests__/packs/stats.test.ts`

**Interfaces:**
- Consumes: `mapPublicCreation(row, baseUrl?)`, `publicRenderUrl(path, baseUrl?)`, and typed `packs`/`pack_creations` rows.
- Produces: `Pack`, `AdminPack`, `PackInput`, `PackStat`.
- Produces: `mapPublicPack(row, baseUrl?)`, `mapAdminPack(row, baseUrl?)`.
- Produces: `getPublishedPacks(): Promise<Pack[]>`, `getPackBySlug(slug: string): Promise<Pack | undefined>`.
- Produces: `getPackStats(creations: Creation[]): PackStat[]`, `getMosaicCreations(creations: Creation[]): Creation[]`.

- [ ] **Step 1: Write failing mapper/stat tests**

```ts
// __tests__/packs/mapper.test.ts
import { describe, expect, it } from 'vitest';
import { mapPublicPack } from '@/lib/packs/mapper';

it('filters draft members even if the database row is visible to an authenticated admin', () => {
  const row = {
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    slug: 'sakura-pack', name: 'Sakura Pack', description: '', cover_image_path: null,
    published: true, created_at: '2026-09-21T00:00:00Z', updated_at: '2026-09-21T00:00:00Z',
    pack_creations: [
      { sort_order: 1, creation_id: 'draft', creations: { id: 'draft', slug: 'draft', name: 'Draft', category: 'Item', tags: [], description: '', animations: [], featured: false, featured_order: null, published: false, created_at: '2026-09-21', updated_at: '2026-09-21T00:00:00Z', software: null, model_type: null, version: null, notes: null, cover_image_path: null, bbmodel_path: null, bbmodel_filename: null, bbmodel_size: null, viewer_model_path: null, viewer_status: 'none', viewer_error: null, viewer_updated_at: null, viewer_animation_names: [], creation_images: [] } },
      { sort_order: 0, creation_id: 'public', creations: { id: 'public', slug: 'public', name: 'Public', category: 'Item', tags: [], description: '', animations: [], featured: false, featured_order: null, published: true, created_at: '2026-09-21', updated_at: '2026-09-21T00:00:00Z', software: null, model_type: null, version: null, notes: null, cover_image_path: null, bbmodel_path: null, bbmodel_filename: null, bbmodel_size: null, viewer_model_path: null, viewer_status: 'none', viewer_error: null, viewer_updated_at: null, viewer_animation_names: [], creation_images: [] } },
    ],
  };
  const pack = mapPublicPack(row as never, 'https://example.supabase.co');
  expect(pack.creations.map((item) => item.name)).toEqual(['Public']);
});
```

```ts
// __tests__/packs/stats.test.ts
import { expect, it } from 'vitest';
import { getMosaicCreations, getPackStats } from '@/lib/packs/stats';

it('counts only supplied visible creations and omits zero categories', () => {
  const creations = [
    { id: '1', category: 'Item' },
    { id: '2', category: 'Item' },
    { id: '3', category: 'Armor' },
  ] as never;
  expect(getPackStats(creations)).toEqual([
    { label: 'Models', count: 3 },
    { label: 'Item', count: 2 },
    { label: 'Armor', count: 1 },
  ]);
});

it('limits mosaic members to the first four in pack order', () => {
  const creations = Array.from({ length: 6 }, (_, index) => ({ id: String(index) })) as never;
  expect(getMosaicCreations(creations).map((item) => item.id)).toEqual(['0', '1', '2', '3']);
});
```

- [ ] **Step 2: Run focused tests and verify missing-module failures**

```bash
npm run test:run -- __tests__/packs/mapper.test.ts __tests__/packs/stats.test.ts
```

Expected: FAIL because `lib/packs/*` does not exist.

- [ ] **Step 3: Implement focused domain files and public queries**

Use these public interfaces:

```ts
// lib/packs/types.ts
import type { Creation } from '@/lib/creations/types';

export type Pack = {
  id: string;
  slug: string;
  name: string;
  description: string;
  published: boolean;
  createdAt: string;
  updatedAt: string;
  coverImage?: string;
  creations: Creation[];
};

export type AdminPack = Omit<Pack, 'creations'> & {
  orderedCreationIds: string[];
  memberCount: number;
};

export type PackInput = {
  slug?: string;
  name: string;
  description: string;
  published: boolean;
  orderedCreationIds: string[];
};

export type PackStat = { label: string; count: number };
```

Mapper rule that protects public pages even for admin-authenticated sessions:

```ts
const creations = [...(row.pack_creations ?? [])]
  .filter((member) => member.creations?.published === true)
  .sort((a, b) => a.sort_order - b.sort_order || a.creation_id.localeCompare(b.creation_id))
  .map((member) => mapPublicCreation(member.creations!, baseUrl));
```

Stats implementation:

```ts
export function getPackStats(creations: Creation[]): PackStat[] {
  const categories = new Map<string, number>();
  for (const creation of creations) categories.set(creation.category, (categories.get(creation.category) ?? 0) + 1);
  return [
    { label: 'Models', count: creations.length },
    ...[...categories.entries()].map(([label, count]) => ({ label, count })),
  ];
}

export function getMosaicCreations(creations: Creation[]): Creation[] {
  return creations.slice(0, 4);
}
```

Public queries must explicitly include `.eq('published', true)` on `packs`, then map and filter member creations again in `mapPublicPack`; do not rely on RLS alone.

- [ ] **Step 4: Run focused domain tests**

```bash
npm run test:run -- __tests__/packs/mapper.test.ts __tests__/packs/stats.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit the pack domain layer**

```bash
git add lib/packs __tests__/packs
git commit -m "feat: add public pack domain layer"
```

---

### Task 3: Add validated admin pack mutations, atomic membership replacement, cover lifecycle, and API routes

**Files:**
- Modify: `lib/admin/upload-contracts.ts`
- Create: `lib/admin/pack-payload.ts`
- Create: `lib/admin/pack-query.ts`
- Create: `lib/admin/pack-remote.ts`
- Create: `app/api/admin/packs/route.ts`
- Create: `__tests__/admin/pack-payload.test.ts`
- Create: `__tests__/admin/remote-packs.test.ts`
- Create: `__tests__/admin/pack-routes.test.ts`

**Interfaces:**
- Consumes: `UploadedRenderRef`, `verifyUploadedObject`, `cleanupUploadedRefs`, `removeObjects`, `getAdminContext`, `Database`, `AdminPack`.
- Produces: `PackUploads = { cover?: UploadedRenderRef }`.
- Produces: `parsePackMutationBody(raw, userId)`.
- Produces: `getAllPacksForAdmin(): Promise<AdminPack[]>`.
- Produces: `createRemotePack`, `updateRemotePack`, `deleteRemotePack`.
- Produces: `/api/admin/packs` POST/PUT/DELETE.

- [ ] **Step 1: Write failing payload and remote-mutation tests**

```ts
// __tests__/admin/pack-payload.test.ts
import { expect, it } from 'vitest';
import { parsePackMutationBody } from '@/lib/admin/pack-payload';

const userId = '11111111-1111-4111-8111-111111111111';
const a = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

it('rejects duplicate ordered creation ids', () => {
  expect(() => parsePackMutationBody({
    payload: { name: 'Pack', slug: 'pack', description: '', published: true, orderedCreationIds: [a, a] },
  }, userId)).toThrow(/duplicate creation/i);
});

it('rejects simultaneous removeCover and uploaded replacement', () => {
  expect(() => parsePackMutationBody({
    payload: { name: 'Pack', slug: 'pack', description: '', published: true, orderedCreationIds: [] },
    removeCover: true,
    uploads: { cover: { clientKey: 'pack-cover', kind: 'render', bucket: 'portfolio-renders', path: 'bad', filename: 'cover.png', size: 10, contentType: 'image/png' } },
  }, userId)).toThrow();
});
```

```ts
// __tests__/admin/remote-packs.test.ts
import { expect, it, vi } from 'vitest';
import { createRemotePack } from '@/lib/admin/pack-remote';

it('passes submitted member order to the atomic replacement rpc', async () => {
  const rpc = vi.fn().mockResolvedValue({ data: null, error: null });
  const client = makePackClient({ rpc });
  await createRemotePack(client as never, userId, {
    name: 'Sakura Pack', slug: 'sakura-pack', description: '', published: true,
    orderedCreationIds: [creationA, creationB],
  }, {});
  expect(rpc).toHaveBeenCalledWith('replace_pack_creations', {
    target_pack_id: expect.any(String),
    ordered_creation_ids: [creationA, creationB],
  });
});
```

The `makePackClient` helper in this test file should mirror the small fake-client style already used by `__tests__/admin/remote-creations.test.ts`, returning deterministic rows for `packs`, `pack_creations`, `creations`, `rpc`, and `storage.from()`.

- [ ] **Step 2: Run focused tests and verify failures**

```bash
npm run test:run -- __tests__/admin/pack-payload.test.ts __tests__/admin/remote-packs.test.ts __tests__/admin/pack-routes.test.ts
```

Expected: FAIL because pack admin modules/routes are missing.

- [ ] **Step 3: Implement payload, query, remote persistence, and route handlers**

Add upload contract:

```ts
export type PackUploads = { cover?: UploadedRenderRef };
```

Payload result:

```ts
export type PackMutationBody = {
  input: PackInput;
  uploads: PackUploads;
  originalId?: string;
  removeCover: boolean;
};
```

`parsePackMutationBody` must:

```ts
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ids = raw.payload.orderedCreationIds;
if (!Array.isArray(ids) || ids.some((id) => typeof id !== 'string' || !UUID.test(id))) {
  throw new Error('orderedCreationIds must contain valid UUIDs.');
}
if (new Set(ids).size !== ids.length) throw new Error('Duplicate creation ids are not allowed.');
```

Normalize on the server before DB writes:

```ts
const name = input.name.trim();
const slug = input.slug?.trim() || slugify(name);
if (!name) throw new Error('Name is required.');
if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) throw new Error('Slug is unsafe or invalid.');
return { slug, name, description: input.description.trim(), published: input.published !== false };
```

Before `replace_pack_creations`, validate all submitted IDs exist with one creation query and reject when the returned ID set does not exactly match the submitted unique IDs. This guarantees a clean 400-style validation error instead of relying on a later FK failure.

Create flow:

```ts
if (uploads.cover) await verifyUploadedObject(storageClient, userId, uploads.cover);
const { data: inserted, error } = await client.from('packs').insert({
  ...normalized,
  cover_image_path: uploads.cover?.path ?? null,
}).select('id').single();
if (error || !inserted) throw dbError('Could not create pack', error);
await client.rpc('replace_pack_creations', {
  target_pack_id: inserted.id,
  ordered_creation_ids: input.orderedCreationIds,
});
```

On create failure after upload, delete the just-created pack when applicable and call `cleanupUploadedRefs(storageClient, userId, [uploads.cover])` for the new cover only.

Update flow rules:

```ts
const nextCoverPath = uploads.cover
  ? uploads.cover.path
  : removeCover
    ? null
    : current.cover_image_path;
```

Verify new cover first. Update scalar fields, then call the atomic membership RPC. If membership replacement fails, restore the previous scalar pack row before surfacing the error. Only after both DB operations succeed may the old cover be removed from `portfolio-renders`. If a new upload fails before finalization, clean only the new uploaded cover. `removeCover` removes the old object only after the DB row has successfully been set to null.

Delete flow: load pack, delete `packs` row, then best-effort `removeObjects(storageClient, 'portfolio-renders', [coverPath])`; return `cleanupWarning` if storage removal fails.

Route error mapping should mirror `/api/admin/creations`: 401 auth, 400 validation/upload, 404 missing pack, 409 duplicate slug, generic 500 otherwise.

- [ ] **Step 4: Run admin backend tests**

```bash
npm run test:run -- __tests__/admin/pack-payload.test.ts __tests__/admin/remote-packs.test.ts __tests__/admin/pack-routes.test.ts
```

Expected: PASS, including create order, update reorder, duplicate rejection, cover replacement/removal lifecycle, delete semantics, and status-code mapping.

- [ ] **Step 5: Commit the admin backend**

```bash
git add lib/admin/upload-contracts.ts lib/admin/pack-payload.ts lib/admin/pack-query.ts lib/admin/pack-remote.ts app/api/admin/packs/route.ts __tests__/admin/pack-payload.test.ts __tests__/admin/remote-packs.test.ts __tests__/admin/pack-routes.test.ts
git commit -m "feat: add pack admin api"
```

---

### Task 4: Add the public pack archive, version-C pack detail page, mosaic fallback, stats, and navigation

**Files:**
- Create: `components/portfolio/PackMosaic.tsx`
- Create: `components/portfolio/PackCard.tsx`
- Create: `components/portfolio/PackGallery.tsx`
- Create: `components/portfolio/PackStats.tsx`
- Create: `app/packs/page.tsx`
- Create: `app/packs/[slug]/page.tsx`
- Modify: `components/portfolio/Header.tsx`
- Modify: `app/globals.css`
- Create: `__tests__/components/PackMosaic.test.tsx`
- Create: `__tests__/components/PackCard.test.tsx`

**Interfaces:**
- Consumes: `Pack`, `getPublishedPacks`, `getPackBySlug`, `getPackStats`, `getMosaicCreations`, existing `CreationGallery`/`CreationCard`.
- Produces public archive/detail UI only; no WebGL imports in pack visual components.

- [ ] **Step 1: Write failing visual tests**

```tsx
// __tests__/components/PackMosaic.test.tsx
import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { PackMosaic } from '@/components/portfolio/PackMosaic';

it('prefers a manual cover', () => {
  render(<PackMosaic pack={{ name: 'Sakura Pack', coverImage: 'https://cdn/cover.webp', creations: [] } as never} />);
  expect(screen.getByRole('img', { name: /sakura pack cover/i })).toBeInTheDocument();
  expect(screen.queryByTestId('pack-mosaic-grid')).not.toBeInTheDocument();
});

it('uses 2d/fallback tiles and never renders a canvas for automatic mosaic', () => {
  render(<PackMosaic pack={{ name: 'Sakura Pack', creations: [{ id: '1', name: 'Pickaxe', category: 'Item', coverImage: '/models/_placeholder/creation-placeholder.svg' }] } as never} />);
  expect(screen.getByTestId('pack-mosaic-grid')).toBeInTheDocument();
  expect(document.querySelector('canvas')).toBeNull();
  expect(screen.getByText('Pickaxe')).toBeInTheDocument();
});
```

```tsx
// __tests__/components/PackCard.test.tsx
import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { PackCard } from '@/components/portfolio/PackCard';

it('links the pack archive card to its pack route and reports public model count', () => {
  render(<PackCard pack={{ id: '1', slug: 'sakura-pack', name: 'Sakura Pack', creations: [{ id: 'a' }, { id: 'b' }] } as never} />);
  expect(screen.getByRole('link', { name: /view sakura pack/i })).toHaveAttribute('href', '/packs/sakura-pack');
  expect(screen.getByText('2 models')).toBeInTheDocument();
});
```

- [ ] **Step 2: Run component tests and verify missing-component failures**

```bash
npm run test:run -- __tests__/components/PackMosaic.test.tsx __tests__/components/PackCard.test.tsx
```

Expected: FAIL because pack components do not exist.

- [ ] **Step 3: Implement components, routes, navigation, and responsive CSS**

`PackMosaic` must branch without importing viewer code:

```tsx
if (pack.coverImage) {
  return <div className={className}><Image src={pack.coverImage} alt={`${pack.name} cover`} fill sizes={sizes} /></div>;
}

const tiles = getMosaicCreations(pack.creations);
return (
  <div className={`${className} pack-mosaic`} data-testid="pack-mosaic-grid">
    {tiles.length === 0 ? <div className="pack-mosaic-empty">Pack preview</div> : tiles.map((creation) => (
      creation.coverImage !== PLACEHOLDER
        ? <div className="pack-mosaic-tile" key={creation.id}><Image src={creation.coverImage} alt="" fill sizes="25vw" /></div>
        : <div className="pack-mosaic-tile fallback" key={creation.id}><strong>{creation.name}</strong><span>{creation.category}</span></div>
    ))}
  </div>
);
```

`/packs`:

```tsx
export default async function PacksPage() {
  const packs = await getPublishedPacks();
  return (
    <div className="page-shell shell">
      <header className="page-intro">
        <span className="eyebrow">PACK COLLECTIONS</span>
        <h1>Packs</h1>
        <p>Curated collections of Blockbench models and assets.</p>
      </header>
      <PackGallery packs={packs} />
    </div>
  );
}
```

`/packs/[slug]`:

```tsx
const pack = await getPackBySlug(slug);
if (!pack) return notFound();
const stats = getPackStats(pack.creations);
return (
  <article className="pack-detail shell">
    <Link className="detail-back" href="/packs"><span aria-hidden="true">←</span> All packs</Link>
    <header className="pack-detail-header"><span className="eyebrow">PACK</span><h1>{pack.name}</h1><p>{pack.description}</p></header>
    <PackMosaic pack={pack} className="pack-hero" priority />
    <PackStats stats={stats} />
    <section className="section pack-members"><div className="section-head compact"><div><span className="eyebrow">Included creations</span><h2>Inside the pack</h2></div></div><CreationGallery creations={pack.creations} /></section>
  </article>
);
```

Add metadata from `pack.name`/`pack.description`, and return `Creation not found`-style metadata text as `Pack not found` for missing/unpublished slugs.

Update header order exactly:

```tsx
<Link href="/creations">Work</Link>
<Link href="/packs">Packs</Link>
<Link href="/#categories">Categories</Link>
```

CSS must preserve 320px no-overflow behavior and use existing variables (`--surface`, `--border`, `--muted`, `--radius`) instead of introducing a second theme.

- [ ] **Step 4: Run public component tests plus existing creation-card tests**

```bash
npm run test:run -- __tests__/components/PackMosaic.test.tsx __tests__/components/PackCard.test.tsx __tests__/components/CreationCard.test.tsx
```

Expected: PASS. Existing creation card behavior remains unchanged, including `.bbpreview` thumbnails in the member grid.

- [ ] **Step 5: Commit the public pack UI**

```bash
git add components/portfolio/PackMosaic.tsx components/portfolio/PackCard.tsx components/portfolio/PackGallery.tsx components/portfolio/PackStats.tsx components/portfolio/Header.tsx app/packs app/globals.css __tests__/components/PackMosaic.test.tsx __tests__/components/PackCard.test.tsx
git commit -m "feat: add public pack pages"
```

---

### Task 5: Add pack management to `/admin` with search, selection, drag/drop, keyboard/touch reorder, optional cover, and two-step delete

**Files:**
- Create: `components/admin/PackMemberPicker.tsx`
- Create: `components/admin/PackEditor.tsx`
- Modify: `components/admin/AdminDashboard.tsx`
- Modify: `app/admin/page.tsx`
- Modify: `app/globals.css`
- Create: `__tests__/components/PackMemberPicker.test.tsx`
- Create: `__tests__/components/PackEditor.test.tsx`
- Create: `__tests__/components/AdminDashboardPacks.test.tsx`

**Interfaces:**
- Consumes: `AdminCreation[]`, `AdminPack[]`, `authorizeUploads`, `uploadAuthorizedFile`, `toUploadedAssetRef`, `cleanupAuthorizedUploads`, `/api/admin/packs`.
- Produces: pack admin UI with exact ordered `orderedCreationIds` submission.

- [ ] **Step 1: Write failing picker/editor/dashboard tests**

```tsx
// __tests__/components/PackMemberPicker.test.tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { PackMemberPicker } from '@/components/admin/PackMemberPicker';

it('searches available creations and prevents duplicate selection', async () => {
  const onChange = vi.fn();
  render(<PackMemberPicker creations={[creationA, creationB] as never} value={[]} onChange={onChange} />);
  await userEvent.type(screen.getByRole('searchbox', { name: /search creations for pack/i }), 'pick');
  await userEvent.click(screen.getByRole('button', { name: /add sakura pickaxe/i }));
  expect(onChange).toHaveBeenLastCalledWith([creationA.id]);
});

it('moves selected members with accessible up/down controls', async () => {
  const onChange = vi.fn();
  render(<PackMemberPicker creations={[creationA, creationB] as never} value={[creationA.id, creationB.id]} onChange={onChange} />);
  await userEvent.click(screen.getByRole('button', { name: /move sakura axe up/i }));
  expect(onChange).toHaveBeenLastCalledWith([creationB.id, creationA.id]);
});
```

```tsx
// __tests__/components/PackEditor.test.tsx
it('uploads one optional render cover before sending ordered ids as json', async () => {
  // Mock direct-upload exactly like CreationEditor.test.tsx.
  // Select two members, move the second upward, upload cover.png, submit.
  // Assert uploadAuthorizedFile is called before fetch and the JSON payload contains
  // orderedCreationIds in the reordered sequence plus uploads.cover metadata, never binary bytes.
});
```

Implement that test with concrete fixtures (`creationA`, `creationB`, an authorized `render` descriptor) and explicit `expect(...).toEqual([creationB.id, creationA.id])`; do not leave the comment-only form in the committed test.

- [ ] **Step 2: Run component tests and verify missing-component failures**

```bash
npm run test:run -- __tests__/components/PackMemberPicker.test.tsx __tests__/components/PackEditor.test.tsx __tests__/components/AdminDashboardPacks.test.tsx
```

Expected: FAIL because the pack admin components do not exist.

- [ ] **Step 3: Implement member picker, editor save flow, dashboard tabs, and admin data loading**

Picker state transitions must be pure array operations:

```ts
const add = (id: string) => !value.includes(id) && onChange([...value, id]);
const remove = (id: string) => onChange(value.filter((memberId) => memberId !== id));
const move = (from: number, to: number) => {
  if (to < 0 || to >= value.length || from === to) return;
  const next = [...value];
  const [member] = next.splice(from, 1);
  next.splice(to, 0, member);
  onChange(next);
};
```

Native drag/drop uses the same `move(fromIndex, toIndex)` path; up/down buttons call the same function so both paths persist identical order.

`PackEditor` direct-cover upload flow:

```ts
const requests: UploadRequestFile[] = coverFile ? [{
  clientKey: 'pack-cover', kind: 'render', filename: coverFile.name,
  size: coverFile.size, contentType: coverFile.type,
}] : [];
```

If a cover file exists, authorize and upload it before finalization, then convert it with `toUploadedAssetRef` and submit it as `uploads.cover`. Track `finalizationStarted` exactly like `CreationEditor`: clean successful new uploads only if failure happens before API finalization begins; do not delete the new upload if the API request may have succeeded but the response was lost.

Expose an edit-only `Remove current cover and use automatic mosaic` checkbox. Submit `removeCover: true` only when checked and no new cover is selected.

`app/admin/page.tsx` should load data together after auth-protected query functions:

```ts
const [creations, packs] = await Promise.all([
  getAllCreationsForAdmin(),
  getAllPacksForAdmin(),
]);
return <AdminDashboard initialCreations={creations} initialPacks={packs} categories={categories} />;
```

Dashboard state should distinguish section and editor kind:

```ts
type Section = 'creations' | 'packs';
type EditorState =
  | { kind: 'creation'; mode: 'create' }
  | { kind: 'creation'; mode: 'edit'; creation: AdminCreation }
  | { kind: 'pack'; mode: 'create' }
  | { kind: 'pack'; mode: 'edit'; pack: AdminPack }
  | null;
```

The sidebar renders `Creations` and `Packs` tabs, section-specific summary/search/new button/list, and the same two-click delete pattern. Pack deletion calls `/api/admin/packs`; creation deletion remains `/api/admin/creations` unchanged.

- [ ] **Step 4: Run admin component tests and existing creation editor tests**

```bash
npm run test:run -- __tests__/components/PackMemberPicker.test.tsx __tests__/components/PackEditor.test.tsx __tests__/components/AdminDashboardPacks.test.tsx __tests__/components/CreationEditor.test.tsx
```

Expected: PASS. Existing creation creation/edit/upload flows remain green.

- [ ] **Step 5: Commit the admin UX**

```bash
git add components/admin/PackMemberPicker.tsx components/admin/PackEditor.tsx components/admin/AdminDashboard.tsx app/admin/page.tsx app/globals.css __tests__/components/PackMemberPicker.test.tsx __tests__/components/PackEditor.test.tsx __tests__/components/AdminDashboardPacks.test.tsx
git commit -m "feat: add pack management ui"
```

---

### Task 6: Add end-to-end pack coverage, run all regression gates, and prepare the manual Supabase/Vercel handoff

**Files:**
- Modify: `__tests__/e2e/public-portfolio.spec.ts`
- Modify: `__tests__/e2e/online-admin.spec.ts`
- No deployment or Supabase mutation is performed in this task.

**Interfaces:**
- Consumes the complete pack feature.
- Produces regression evidence for public browsing, mobile layout, and authenticated pack administration.

- [ ] **Step 1: Add public Playwright coverage**

Extend the public suite with assertions equivalent to:

```ts
test('pack archive and detail are public portfolio routes', async ({ page }) => {
  await page.goto('/packs');
  await expect(page.getByRole('heading', { name: 'Packs' })).toBeVisible();
  await expect(page.getByRole('link', { name: /packs/i }).first()).toBeVisible();

  // Fixture-backed environments should open the first published pack card.
  const firstPack = page.locator('.pack-card').first();
  if (await firstPack.count()) {
    await firstPack.click();
    await expect(page.getByText('Included creations')).toBeVisible();
    await expect(page.locator('.pack-hero canvas')).toHaveCount(0);
  }
});

test('packs have no horizontal overflow at 320px', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto('/packs');
  expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
});
```

Keep existing `/creations` E2E assertions intact to prove the archive still contains only creation behavior.

- [ ] **Step 2: Add authenticated admin pack E2E coverage**

Inside the existing environment-gated `online admin` describe block, add a test that:

```ts
await login(page);
await page.getByRole('button', { name: /^packs$/i }).click();
await page.getByRole('button', { name: /new pack/i }).click();
await page.getByLabel('Name').fill(name);
await page.getByRole('button', { name: /add .*creation/i }).first().click();
await page.getByRole('button', { name: /save pack/i }).click();
await expect(page.getByText(name)).toBeVisible();
await page.goto(`/packs/${slug}`);
await expect(page.getByRole('heading', { name })).toBeVisible();
```

Then return to `/admin`, open `Packs`, perform the two-click delete, and assert the pack disappears. If at least two fixture creations are available, move the second above the first before save and assert their public card DOM order matches the admin order.

- [ ] **Step 3: Run all unit/component tests**

```bash
npm run test:run
```

Expected: all Vitest suites PASS, including existing viewer-v2 and creation/admin tests.

- [ ] **Step 4: Run lint, build, and Playwright**

```bash
npm run lint
npm run build
npm run test:e2e
```

Expected: lint and build PASS. Public Playwright tests PASS. Authenticated admin Playwright tests PASS when `E2E_ADMIN_EMAIL` and `E2E_ADMIN_PASSWORD` are present; otherwise the existing explicit environment skip is the expected result.

- [ ] **Step 5: Review the final diff against the approved spec and commit E2E coverage**

Confirm each acceptance criterion in `docs/superpowers/specs/2026-09-21-packs-design.md` maps to code/tests, with particular attention to draft privacy, no WebGL in mosaics, multi-pack membership, order persistence, and delete semantics.

```bash
git add __tests__/e2e/public-portfolio.spec.ts __tests__/e2e/online-admin.spec.ts
git commit -m "test: cover pack collections end to end"
```

After verification, hand the user the migration path `supabase/migrations/20260921131000_pack_collections.sql` and explicitly stop. The user manually applies that migration and manually triggers the Vercel deployment. Do not perform either action from the implementation session.

---

## Self-Review Results

### Spec coverage

- Dedicated `/packs` archive: Task 4.
- Version-C `/packs/[slug]`: Task 4.
- Header `Packs` link: Task 4.
- Many-to-many schema and multi-pack support: Task 1.
- Cascade semantics: Task 1 and Task 3.
- Manual cover + mosaic fallback: Tasks 3–5.
- No WebGL mosaics: Task 4 tests and implementation boundary.
- Public draft filtering/count exclusion: Task 2.
- Manual ordering, drag/drop, and fallback controls: Tasks 1, 3, and 5.
- Admin create/edit/delete/search: Tasks 3 and 5.
- RLS and typed Supabase contract: Task 1.
- Existing creation/viewer behavior protected: Tasks 4–6 regression runs.
- Manual migration/deploy ownership: Global Constraints and Task 6.

### Placeholder scan

The implementation instructions contain no unresolved implementation placeholders. The PackEditor test step explicitly requires replacing its explanatory scaffold with concrete fixtures and assertions before the test is committed.

### Type consistency

- `PackInput.orderedCreationIds` is `string[]` end-to-end.
- `replace_pack_creations` uses `ordered_creation_ids: string[]` in TypeScript and `uuid[]` in Postgres.
- Cover uploads remain `UploadedRenderRef` with kind `render` and bucket `portfolio-renders`.
- Public `Pack.creations` is `Creation[]`, allowing direct reuse of `CreationGallery`.
- Admin `AdminPack.orderedCreationIds` is separate from public `Pack.creations`, avoiding duplicate creation-domain representations in the admin list.

### Review Focus mapping

- Authenticated-public draft leakage: Task 2 mapper test.
- Bad/duplicate membership input: Tasks 1 and 3.
- Cover replacement/removal safety: Tasks 3 and 5.
- Empty public packs: Tasks 2 and 4.
- Reorder parity/accessibility: Task 5.
