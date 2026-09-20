# Blockbench Portfolio

Dark Next.js portfolio for showcasing Blockbench creations. The public site is read-only; the production `/admin` is authenticated and stores portfolio content in Supabase.

## Architecture

- **Vercel** — Next.js hosting and deployments.
- **Supabase Postgres** — creation metadata.
- **Supabase Auth** — private administrator login.
- **`portfolio-renders` Storage bucket** — public render images.
- **`bbmodels` Storage bucket** — private Blockbench source files protected by RLS.

`.bbmodel` files are never linked from public pages and are only downloaded through an authenticated admin route.

## Environment variables

Add these variables locally in `.env.local` and in Vercel for Production/Preview:

```text
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
```

The publishable key is intentionally safe for browser use because database and Storage access is enforced by RLS. Never expose a Supabase secret/service-role key as `NEXT_PUBLIC_*`.

## Run locally

```bash
npm install
npm run dev
```

Then open:

- `http://localhost:3000` — public homepage
- `http://localhost:3000/creations` — searchable portfolio
- `http://localhost:3000/admin` — authenticated portfolio manager

## Add a creation online

1. Visit `/admin` on the deployed site.
2. Sign in with the authorized admin account.
3. Click **New creation**.
4. Fill in name, category, tags, description and optional technical metadata.
5. Add render images (PNG/JPEG/WebP/AVIF, max 10 MB each).
6. Optionally attach one `.bbmodel` source (max 50 MB). It stays private.
7. Choose **Published** and optionally **Featured** + Featured order.
8. Save. The database and Storage update immediately; no Git commit is required for content changes.

The first render uploaded for a new creation becomes its cover. Further images join the gallery.

## Private `.bbmodel` behavior

- private Storage bucket;
- RLS requires the current Auth UUID to exist in `admin_users`;
- no `getPublicUrl()` or public signed URL;
- download/remove/replace actions are available only in `/admin`;
- public creation queries do not select `.bbmodel` path, filename or size.

## Featured homepage

Homepage curation remains manual:

- the creation must be Published;
- Featured must be enabled;
- lower Featured order values appear first;
- ties fall back deterministically to date/name.

## Migration backup

`data/creations.json` is retained only as the original V1 migration backup. Runtime pages no longer read or write it.

## Useful commands

```bash
npm run dev
npm run test:run
npm run lint
npm run build
npm run test:e2e
npm run verify:source
npm run check
```

## Supabase schema

Versioned SQL lives in `supabase/migrations/`. The migration creates `creations`, `creation_images`, `admin_users`, RLS policies, the public render bucket and the private `.bbmodel` bucket.
