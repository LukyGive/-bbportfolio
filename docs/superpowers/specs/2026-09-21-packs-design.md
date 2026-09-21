# Pack Collections Design

Date: 2026-09-21
Status: Approved design, awaiting implementation-plan approval

## 1. Goal

Add a first-class **Pack** concept to the Blockbench portfolio so multiple existing creations can be presented together as one curated collection, while every creation continues to exist and remain accessible individually through the current `/creations` experience.

A pack is a collection layer over existing creations. It does not duplicate model data, viewer data, renders, or creation metadata.

Primary user outcomes:

- Visitors can browse packs from a dedicated `/packs` page.
- Visitors can open `/packs/[slug]` to see a curated cover, description, summary statistics, and all public creations included in the pack.
- Every creation in a pack still links to its normal `/creations/[slug]` page.
- Admins can create, edit, publish, delete, populate, and manually order packs.
- The same creation can belong to more than one pack.

## 2. Scope

### In scope

- Dedicated public `/packs` archive.
- Dedicated public `/packs/[slug]` detail page.
- `Packs` entry in the main navigation.
- New `packs` table.
- New `pack_creations` join table.
- Admin list/editor for packs alongside the current creation manager.
- Optional manually uploaded pack cover.
- Automatic cover mosaic fallback when no manual cover exists.
- Manual ordering of creations within a pack.
- Public filtering so draft creations are hidden even inside a published pack.
- Pack deletion without deleting contained creations.
- Automatic removal of a deleted creation from every pack containing it.
- Tests for data rules, API behavior, public visibility, and core UI behavior.

### Out of scope for this version

- Selling/downloading packs.
- Pack pricing.
- Pack-specific .bbmodel files.
- Pack-specific 3D viewer scenes.
- Nested packs.
- Featured packs on the homepage.
- Tags/categories dedicated to packs.
- Automatic image compositing into a stored asset; the fallback mosaic is rendered by the site from existing creation assets.

These can be added later without changing the core data model.

## 3. Existing-system constraints

The current portfolio treats each model as an independent `creation`, with its own public route, images, optional `.bbmodel`, and viewer asset. The pack feature must not change that contract.

The existing upload system already handles image uploads through the `portfolio-renders` bucket. Pack covers should reuse that pipeline rather than introduce another storage bucket or upload implementation.

The current admin API uses authenticated `POST`, `PUT`, and `DELETE` route handlers and remote persistence helpers. Packs should follow the same architectural style rather than introduce a separate mutation pattern.

## 4. Chosen architecture

Use two new relational tables:

### `packs`

Represents one pack as a first-class record.

Fields:

- `id uuid primary key default gen_random_uuid()`
- `slug text not null unique`
- `name text not null`
- `description text not null default ''`
- `cover_image_path text null`
- `published boolean not null default true`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

Validation:

- Slug follows the same lowercase-hyphen convention used by creations.
- Name must not be empty after trimming.
- No new dedicated storage bucket is required.

### `pack_creations`

Many-to-many join table between packs and creations.

Fields:

- `pack_id uuid not null references packs(id) on delete cascade`
- `creation_id uuid not null references creations(id) on delete cascade`
- `sort_order integer not null default 0 check (sort_order >= 0)`
- primary key `(pack_id, creation_id)`

Indexes:

- index on `(pack_id, sort_order)` for ordered pack reads.
- index on `creation_id` for reverse membership lookups and cascade efficiency.

There is intentionally no unique constraint on `(pack_id, sort_order)`. Temporary duplicate order values make reordering updates simpler and safe; final display order is still deterministic by `sort_order` plus a stable tie-breaker when required.

## 5. Relationship behavior

A creation may belong to any number of packs.

Example:

- `Sakura Pickaxe` may belong to `Sakura Pack`.
- The same `Sakura Pickaxe` may also later belong to `Fantasy Tools Pack`.

No model content is duplicated. Updating the original creation automatically updates what a pack displays.

Deleting a pack:

- deletes its `pack_creations` rows through `ON DELETE CASCADE`;
- does not delete any creation;
- removes the pack cover object from storage on a best-effort basis after the database deletion, matching the current creation-cleanup approach.

Deleting a creation:

- deletes matching `pack_creations` rows through `ON DELETE CASCADE`;
- leaves all affected packs intact;
- those packs simply contain one fewer creation.

## 6. Publication rules

Pack publication and creation publication are independent.

Public rules:

- A pack is visible only when `packs.published = true`.
- A creation inside a public pack is shown only when `creations.published = true`.
- Draft creations are silently omitted from pack pages and counts.
- A published pack is allowed to contain draft creations.
- A published pack whose members are all drafts may still exist publicly; it renders its empty/fallback state cleanly.

Admin rules:

- Admins can see published and draft packs.
- Admins can include published or draft creations while preparing a pack.

## 7. Public routes

### `/packs`

Dedicated pack archive, completely separate from `/creations`.

The page contains:

