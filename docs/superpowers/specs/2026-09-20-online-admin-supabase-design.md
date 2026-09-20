# Blockbench Portfolio — Online Admin + Private `.bbmodel` Design Specification

Date: 2026-09-20

## 1. Goal

Upgrade the existing Blockbench portfolio so the owner can manage the portfolio directly from the deployed website instead of running a local admin.

The public portfolio remains a read-only showcase. The owner gets a protected online admin where they can:

- sign in with e-mail + password;
- create a new portfolio entry;
- edit or delete an existing entry;
- upload public renders/images;
- upload one private `.bbmodel` source file per creation;
- choose whether a creation is published;
- choose whether a creation appears on the homepage;
- control Featured ordering;
- download or replace the private `.bbmodel` only while authenticated as the authorized administrator.

A `.bbmodel` file must never be exposed through a public URL, public page, public API response, repository file, or unauthenticated storage policy.

## 2. Existing system being migrated

Current application:

- Next.js App Router deployed on Vercel;
- public pages already exist at `/`, `/creations`, and `/creations/[slug]`;
- portfolio content currently comes from `data/creations.json`;
- public renders currently live under `public/models/`;
- `/admin` currently writes local files and is intentionally disabled in production.

The migration must preserve the existing public visual design and user-facing portfolio behavior unless a change is required for remote persistence.

## 3. Proposed architecture

### Hosting

- **Vercel** continues to host the Next.js application.
- **Supabase** provides Auth, Postgres, and Storage.

### Supabase responsibilities

- **Auth**: one authorized administrator using e-mail + password.
- **Database**: creation metadata and gallery records.
- **Public Storage bucket**: portfolio renders/images.
- **Private Storage bucket**: `.bbmodel` source files.

### Next.js responsibilities

- public Server Components read published records from Supabase;
- admin pages require an authenticated authorized user;
- admin mutations use Server Actions or Route Handlers with the signed-in user's Supabase session;
- no Supabase secret/service-role key is exposed to the browser;
- the public site receives no private `.bbmodel` storage paths unless strictly needed server-side, and never receives downloadable URLs for them.

## 4. Authentication and authorization

### Login

Route:

`/admin/login`

Fields:

- e-mail;
- password.

Authentication uses Supabase Auth e-mail/password sign-in.

### Session handling

Use the current Supabase SSR pattern for Next.js:

- `@supabase/supabase-js`;
- `@supabase/ssr`;
- browser client for client-side auth UI;
- request-scoped server client for Server Components / Server Actions;
- Next.js `proxy.ts` for session refresh;
- use `supabase.auth.getClaims()` or an equivalent server-validated identity check for route protection rather than trusting an unvalidated session object.

### Single-admin authorization

Authentication alone is not authorization.

Create an `admin_users` table keyed by Supabase Auth user UUID:

```sql
admin_users
- user_id uuid primary key references auth.users(id) on delete cascade
- created_at timestamptz not null default now()
```

Only a UUID explicitly present in `admin_users` is considered an administrator.

Do not authorize based on:

- user-provided metadata;
- client state;
- e-mail string alone;
- `TO authenticated` alone.

The first administrator account is created manually in Supabase Auth and its UUID is inserted once into `admin_users` during setup.

There is no public sign-up UI.

## 5. Database model

### `creations`

```text
id                uuid primary key default gen_random_uuid()
slug              text unique not null
name              text not null
category          text not null
tags              text[] not null default '{}'
description       text not null default ''
animations        text[] not null default '{}'
featured          boolean not null default false
featured_order    integer null
published         boolean not null default true
created_at        date not null default current_date
updated_at        timestamptz not null default now()
software          text null
model_type        text null
version           text null
notes             text null
cover_image_path  text null
bbmodel_path      text null
bbmodel_filename  text null
bbmodel_size      bigint null
```

Rules:

- `slug` must use a restricted safe format such as `^[a-z0-9]+(?:-[a-z0-9]+)*$`;
- `featured_order` is only meaningful when `featured = true`;
- public queries only return `published = true` records;
- public portfolio code must not expose `bbmodel_path`, `bbmodel_filename`, or `bbmodel_size` unless an authenticated admin page explicitly requests them.

### `creation_images`

```text
id            uuid primary key default gen_random_uuid()
creation_id   uuid not null references creations(id) on delete cascade
storage_path  text not null
alt_text      text not null default ''
sort_order    integer not null default 0
created_at    timestamptz not null default now()
```

### `admin_users`

As described in the authorization section.

## 6. Storage model

