# Blockbench Portfolio Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a polished Blockbench portfolio with static public pages and a development-only local admin that manages portfolio entries and images without a database.

**Architecture:** Next.js App Router reads portfolio data from `data/creations.json` at build/render time. Public pages are read-only and prerenderable; local admin mutation code is isolated behind development-only route handlers using Node filesystem APIs, with all writes rejected outside `development`. Images live under `public/models/<slug>/`, and the homepage is curated through `featured` plus `featuredOrder` fields.

**Tech Stack:** Next.js App Router, React, TypeScript, plain CSS/CSS Modules, Next Image, Node `fs/promises`, Vitest, React Testing Library, Playwright, Git, Vercel.

**Spec:** `docs/superpowers/specs/2026-09-20-blockbench-portfolio-design.md`

## Global Constraints

- The website is not an e-commerce platform and does not publicly expose `.bbmodel` downloads.
- The owner must be able to organize creations by category, choose homepage creations, control homepage ordering, and add/edit/delete entries locally without editing JSON manually.
- Main data file is exactly `data/creations.json`.
- Public images live under `public/models/<slug>/`.
- The admin is local-development-only in V1; no authentication is required.
- Production must not expose write-capable admin APIs.
- Only `published: true` creations are public.
- Only `featured: true` published creations can appear in Featured Creations.
- Featured entries sort by `featuredOrder` ascending, with deterministic fallback by creation date/name when missing or duplicated.
- Category filtering is client-side and data-driven.
- V1 includes category filtering, lightweight text search by creation name/tags, and optional tag filtering.
- Use WebP for most renders; PNG is allowed for transparency.
- Public `.bbmodel` downloads, 3D viewer, database, Supabase, customer accounts, comments, payments, analytics dashboard, multilingual CMS, and remote admin editing are out of scope.
- Recommended deployment is GitHub + Vercel.

## Review Focus

1. Malformed or incomplete creation records must never crash public pages; invalid records must fail validation during local writes and be ignored/reported safely during reads.
2. Duplicate slugs or IDs must be rejected so one creation can never overwrite another creation's data or images.
3. Slugs, filenames, and upload paths containing traversal sequences such as `../` must be rejected before any filesystem write.
4. Production requests to admin mutation routes must return a non-success response and must not mutate disk.
5. Featured ordering must remain deterministic when `featuredOrder` is missing or duplicated.

---

## File Map

```text
app/
  globals.css                         Global theme, typography, layout tokens
  layout.tsx                          Root metadata and shared shell
  page.tsx                            Homepage
  creations/
    page.tsx                          Public gallery route
    [slug]/page.tsx                   Static creation detail route
  admin/
    page.tsx                          Dev-only admin shell
  api/
    admin/
      creations/
        route.ts                      Dev-only create/update/delete endpoint
components/
  portfolio/
    Header.tsx                        Public navigation
    Hero.tsx                          Homepage hero
    CreationCard.tsx                  Reusable visual card
    FeaturedGrid.tsx                  Homepage curated grid
    CategoryShortcuts.tsx             Homepage/category navigation
    GalleryClient.tsx                 Client-side filter/search UI
    CreationGallery.tsx               Card grid wrapper
    ImageGallery.tsx                  Detail-page image viewer/gallery
    CreationMeta.tsx                  Tags/animations/technical metadata
  admin/
    AdminDashboard.tsx                Admin list + form orchestration
    CreationEditor.tsx                Create/edit form
    ImageField.tsx                    Local image selection/preview
    FeaturedControls.tsx              Featured toggle/order UI
lib/
  creations/
    types.ts                          Domain types and schemas
    validate.ts                       Runtime validation and normalization
    read.ts                           Read-only JSON selectors/sorting
    related.ts                        Related-creation scoring
  admin/
    guards.ts                         Development-only and path-safety checks
    storage.ts                        JSON/image filesystem mutations
    payload.ts                        FormData -> validated mutation payload
  utils/
    slug.ts                           Safe slug generation
    filenames.ts                      Safe filename normalization

data/
  creations.json                     Portfolio content
public/
  models/                             Creation image folders
    _placeholder/
      creation-placeholder.svg        Safe missing-image fallback
__tests__/
  creations/
    read.test.ts
    validate.test.ts
    related.test.ts
  admin/
    guards.test.ts
    storage.test.ts
    payload.test.ts
  components/
    GalleryClient.test.tsx
    CreationEditor.test.tsx
    FeaturedControls.test.tsx
  e2e/
    public-portfolio.spec.ts
    local-admin.spec.ts
vitest.config.ts
vitest.setup.ts
playwright.config.ts
README.md
```

