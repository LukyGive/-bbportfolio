# Blockbench Portfolio — Design Specification

Date: 2026-09-20

## 1. Goal

Build a simple, visually premium portfolio website for showcasing Blockbench creations. The website is not an e-commerce platform and does not publicly expose `.bbmodel` downloads.

The owner must be able to:
- organize creations by category;
- choose which creations appear on the homepage;
- control homepage ordering;
- add, edit and delete portfolio entries from a local admin interface;
- manage images, descriptions, tags and animation information without editing JSON manually.

The public site must remain static and easy to host.

## 2. Product scope

### Public pages

#### `/`
Homepage containing:
- minimal hero section;
- manually selected Featured Creations;
- category shortcuts;
- optional Latest Creations section.

Featured content is not automatic. Each creation has a `featured` field and a `featuredOrder` value controlled by the owner.

#### `/creations`
Portfolio gallery with:
- All filter;
- NPC;
- Bosses;
- Mobs;
- Items;
- Weapons;
- Tools;
- Armor.

The category system must be data-driven so new categories can be added later without redesigning the site.

Filters should work client-side and without reloading the page.

#### `/creations/[slug]`
Individual project page containing:
- large cover image;
- creation name;
- category;
- tags;
- description;
- image gallery;
- animation list;
- technical information;
- related creations from the same category or shared tags.

No public `.bbmodel` download button in V1.

### Local admin

#### `/admin`
The admin interface is intended for local development use only.

It must provide:
- creation list;
- Add Creation;
- Edit Creation;
- Delete Creation;
- image selection/upload into the local project;
- category selection;
- tags;
- description;
- animation list;
- publish/unpublish state;
- Featured toggle;
- Featured order field;
- creation ordering where useful.

Because the admin is local-only in V1, no authentication is required.

The production build must not expose write-capable admin APIs.

## 3. Data model

Main data file:

`data/creations.json`

Example entry:

```json
{
  "id": "vorakh",
  "slug": "vorakh",
  "name": "Vorakh",
  "category": "Boss",
  "tags": ["Ice", "Fantasy", "Golem"],
  "description": "Heavy ice boss created for Minecraft.",
  "coverImage": "/models/vorakh/cover.webp",
  "images": [
    "/models/vorakh/front.webp",
    "/models/vorakh/back.webp"
  ],
  "animations": ["Idle", "Walk", "Attack"],
  "featured": true,
  "featuredOrder": 1,
  "published": true,
  "createdAt": "2026-09-20"
}
```

Optional V1 metadata:
- `software`: `Blockbench`;
- `modelType`: `Entity`, `Item`, etc.;
- `version`;
- `notes`.

These should remain optional so data entry stays lightweight.

## 4. File structure

Proposed structure:

```text
app/
  page.tsx
  creations/
    page.tsx
    [slug]/page.tsx
  admin/
    page.tsx
components/
  portfolio/
  admin/
data/
  creations.json
lib/
  creations.ts
public/
  models/
    <slug>/
      cover.webp
      ...
```

Admin write helpers should remain isolated from public read helpers.

## 5. Local admin write strategy

The public site reads `data/creations.json`.

During local development, `/admin` can call a development-only route or server action that:
- validates submitted fields;
- writes the JSON file;
- copies uploaded images into `public/models/<slug>/`;
- prevents path traversal;
- rejects unsafe filenames;
- creates slugs safely;
- keeps JSON formatting deterministic.

Production behavior:
- write endpoints must be disabled outside development;
- `/admin` can either display a disabled notice or be excluded/hidden in production.

This avoids needing Supabase, Firebase, a database, or GitHub APIs.

## 6. Visual direction

Style:
- dark;
- premium;
- gaming/3D art portfolio rather than Minecraft-server UI;
- large imagery;
- generous spacing;
- subtle motion;
- minimal borders;
- responsive layouts.

Homepage concept:

```text
┌──────────────────────────────────────────────┐
│ LOGO / NAME                  WORK   ABOUT     │
│                                              │
│       BLOCKBENCH CREATIONS                   │
│       Custom 3D models & assets              │
│                                              │
│                 [Explore Work]               │
│                                              │
├──────────────────────────────────────────────┤
│ SELECTED WORK                                │
│                                              │
│  [ Large Card ] [ Large Card ] [ Large Card ]│
│                                              │
├──────────────────────────────────────────────┤
│ CATEGORIES                                   │
│ NPC • BOSSES • ITEMS • ARMOR • ...          │
└──────────────────────────────────────────────┘
```

Creation cards should prioritize the render over metadata.

Hover behavior:
- slight image scale;
- category/tag reveal;
- smooth transition;
- no excessive glow or particle effects.

## 7. Homepage curation

Homepage featured content must always be manually controlled.

Rules:
1. only `published: true` creations can appear publicly;
2. only `featured: true` entries can appear in Featured Creations;
3. Featured entries sort by `featuredOrder` ascending;
4. missing or duplicate `featuredOrder` values fall back to creation date/name deterministically.

The admin should make Featured status obvious using a star/toggle.

## 8. Search and filtering

V1 should include:
- category filter;
- tag filtering if useful;
- lightweight text search by creation name and tags.

No server-side search service is needed.

## 9. Images

Preferred web formats:
- WebP for most renders;
- PNG allowed where transparency is required.

The site should use responsive image loading and lazy-load gallery images below the fold.

V1 does not need automatic image optimization pipelines beyond what Next.js provides.

## 10. Responsive behavior

Desktop:
- multi-column gallery;
- large featured cards;
- spacious detail pages.

Tablet:
- 2-column layout where practical.

Mobile:
- single-column detail layout;
- 1–2 column card gallery depending on width;
- filter controls remain touch-friendly.

## 11. Out of scope for V1

Do not include initially:
- Supabase;
- database;
- cloud CMS;
- customer accounts;
- comments;
- shopping/cart;
- payments;
- public `.bbmodel` downloads;
- 3D model viewer;
- analytics dashboard;
- multilingual CMS;
- remote admin editing.

These can be added later if genuinely needed.

## 12. Hosting

Recommended deployment:
- GitHub repository;
- Vercel deployment.

Workflow:
1. run project locally;
2. open `/admin`;
3. add/edit portfolio entries;
4. commit changes;
5. push to GitHub;
6. Vercel deploys the updated static portfolio.

## 13. Success criteria

The V1 is successful if:
- a new creation can be added locally without manually editing JSON;
- Featured homepage content can be selected and reordered locally;
- categories and filters work;
- public pages remain read-only;
- production requires no database credentials;
- the site can be deployed from a normal Git repository;
- the portfolio feels polished enough to show potential Minecraft/Blockbench clients.