### Public bucket: `portfolio-renders`

Purpose:

- cover images;
- gallery renders;
- screenshots;
- PNG/WebP/JPEG assets used on public portfolio pages.

Recommended path format:

```text
<creation-id>/cover.webp
<creation-id>/gallery/<uuid>.webp
```

The bucket may be public for reads.

Write operations must remain restricted to the authorized admin via Storage RLS policies.

### Private bucket: `bbmodels`

Purpose:

- original `.bbmodel` source files only.

Recommended path format:

```text
<creation-id>/<safe-filename>.bbmodel
```

Requirements:

- bucket is private;
- anonymous users receive no SELECT/INSERT/UPDATE/DELETE access;
- ordinary authenticated users are not sufficient;
- all operations require the current user's UUID to exist in `admin_users`;
- the public site never calls `getPublicUrl` for this bucket;
- no public signed URL is generated;
- admin download should use authenticated storage download while the admin session is valid;
- replacing a file should delete or overwrite the previous object safely only after authorization succeeds.

## 7. RLS policy design

Enable RLS on every exposed application table.

### `creations`

Anonymous/public:
- SELECT only rows with `published = true`.

Authorized admin:
- SELECT all rows;
- INSERT;
- UPDATE with both `USING` and `WITH CHECK` authorization predicates;
- DELETE.

The authorization predicate is based on existence of the current `auth.uid()` in `admin_users`.

### `creation_images`

Anonymous/public:
- SELECT image metadata only when the parent creation is published.

Authorized admin:
- SELECT/INSERT/UPDATE/DELETE.

### `admin_users`

- no anonymous access;
- an authenticated user may only establish whether their own UUID exists;
- no browser/client policy permits adding another admin;
- adding/removing admins is a setup/maintenance operation performed through trusted database administration, not the portfolio UI.

### Storage policies

`portfolio-renders`:
- public reads allowed;
- writes/deletes restricted to admin.

`bbmodels`:
- all operations restricted to admin;
- no anonymous read policy.

Do not solve permission problems by exposing a service-role key or by adding broad `authenticated` policies.

## 8. Admin routes and UX

### `/admin/login`

Contains:
- e-mail;
- password;
- Sign in button;
- compact error state for invalid credentials.

If already authenticated and authorized, redirect to `/admin`.

### `/admin`

Dashboard list showing:
- cover thumbnail;
- name;
- category;
- Published state;
- Featured state;
- Featured order;
- whether a private `.bbmodel` is attached;
- Edit action;
- Delete action;
- `+ New creation` action;
- Sign out action.

### `/admin/new`

Creation form fields:
- Name;
- Slug;
- Category;
- Tags;
- Description;
- Animations;
- Software;
- Model Type;
- Version;
- Notes;
- Published toggle;
- Featured toggle;
- Featured Order;
- Cover image upload;
- Gallery image uploads;
- `.bbmodel` upload.

### `/admin/[id]/edit`

Same form pre-populated, plus:
- reorder gallery;
- remove individual gallery images;
- replace cover image;
- current `.bbmodel` filename/size;
- Download private `.bbmodel`;
- Replace private `.bbmodel`;
- Remove private `.bbmodel`.

### Delete flow

Deleting a creation must require an explicit confirmation step.

Deletion should remove:
1. database row;
2. child gallery records via cascade;
3. public render objects;
4. private `.bbmodel` object.

If remote object cleanup partially fails, report the failure clearly and avoid silently claiming that all files were deleted.

## 9. File validation

### `.bbmodel`

Admin upload rules:
- extension must be `.bbmodel` case-insensitively;
- filename is sanitized before becoming a storage path;
- configurable maximum upload size, with an initial target of 50 MB unless the actual Supabase project limit requires a lower value;
- only one active `.bbmodel` attachment per creation in V1;
- replacing the file updates metadata only after upload succeeds.

Do not trust MIME type alone because browser MIME reporting for `.bbmodel` may be generic.

### Images

Allow expected web image types only:
- `image/png`;
- `image/jpeg`;
- `image/webp`;
- optionally `image/avif`.

Keep the existing 10 MB-per-image limit unless changed deliberately during implementation.

## 10. Public site behavior

The public UI remains conceptually unchanged.

### `/`
- manually curated Featured creations;
- `featured = true` and `published = true` only;
- order by `featured_order` ascending;
- deterministic fallback by date/name when order is missing or tied.

### `/creations`
- published records only;
- category filtering;
- text/tag search;
- no `.bbmodel` information.

