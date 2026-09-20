# Blockbench Portfolio

A simple dark portfolio for showcasing Blockbench creations. Public pages are read-only. The local `/admin` interface edits `data/creations.json` and copies render images into `public/models/`.

## Start locally

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

Then visit:

- `http://localhost:3000` — homepage with manually curated Featured creations
- `http://localhost:3000/creations` — searchable/filterable portfolio
- `http://localhost:3000/admin` — local portfolio manager

## How to add a creation

1. Run `npm run dev`.
2. Open `http://localhost:3000/admin`.
3. Click **New creation**.
4. Fill in the name and category. The slug is suggested automatically.
5. Add tags, a description, animations and render images.
6. Keep **Published** checked if the creation should be public.
7. Turn on **Featured** and choose a Featured order if it should appear on the homepage.
8. Click **Save creation**.
9. Check the public site, then commit and push the generated file changes.

The first uploaded image becomes the cover for a new creation. Additional images are shown in its project gallery.

## Where the content lives

```text
data/creations.json           portfolio metadata
public/models/<slug>/         uploaded render images
public/models/_placeholder/   fallback placeholder
```

You normally do not need to edit `data/creations.json` by hand. The local admin does that for you.

## Important: admin is intentionally local-only

The local dev server binds to `127.0.0.1` by default so the unauthenticated admin is not exposed to your LAN.

The deployed production site does **not** expose the admin page or write API. `/admin` returns Not Found in production, and POST/PUT/DELETE requests to `/api/admin/creations` return a non-success response.

This is intentional: it keeps the site simple and avoids a database, authentication provider, CMS or cloud storage account.

## Categories

Categories are data-driven. Type an existing category in the admin or enter a new one. Public filter buttons are generated automatically from published creations.

## Featured homepage

Homepage curation is completely manual:

- `Published` must be enabled.
- `Featured` must be enabled.
- lower `Featured order` numbers appear first.
- ties are resolved deterministically by date and then name.

## Deployment with GitHub + Vercel

1. Create a GitHub repository and push this project.
2. Import the repository into Vercel.
3. Framework preset: **Next.js**.
4. No environment variables or database credentials are required.
5. Every future Git push triggers a new deployment.

## Useful commands

```bash
npm run dev       # local site + local admin
npm run test:run  # unit/component tests
npm run lint      # ESLint
npm run build     # production build
npm run test:e2e  # Playwright browser tests
npm run check     # full verification suite
```

## Sample entries

The repository starts with three sample portfolio entries — Vorakh, Sakura Bow and Alchemist NPC — using a neutral placeholder image so the layout is visible immediately. Replace their placeholder renders from `/admin`, edit them, or delete them.

## What V1 intentionally does not include

No public `.bbmodel` downloads, database, Supabase, remote admin, payments, customer accounts, comments, analytics dashboard or embedded 3D viewer.