- eyebrow: `PACK COLLECTIONS`
- title: `Packs`
- short explanatory text
- pack card grid

Each card shows:

- manual pack cover when present;
- otherwise an automatic mosaic from up to the first four public creations in pack order;
- pack name;
- public model count.

Clicking a card navigates to `/packs/[slug]`.

`/creations` remains unchanged and continues to list only individual creations.

### `/packs/[slug]`

Version C is the initial design.

Page structure:

1. `← All packs`
2. eyebrow `PACK`
3. pack name
4. pack description
5. large pack hero cover
6. automatic summary statistics
7. `Included creations` section
8. creation-card grid in manual pack order

Each creation card reuses the current creation-card behavior and links to `/creations/[creation-slug]`.

If version C is later judged too busy, it can be simplified to version A by removing the statistics section. No database or API changes would be required.

### Not-found behavior

`/packs/[slug]` returns the existing not-found experience when:

- the slug does not exist;
- the pack exists but is not published.

## 8. Pack cover behavior

Cover strategy is manual-first, mosaic-fallback.

### Manual cover

If `cover_image_path` is non-null, it is the pack cover everywhere.

The cover is uploaded through the existing image upload mechanism and stored in `portfolio-renders`.

No new storage bucket is introduced.

### Automatic mosaic

If there is no manual cover, render a visual mosaic from up to the first four **public** creations in pack order.

Important performance rule:

- Do not instantiate 3D/WebGL viewers inside the mosaic.

Mosaic tiles use available 2D creation renders. If one selected creation has no 2D render, that tile uses the same dark/grid visual language as the viewer areas and displays a compact text fallback such as creation name/category.

This keeps `/packs` lightweight even with many pack cards.

The full creation grid below the pack detail page keeps the current behavior: normal render when available, otherwise `.bbpreview` 3D thumbnail.

## 9. Pack statistics

Statistics on `/packs/[slug]` are derived dynamically from currently visible public creations.

At minimum:

- total public model count;
- category counts for categories represented in the pack.

Example:

- `8 MODELS`
- `6 ITEMS`
- `1 ARMOR`
- `1 WEAPON`

Draft creations are neither displayed nor counted.

The UI should avoid rendering zero-value category statistics.

## 10. Navigation

Add `Packs` to the main navigation.

Target order:

- `Work` → `/creations`
- `Packs` → `/packs`
- `Categories` → `/#categories`

No change to the brand/home link.

## 11. Admin UX

The existing `/admin` area becomes a two-section manager:

- `Creations`
- `Packs`

The UI may use tabs/segmented navigation inside the existing dashboard shell.

### Pack list

The Packs section shows:

- total pack count;
- search;
- each pack name;
- published/draft state;
- public or total member count as useful secondary information;
- edit action;
- two-step delete confirmation matching the current creation manager.

### Pack editor

Fields:

- Name
- Slug
- Description
- Optional cover image
- Published toggle
- Creation picker
- Ordered selected-creation list

Creation picker:

- searchable;
- can include draft and published creations;
- selecting a creation adds it once only;
- deselecting removes it from the ordered list.

Ordered selected list:

- supports drag and drop;
- also provides up/down controls as a keyboard/touch fallback;
- saved order becomes `sort_order`.

No pack-specific `.bbmodel` or viewer controls are shown.

## 12. Admin API

Create `/api/admin/packs` following the current `/api/admin/creations` shape.

Supported methods:

### `POST`

Create a pack.

Input conceptually contains:

```ts
{
  name: string;
  slug: string;
  description: string;
  published: boolean;
  orderedCreationIds: string[];
  cover?: UploadedRenderRef;
}
```

Behavior:

1. Authenticate admin.
2. Validate payload.
3. Verify uploaded cover reference when present.
4. Insert `packs` row.
5. Insert `pack_creations` rows using array index as `sort_order`.
6. Attach cover path if present.
7. On failure, clean up newly uploaded cover where possible and rollback created database state.

### `PUT`

Update a pack.

Behavior:

1. Authenticate admin.
2. Load current pack.
3. Validate new payload.
4. Verify uploaded cover if present.
5. Update pack scalar fields.
6. Replace membership/order with the submitted `orderedCreationIds` in one controlled operation.
7. Replace old cover only when a new cover is intentionally supplied.
8. Clean up replaced old cover after successful database persistence, best-effort.

### `DELETE`

Delete a pack.

Behavior:

1. Authenticate admin.
2. Load pack and current cover path.
3. Delete pack row.
4. Rely on cascade to delete `pack_creations` rows.
5. Best-effort delete cover file from `portfolio-renders`.
6. Return cleanup warning when storage deletion fails, matching existing creation behavior.

## 13. Validation rules

Pack mutation parsing must reject:

- missing/empty name;
- invalid slug;
- malformed body;
- non-boolean `published`;
- non-array `orderedCreationIds`;
- duplicate creation IDs in one pack payload;
- invalid UUID values where the current database contract expects UUIDs;
- creation IDs that do not exist;
- invalid cover upload references.