### `/creations/[slug]`
- published record only;
- cover/gallery images from Supabase Storage;
- description, tags, animations and technical metadata;
- related creations;
- no indication that a `.bbmodel` file exists;
- no download action.

## 11. Data access boundary

Create explicit public/admin query boundaries.

Examples:

```text
lib/creations/public.ts
- getPublishedCreations()
- getFeaturedCreations()
- getCreationBySlug()
- getCategories()

lib/admin/creations.ts
- getAllCreationsForAdmin()
- createCreation()
- updateCreation()
- deleteCreation()
```

The public query layer selects only public columns rather than `select('*')`.

The admin layer may access private attachment metadata after authorization.

## 12. Migration from current JSON system

Current sample records:
- Vorakh;
- Sakura Bow;
- Alchemist NPC.

Migration sequence:
1. create Supabase project configuration;
2. create Auth admin account;
3. create tables and RLS policies;
4. create Storage buckets and policies;
5. insert the authorized admin UUID into `admin_users`;
6. import current JSON creation rows into `creations`;
7. migrate real public render assets into `portfolio-renders`;
8. migrate gallery records into `creation_images`;
9. change public reads from JSON/filesystem to Supabase;
10. replace the local-only `/admin` with authenticated online admin pages;
11. remove or retire filesystem write helpers;
12. keep a migration backup of `data/creations.json` until production is verified;
13. after verification, JSON stops being a runtime source of truth.

## 13. Environment configuration

Vercel requires at minimum:

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
```

Use the current Supabase publishable key model.

No service-role/secret key is required in the browser and none should be prefixed with `NEXT_PUBLIC_`.

## 14. Caching and freshness

Admin changes should appear on public pages immediately or near-immediately.

Prefer correctness and simplicity over aggressive caching in V1.

## 15. Error handling

Admin mutations must show useful errors for:
- invalid credentials;
- unauthorized user;
- duplicate slug;
- invalid required fields;
- image upload failure;
- `.bbmodel` upload failure;
- database insert/update failure;
- partial deletion failure;
- lost/expired session.

A failed `.bbmodel` upload must not create a database record that claims a private file exists when it does not.

## 16. Security constraints

Mandatory:
- RLS enabled on exposed tables;
- `.bbmodel` bucket private;
- no public `.bbmodel` signed URLs;
- no service-role key in browser code;
- no authorization based on user-editable metadata;
- no authorization based only on authenticated role;
- server-side admin pages verify authenticated identity;
- all storage object paths derive from validated IDs/slugs/filenames;
- no user-controlled path traversal;
- no public sign-up flow;
- public queries select only public fields;
- dependencies are pinned/lockfile committed when Supabase packages are introduced.

## 17. Testing requirements

### Unit tests
- safe slug validation;
- `.bbmodel` extension validation;
- public mapping excludes private fields;
- Featured ordering;
- image filename/path sanitization;
- form normalization.

### Integration tests
- anonymous user can read published creations;
- anonymous user cannot read draft creations;
- anonymous user cannot access `bbmodels`;
- non-admin authenticated user cannot mutate creations;
- authorized admin can CRUD creations;
- authorized admin can upload/download/delete `.bbmodel`;
- public image reads work;
- admin-only image writes work.

### E2E
1. admin login;
2. create creation with image + `.bbmodel`;
3. verify creation appears publicly when Published is enabled;
4. verify no `.bbmodel` link exists publicly;
5. edit Featured/order;
6. download `.bbmodel` from admin;
7. delete creation;
8. verify unauthenticated `/admin` redirects to login.

## 18. Out of scope

Do not add yet:
- public `.bbmodel` downloads;
- customer/user accounts;
- multiple admin roles or invitations;
- payments;
- comments;
- likes/favorites;
- 3D `.bbmodel` rendering in-browser;
- automatic conversion from `.bbmodel` to GLB;
- version history for multiple `.bbmodel` revisions;
- analytics dashboard;
- complex CMS workflows.

## 19. Success criteria

The migration is successful when:
- the owner can log into `/admin` with e-mail + password;
- the owner can create a complete portfolio entry without touching GitHub or local files;
- uploaded renders persist across Vercel deployments;
- uploaded `.bbmodel` files persist across deployments and remain private;
- anonymous users cannot access `.bbmodel` objects directly or indirectly;
- existing public portfolio pages continue to work with Supabase;
- Featured homepage selection remains manually controlled;
- JSON/local filesystem writes are no longer required;
- a Vercel redeploy cannot erase admin-uploaded data or files.