---

### Task 1: Scaffold the app and lock the portfolio data contract

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `next.config.ts`
- Create: `app/layout.tsx`
- Create: `app/globals.css`
- Create: `data/creations.json`
- Create: `lib/creations/types.ts`
- Create: `lib/creations/validate.ts`
- Create: `lib/creations/read.ts`
- Create: `lib/utils/slug.ts`
- Create: `public/models/_placeholder/creation-placeholder.svg`
- Create: `vitest.config.ts`
- Create: `vitest.setup.ts`
- Test: `__tests__/creations/validate.test.ts`
- Test: `__tests__/creations/read.test.ts`

**Interfaces:**
- Produces: `Creation`, `CreationInput`, `validateCreation(input)`, `validateCreationList(input)`, `getAllCreations()`, `getPublishedCreations()`, `getFeaturedCreations()`, `getCreationBySlug(slug)`, `getCategories()`, `slugify(value)`.
- Consumes: none.

- [ ] **Step 1: Scaffold Next.js with TypeScript and the App Router**

Because the project directory already contains the approved docs, scaffold into a temporary sibling and copy the generated app files into the project without overwriting `docs/`:

```bash
cd /mnt/data
rm -rf blockbench-portfolio-scaffold
npx create-next-app@latest blockbench-portfolio-scaffold --ts --app --eslint --no-tailwind --src-dir=false --import-alias='@/*' --use-npm
rsync -a --exclude='.git' blockbench-portfolio-scaffold/ blockbench-portfolio/
rm -rf blockbench-portfolio-scaffold
cd /mnt/data/blockbench-portfolio
test -d .git || git init
npm install -D vitest @vitejs/plugin-react jsdom @testing-library/react @testing-library/jest-dom @testing-library/user-event
```

Keep the generated lockfile committed so dependency versions are pinned.

- [ ] **Step 2: Define the domain types**

Create `lib/creations/types.ts`:

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

export type CreationInput = Omit<Creation, 'id' | 'slug' | 'createdAt'> & {
  id?: string;
  slug?: string;
  createdAt?: string;
};
```

- [ ] **Step 3: Write failing validation tests**

Create `__tests__/creations/validate.test.ts` with cases for a valid record, empty name/category, unsafe slug, invalid image paths, invalid date, and duplicate ID/slug in a list:

```ts
import { describe, expect, it } from 'vitest';
import { validateCreation, validateCreationList } from '@/lib/creations/validate';

const base = {
  id: 'vorakh',
  slug: 'vorakh',
  name: 'Vorakh',
  category: 'Boss',
  tags: ['Ice'],
  description: 'Heavy ice boss.',
  coverImage: '/models/vorakh/cover.webp',
  images: ['/models/vorakh/front.webp'],
  animations: ['Idle'],
  featured: true,
  featuredOrder: 1,
  published: true,
  createdAt: '2026-09-20',
};

describe('validateCreation', () => {
  it('accepts a complete valid record', () => {
    expect(validateCreation(base)).toEqual(base);
  });

  it('rejects unsafe slugs', () => {
    expect(() => validateCreation({ ...base, slug: '../vorakh' })).toThrow(/slug/i);
  });

  it('rejects public image paths outside /models', () => {
    expect(() => validateCreation({ ...base, coverImage: '/private/a.webp' })).toThrow(/image/i);
  });
});