The server is authoritative for all validation; the client UI may provide friendlier early feedback but must not be trusted for integrity.

## 14. Query layer

Create a focused pack query/domain layer rather than embedding joins directly into route components.

Suggested responsibilities:

- public pack list query;
- public pack detail by slug;
- admin pack list query;
- admin pack detail/membership query;
- row-to-domain mapping;
- derived public statistics;
- mosaic source selection.

Public pack queries must ensure both pack and creation publication rules are applied.

Creation mapping should reuse the existing public creation mapper instead of introducing a second representation of creation cards.

## 15. Security / RLS

Enable RLS on both new tables.

### `packs`

Anonymous/authenticated public read:

- only rows where `published = true`.

Authenticated admin:

- can read all packs;
- can insert, update, delete when the user exists in `admin_users`.

### `pack_creations`

Public read:

- relation row is readable only when its parent pack is published and its referenced creation is published.

Admin read/write:

- full access for users present in `admin_users`.

This ensures draft creation membership is not exposed by querying the join table directly.

## 16. Database types

Update `lib/supabase/database.types.ts` with the two new tables and relations required by typed Supabase calls.

The handwritten/generated style already used in the repository should be preserved.

## 17. Error handling

Follow current admin API conventions:

- 401 unauthorized;
- 400 invalid payload/validation/upload reference;
- 404 pack not found;
- 409 duplicate slug;
- 500 generic mutation failure without leaking internal details.

Storage cleanup failure after a successful database mutation is not treated as a full mutation failure; return a cleanup warning, consistent with the current remote creation implementation.

## 18. Testing strategy

Implementation should be test-driven and extend the existing Vitest/Testing Library/Playwright structure.

Minimum required automated coverage:

1. Pack payload normalization and validation.
2. Creating a pack persists ordered members.
3. Updating a pack replaces/reorders membership correctly.
4. Duplicate membership is rejected.
5. One creation can belong to multiple packs.
6. Deleting a pack does not delete creations.
7. Deleting a creation removes its memberships through cascade semantics/schema contract.
8. Draft pack is not returned publicly.
9. Draft creation is omitted from a published pack.
10. Public model/category counts ignore draft creations.
11. Manual cover is preferred over mosaic.
12. Mosaic chooses up to four public creations in pack order.
13. Mosaic does not instantiate 3D viewers.
14. Pack detail returns not-found for missing/unpublished slug.
15. Creation cards in a pack continue to link to `/creations/[slug]`.
16. Admin can search/select creations for a pack.
17. Admin reorder controls change submitted order.
18. Header includes `Packs` link to `/packs`.
19. Existing creation and viewer tests remain green.
20. End-to-end smoke coverage for public `/packs` and authenticated pack administration.

Before completion, run the repository's relevant unit tests, lint, Next.js build, and E2E suite where the environment supports them.

## 19. Migration/deployment workflow

The implementation will include a new SQL migration under `supabase/migrations`.

The assistant must **not** execute the Supabase migration or deploy the site automatically.

Manual workflow after code review:

1. User commits/merges the code as desired.
2. User applies the provided Supabase migration manually.
3. User deploys/redeploys Vercel manually.
4. User creates a first test pack in `/admin`.
5. Verify `/packs` and `/packs/[slug]` in production.

No existing creation data should require migration or duplication.

## 20. Expected file-level shape

Exact names may change during planning, but implementation is expected to introduce or modify files in these areas:

- `supabase/migrations/...packs....sql`
- `lib/supabase/database.types.ts`
- `lib/packs/*` for pack types/mappers/public queries
- `lib/admin/*` for pack payload/query/remote mutations
- `app/api/admin/packs/route.ts`
- `app/packs/page.tsx`
- `app/packs/[slug]/page.tsx`
- `components/portfolio/*` for pack cards, mosaic, detail presentation
- `components/admin/*` for pack list/editor and admin section switching
- `components/portfolio/Header.tsx`
- `app/globals.css` and/or the existing portfolio fix stylesheet for pack-specific styling
- `__tests__/*` for pack domain/admin/components/E2E coverage

The existing creation viewer pipeline should not require redesign for this feature.

## 21. Acceptance criteria

The feature is complete when all of the following are true:

- `/creations` still contains only individual creations.
- `/packs` lists only published packs.
- `/packs/[slug]` presents the approved version-C layout.
- Pack cards/detail use manual cover when available and mosaic fallback otherwise.
- Pack mosaics do not create WebGL viewers.
- A creation can appear in multiple packs.
- A pack preserves administrator-defined creation order.
- Draft creations inside a published pack stay private and are excluded from counts.
- Deleting a pack never deletes its creations.
- Deleting a creation removes it from all packs automatically.
- Admin can create/edit/delete/reorder packs.
- Main navigation exposes `Packs`.
- Existing individual creation pages and viewer behavior remain functional.
- Migration and deployment remain manual user actions.
