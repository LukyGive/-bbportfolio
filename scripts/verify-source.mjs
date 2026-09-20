import fs from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const fail = (message) => { throw new Error(message); };
const read = (file) => fs.readFile(path.join(root, file), 'utf8');

const rows = JSON.parse(await read('data/creations.json'));
if (!Array.isArray(rows)) fail('data/creations.json must be an array');
const ids = new Set();
const slugs = new Set();
for (const row of rows) {
  if (!row.id || !row.slug || !row.name || !row.category) fail(`Incomplete creation: ${JSON.stringify(row)}`);
  if (ids.has(row.id)) fail(`Duplicate id: ${row.id}`);
  if (slugs.has(row.slug)) fail(`Duplicate slug: ${row.slug}`);
  ids.add(row.id); slugs.add(row.slug);
  if (!String(row.coverImage).startsWith('/models/')) fail(`Unsafe cover path for ${row.id}`);
}

const route = await read('app/api/admin/creations/route.ts');
const guards = route.match(/process\.env\.NODE_ENV !== 'development'/g)?.length ?? 0;
if (guards < 3) fail('Every admin mutation handler must have a development-only guard');
const adminPage = await read('app/admin/page.tsx');
if (!adminPage.includes("process.env.NODE_ENV !== 'development'")) fail('Admin page must be development-only');

const publicFiles = ['app/page.tsx', 'app/creations/page.tsx', 'components/portfolio/CreationCard.tsx'];
for (const file of publicFiles) {
  if ((await read(file)).toLowerCase().includes('.bbmodel')) fail(`Public bbmodel reference found in ${file}`);
}

console.log(`source-verification: PASS (${rows.length} sample creations, ${guards} production write guards)`);