describe('validateCreationList', () => {
  it('rejects duplicate slugs', () => {
    expect(() => validateCreationList([base, { ...base, id: 'v2' }])).toThrow(/duplicate slug/i);
  });
});
```

- [ ] **Step 4: Run validation tests and confirm failure**

Run:

```bash
npm test -- --run __tests__/creations/validate.test.ts
```

Expected: FAIL because validation helpers do not exist yet.

- [ ] **Step 5: Implement deterministic validation and slug creation**

Create `lib/utils/slug.ts`:

```ts
export function slugify(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
```

Create `lib/creations/validate.ts` with explicit runtime checks. Require non-empty `name` and `category`; allow only slugs matching `/^[a-z0-9]+(?:-[a-z0-9]+)*$/`; require image paths to start with `/models/`; require ISO `YYYY-MM-DD`; normalize tags/animations to trimmed unique strings; and reject duplicate IDs/slugs in lists.

The exported signatures must be:

```ts
export function validateCreation(input: unknown): Creation;
export function validateCreationList(input: unknown): Creation[];
```

- [ ] **Step 6: Write failing read/sort tests including Review Focus #5**

Create `__tests__/creations/read.test.ts` and test pure selectors exported from `read.ts` using an injected array:

```ts
import { describe, expect, it } from 'vitest';
import { selectFeatured, selectPublished, sortNewestFirst } from '@/lib/creations/read';
import type { Creation } from '@/lib/creations/types';

const make = (patch: Partial<Creation>): Creation => ({
  id: patch.id ?? 'x',
  slug: patch.slug ?? 'x',
  name: patch.name ?? 'X',
  category: patch.category ?? 'Boss',
  tags: patch.tags ?? [],
  description: patch.description ?? '',
  coverImage: patch.coverImage ?? '/models/x/cover.webp',
  images: patch.images ?? [],
  animations: patch.animations ?? [],
  featured: patch.featured ?? false,
  featuredOrder: patch.featuredOrder,
  published: patch.published ?? true,
  createdAt: patch.createdAt ?? '2026-09-20',
});

it('never exposes unpublished creations', () => {
  expect(selectPublished([make({ id: 'a' }), make({ id: 'b', published: false })]).map(x => x.id)).toEqual(['a']);
});

it('sorts duplicate featured order deterministically by date then name', () => {
  const rows = [
    make({ id: 'b', slug: 'b', name: 'Beta', featured: true, featuredOrder: 1, createdAt: '2026-01-01' }),
    make({ id: 'a', slug: 'a', name: 'Alpha', featured: true, featuredOrder: 1, createdAt: '2026-02-01' }),
  ];
  expect(selectFeatured(rows).map(x => x.name)).toEqual(['Alpha', 'Beta']);
});
```

- [ ] **Step 7: Implement read helpers**

Create `lib/creations/read.ts`. Public selectors must never include unpublished records.

```ts
export function selectPublished(rows: Creation[]): Creation[];
export function selectFeatured(rows: Creation[]): Creation[];
export function sortNewestFirst(rows: Creation[]): Creation[];
export async function getAllCreations(): Promise<Creation[]>;
export async function getPublishedCreations(): Promise<Creation[]>;
export async function getFeaturedCreations(): Promise<Creation[]>;
export async function getCreationBySlug(slug: string): Promise<Creation | undefined>;
export async function getCategories(): Promise<string[]>;
```

`getAllCreations()` reads and parses `data/creations.json` using `validateCreationList`. `selectFeatured()` filters `published && featured`, sorts numeric `featuredOrder` first ascending, then `createdAt` descending, then `name` ascending.

- [ ] **Step 8: Seed the JSON file and placeholder asset**

Create `data/creations.json` as:

```json
[]
```

Create a simple neutral `public/models/_placeholder/creation-placeholder.svg` that can safely render when an image list is empty.

- [ ] **Step 9: Configure and run tests**

Add scripts to `package.json`:

```json
{
  "scripts": {
    "test": "vitest",
    "test:run": "vitest run"
  }
}
```

Configure `vitest.config.ts` with the `@` alias and `jsdom`, then run:

```bash
npm run test:run
```

Expected: all Task 1 tests PASS.

- [ ] **Step 10: Commit**

```bash
git add .
git commit -m "feat: scaffold portfolio data layer"
```

---

### Task 2: Build the premium public shell and curated homepage

**Files:**
- Modify: `app/layout.tsx`
- Modify: `app/globals.css`
- Create: `app/page.tsx`
- Create: `components/portfolio/Header.tsx`
- Create: `components/portfolio/Hero.tsx`
- Create: `components/portfolio/CreationCard.tsx`
- Create: `components/portfolio/FeaturedGrid.tsx`
- Create: `components/portfolio/CategoryShortcuts.tsx`
- Create: `components/portfolio/CreationGallery.tsx`

**Interfaces:**
- Consumes: `Creation`, `getFeaturedCreations()`, `getPublishedCreations()`, `getCategories()` from Task 1.
- Produces: reusable `CreationCard`, `CreationGallery`, and homepage sections used by later tasks.

- [ ] **Step 1: Create a sample fixture temporarily for visual development**

Add two valid temporary records to `data/creations.json` using `/models/_placeholder/creation-placeholder.svg` as the cover/gallery image so the visual layout can be exercised without requiring real portfolio assets yet. Mark them clearly as sample records and remove them before final delivery if the owner has not supplied real renders.

- [ ] **Step 2: Implement the root shell and design tokens**

`app/layout.tsx` must export metadata for a Blockbench/3D portfolio and render `<Header />` plus `<main>{children}</main>`.

In `app/globals.css`, define CSS variables for background, elevated background, text, muted text, border, radius, max content width, and spacing. Keep the palette dark and neutral; no Minecraft-style neon gradients or particle effects.

- [ ] **Step 3: Build `CreationCard`**

Use `next/image` with `fill`, responsive `sizes`, meaningful `alt`, and a stable aspect ratio. The card must show the image first, then name/category, and reveal tags subtly on hover/focus. Entire card links to `/creations/${creation.slug}`.

Signature:

```ts
type CreationCardProps = {
  creation: Creation;
  priority?: boolean;
};

export function CreationCard({ creation, priority = false }: CreationCardProps): JSX.Element;
```

- [ ] **Step 4: Build homepage sections**

`FeaturedGrid` renders the manually ordered featured array exactly as returned by `getFeaturedCreations()`. `CategoryShortcuts` links each data-driven category to `/creations?category=<encoded category>`.

Homepage flow:

```text
Header
Hero
Selected Work / FeaturedGrid
CategoryShortcuts
Latest Creations (up to 6, newest published)
Footer
```

- [ ] **Step 5: Add responsive behavior**

Implement desktop 3-column featured grid, tablet 2-column, mobile 1-column; keep cards touch-friendly and avoid hover-only access to essential metadata.

- [ ] **Step 6: Run lint/build**

```bash
npm run lint
npm run build
```

Expected: PASS, homepage prerenders without requiring a database or environment variables.

- [ ] **Step 7: Commit**

```bash
git add app components data public
git commit -m "feat: build curated portfolio homepage"
```

---

### Task 3: Add gallery search, category filters, and data-driven browsing

**Files:**
- Create: `app/creations/page.tsx`
- Create: `components/portfolio/GalleryClient.tsx`
- Test: `__tests__/components/GalleryClient.test.tsx`

**Interfaces:**
- Consumes: `Creation`, `getPublishedCreations()`, `getCategories()`, `CreationGallery`.
- Produces: `GalleryClient({ creations, categories, initialCategory })`.

- [ ] **Step 1: Write failing client-filter tests**

Create `__tests__/components/GalleryClient.test.tsx` with at least these cases:

```tsx
it('filters by category without navigation', async () => {
  // render with Boss + NPC fixtures
  // click Boss
  // assert Boss visible, NPC hidden
});

it('searches names and tags case-insensitively', async () => {
  // search "ice"
  // assert creation with tag Ice remains
});

it('shows a useful empty state', async () => {
  // search unmatched phrase
  // assert "No creations found" visible
});
```

- [ ] **Step 2: Run the tests and confirm failure**

```bash
npm test -- --run __tests__/components/GalleryClient.test.tsx
```

Expected: FAIL because `GalleryClient` does not exist.

- [ ] **Step 3: Implement `GalleryClient`**

Create a client component with state for `category`, `query`, and optional tag. Filtering rules:

```ts
const matchesCategory = category === 'All' || creation.category === category;
const haystack = [creation.name, ...creation.tags].join(' ').toLowerCase();
const matchesQuery = haystack.includes(query.trim().toLowerCase());
```

The visible list is `creations.filter(matchesCategory && matchesQuery)`. Controls must be keyboard accessible and buttons must expose selected state with `aria-pressed`.

- [ ] **Step 4: Implement `/creations` server page**

Read only published creations, pass category query param as the initial filter if it matches a known category, otherwise default to `All`.

- [ ] **Step 5: Run tests, lint, and build**

```bash
npm run test:run
npm run lint
npm run build
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add app/creations components/portfolio/GalleryClient.tsx __tests__/components/GalleryClient.test.tsx
git commit -m "feat: add portfolio filtering and search"
```

---

### Task 4: Build creation detail pages and related-work logic

**Files:**
- Create: `lib/creations/related.ts`
- Create: `app/creations/[slug]/page.tsx`
- Create: `components/portfolio/ImageGallery.tsx`
- Create: `components/portfolio/CreationMeta.tsx`
- Test: `__tests__/creations/related.test.ts`

**Interfaces:**
- Consumes: `Creation`, `getPublishedCreations()`, `getCreationBySlug()`.
- Produces: `getRelatedCreations(current, all, limit)`.

- [ ] **Step 1: Write failing related-work tests**

Create `__tests__/creations/related.test.ts` and assert:
- current creation is excluded;
- unpublished entries are excluded;
- same category scores above tag-only matches;
- shared tags break ties;
- result count obeys `limit`.

Expected signature:

```ts
export function getRelatedCreations(
  current: Creation,
  all: Creation[],
  limit?: number,
): Creation[];
```

- [ ] **Step 2: Implement deterministic related scoring**

Use this score:

```ts
const categoryScore = candidate.category === current.category ? 10 : 0;
const sharedTagScore = candidate.tags.filter(tag => current.tags.includes(tag)).length * 2;
const score = categoryScore + sharedTagScore;
```

Sort by score descending, then `createdAt` descending, then name ascending; return only positive-score matches up to `limit ?? 3`.

- [ ] **Step 3: Build the detail route with static params**

`app/creations/[slug]/page.tsx` must:
- export `generateStaticParams()` from published slugs;
- call `notFound()` for missing/unpublished entries;
- generate per-creation metadata;
- render cover, description, gallery, tags, animations, optional technical metadata, and related creations.

- [ ] **Step 4: Build `ImageGallery`**

The gallery must render the cover plus unique additional images, lazy-load below-fold images through `next/image`, preserve aspect ratios, and use useful alt text such as `${name} render 2`.

- [ ] **Step 5: Build `CreationMeta`**

Render optional metadata only when present. Never show empty labels for `software`, `modelType`, `version`, or `notes`.

- [ ] **Step 6: Run tests/build**

```bash
npm run test:run
npm run lint
npm run build
```

Expected: PASS and one static route per published sample creation.

- [ ] **Step 7: Commit**

```bash
git add app/creations/[slug] components/portfolio/ImageGallery.tsx components/portfolio/CreationMeta.tsx lib/creations/related.ts __tests__/creations/related.test.ts
git commit -m "feat: add creation detail pages"
```

---

### Task 5: Implement secure local filesystem mutations before building the admin UI

**Files:**
- Create: `lib/admin/guards.ts`
- Create: `lib/admin/storage.ts`
- Create: `lib/admin/payload.ts`
- Create: `lib/utils/filenames.ts`
- Test: `__tests__/admin/guards.test.ts`
- Test: `__tests__/admin/storage.test.ts`
- Test: `__tests__/admin/payload.test.ts`

**Interfaces:**
- Consumes: `Creation`, `CreationInput`, `validateCreationList()`, `slugify()`.
- Produces: `assertDevelopmentWriteEnabled()`, `assertSafeSlug()`, `safeImageFilename()`, `parseCreationFormData()`, `createCreation()`, `updateCreation()`, `deleteCreation()`.

- [ ] **Step 1: Write failing environment/path guard tests for Review Focus #3 and #4**

`__tests__/admin/guards.test.ts` must assert:

```ts
it('rejects writes when NODE_ENV is not development', () => { /* ... */ });
it.each(['../x', 'a/b', '/abs', 'x..'])('rejects unsafe slug %s', (slug) => { /* ... */ });
it.each(['../a.webp', 'a/b.webp', '/tmp/a.webp'])('rejects unsafe filename %s', (name) => { /* ... */ });
```

Do not actually mutate `process.env.NODE_ENV` unsafely across tests; isolate environment checks behind a pure helper accepting an optional environment argument:

```ts
export function isDevelopmentWriteEnabled(env = process.env.NODE_ENV): boolean;
```

- [ ] **Step 2: Implement guards and filename normalization**

`assertSafeSlug(slug)` only accepts `/^[a-z0-9]+(?:-[a-z0-9]+)*$/`.

`safeImageFilename(originalName)` must:
- call `path.basename()`;
- reject path separators and `..` in the original value;
- slugify the base name;
- allow extensions `.webp`, `.png`, `.jpg`, `.jpeg`, `.gif` only;
- return a deterministic lowercase filename.

- [ ] **Step 3: Write failing storage tests for duplicate IDs/slugs and deterministic JSON**

Use a temporary directory created via `fs.mkdtemp()` and inject paths into storage helpers rather than touching the real project in unit tests.

Storage signatures:

```ts
type StoragePaths = { dataFile: string; modelsDir: string };

export async function createCreation(
  input: CreationInput,
  files: File[],
  paths?: StoragePaths,
): Promise<Creation>;

export async function updateCreation(
  originalId: string,
  input: CreationInput,
  files: File[],
  paths?: StoragePaths,
): Promise<Creation>;

export async function deleteCreation(
  id: string,
  paths?: StoragePaths,
): Promise<void>;
```

Tests must verify:
- duplicate slug and duplicate ID reject;
- generated JSON uses 2-space indentation plus trailing newline;
- deleting one creation does not delete another creation's folder;
- renaming a slug moves only its own image directory;
- invalid creation data never writes partial JSON.

- [ ] **Step 4: Implement atomic JSON writes**

Write to `${dataFile}.tmp`, then `rename()` over the destination only after validation succeeds. Sort records deterministically by `createdAt` descending then name ascending before serialization.

- [ ] **Step 5: Implement image writes**

For each `File`, use `Buffer.from(await file.arrayBuffer())` and write under `public/models/<safeSlug>/<safeFilename>`. Reject files over 10 MB and non-image MIME types before writing.

- [ ] **Step 6: Write and implement FormData parsing tests**

Expected multipart fields:

```text
payload       JSON string matching CreationInput
images        zero or more File values
originalId    required only for update
```

`parseCreationFormData(formData)` returns:

```ts
{
  input: CreationInput;
  images: File[];
  originalId?: string;
}
```

Malformed JSON, wrong file types, missing required fields, or more than 20 images must throw descriptive errors.

- [ ] **Step 7: Run admin-domain tests**

```bash
npm test -- --run __tests__/admin
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add lib/admin lib/utils/filenames.ts __tests__/admin
git commit -m "feat: add safe local portfolio storage"
```

---

### Task 6: Build the development-only admin interface

**Files:**
- Create: `app/admin/page.tsx`
- Create: `app/api/admin/creations/route.ts`
- Create: `components/admin/AdminDashboard.tsx`
- Create: `components/admin/CreationEditor.tsx`
- Create: `components/admin/ImageField.tsx`
- Create: `components/admin/FeaturedControls.tsx`
- Test: `__tests__/components/CreationEditor.test.tsx`
- Test: `__tests__/components/FeaturedControls.test.tsx`

**Interfaces:**
- Consumes: all Task 5 mutation APIs and Task 1 read APIs.
- Produces: local admin CRUD workflow; POST/PUT/DELETE `/api/admin/creations`.

- [ ] **Step 1: Write failing form behavior tests**

Test that:
- name and category are required;
- changing name auto-suggests slug until slug is manually edited;
- Featured toggle reveals `featuredOrder`;
- save serializes `payload` plus selected image files into `FormData`;
- delete requires a confirmation click before issuing DELETE.

- [ ] **Step 2: Implement `FeaturedControls`**

Signature:

```ts
type FeaturedControlsProps = {
  featured: boolean;
  featuredOrder?: number;
  onChange: (next: { featured: boolean; featuredOrder?: number }) => void;
};
```

If featured is false, hide/disable the order input and emit `featuredOrder: undefined`.

- [ ] **Step 3: Implement `ImageField`**

Accept multiple images, show browser previews with `URL.createObjectURL`, revoke URLs on cleanup, and display filename + size. Do not attempt to copy files directly from the browser; copying occurs only in the local route handler.

- [ ] **Step 4: Implement `CreationEditor`**

Fields:
- name;
- slug;
- category;
- tags as comma-separated UI converted to string[];
- description;
- animations as comma-separated UI converted to string[];
- published;
- featured + featuredOrder;
- optional software/modelType/version/notes;
- images.

On submit:

```ts
const formData = new FormData();
formData.set('payload', JSON.stringify(input));
for (const image of images) formData.append('images', image);
```

Use POST for create and PUT for edit.

- [ ] **Step 5: Implement the development-only route handler**

`app/api/admin/creations/route.ts` exports `POST`, `PUT`, and `DELETE`.

Every handler starts with:

```ts
if (process.env.NODE_ENV !== 'development') {
  return Response.json({ error: 'Admin writes are disabled.' }, { status: 404 });
}
```

Then parse/validate, call storage helper, and return JSON. Convert expected validation conflicts to 400/409; unexpected errors return 500 without leaking filesystem paths.

- [ ] **Step 6: Implement `/admin` as development-only**

In `app/admin/page.tsx`:

```ts
import { notFound } from 'next/navigation';

export default async function AdminPage() {
  if (process.env.NODE_ENV !== 'development') notFound();
  // load all creations, including unpublished, and render AdminDashboard
}
```

`AdminDashboard` shows a searchable list, Add button, Edit button, Featured star, publish state, and Delete action. After successful mutations, refresh local state from the returned records or `router.refresh()`.

- [ ] **Step 7: Run component tests and production guard verification**

```bash
npm run test:run
NODE_ENV=production npm run build
```

Then start production locally and verify `/admin` and `/api/admin/creations` do not expose a working admin surface.

- [ ] **Step 8: Commit**

```bash
git add app/admin app/api/admin components/admin __tests__/components
git commit -m "feat: add local portfolio admin"
```

---

### Task 7: Add browser-level verification, polish, and deployment documentation

**Files:**
- Create: `playwright.config.ts`
- Create: `__tests__/e2e/public-portfolio.spec.ts`
- Create: `__tests__/e2e/local-admin.spec.ts`
- Modify: `package.json`
- Modify: `README.md`
- Modify: `app/globals.css`
- Modify: relevant public/admin components for accessibility fixes discovered during browser checks

**Interfaces:**
- Consumes: complete V1.
- Produces: verified local workflow and documented deployment process.

- [ ] **Step 1: Install Playwright and add scripts**

```bash
npm install -D @playwright/test
npx playwright install chromium
```

Add:

```json
{
  "scripts": {
    "test:e2e": "playwright test",
    "check": "npm run test:run && npm run lint && npm run build && npm run test:e2e"
  }
}
```

- [ ] **Step 2: Write public E2E coverage**

`public-portfolio.spec.ts` must verify:
- homepage loads with hero and Selected Work section;
- `/creations` filters without full-page navigation;
- text search finds a matching name/tag;
- creation detail route renders gallery/meta;
- an unpublished fixture is not reachable publicly;
- mobile viewport has no horizontal overflow.

- [ ] **Step 3: Write local admin E2E coverage**

Run this suite against `npm run dev`. Verify:
- `/admin` opens in development;
- creating a temporary creation through the form updates the list;
- toggling Featured and setting an order persists after refresh;
- editing works;
- deleting removes the temporary creation;
- upload of a small generated PNG succeeds;
- a filename such as `../escape.png` is rejected by the server-side path guard test layer (browser file inputs normalize names, so this exact traversal case remains a unit test rather than an E2E upload).

The E2E suite must clean up its temporary creation in `afterEach`/`finally` so it does not pollute `data/creations.json`.

- [ ] **Step 4: Document the owner workflow**

`README.md` must contain exactly the practical flow the owner needs:

```text
npm install
npm run dev
open http://localhost:3000/admin
add/edit creations
verify http://localhost:3000
commit changes
git push
Vercel deploys automatically
```

Also document where images and JSON live, and state clearly that admin editing is intentionally unavailable on the deployed site.

- [ ] **Step 5: Final accessibility/responsive pass**

Using browser checks, verify:
- visible keyboard focus;
- sufficient text/background contrast;
- descriptive image alts;
- buttons have labels;
- filters are usable at 320px width;
- gallery cards do not shift excessively while images load;
- motion respects `prefers-reduced-motion`.

- [ ] **Step 6: Run the full verification suite**

```bash
npm run check
```

Expected: unit tests PASS, lint PASS, production build PASS, public E2E PASS, local-admin E2E PASS.

- [ ] **Step 7: Confirm no production write surface**

With a production server running, manually request:

```bash
curl -i http://localhost:3000/admin
curl -i -X POST http://localhost:3000/api/admin/creations
```

Expected: `/admin` is 404/not found and the mutation endpoint returns 404/non-success. No filesystem change occurs.

- [ ] **Step 8: Final commit**

```bash
git add .
git commit -m "chore: verify and document portfolio v1"
```

---

## Self-review notes

- **Spec coverage:** Homepage curation, public gallery, detail pages, category/search filtering, local CRUD admin, image management, development-only writes, responsive design, related creations, Git/Vercel workflow, and all V1 exclusions are assigned to tasks above.
- **Placeholder scan:** No implementation step relies on TBD/TODO language; each task specifies concrete files, signatures, tests, and commands.
- **Type consistency:** `Creation`/`CreationInput`, read helper names, related-work signature, and admin storage signatures are defined once and reused consistently.
- **Review Focus coverage:** malformed data and duplicate records are covered in Task 1/5 validation tests; traversal and production write guards in Task 5/6; deterministic featured ordering in Task 1.
