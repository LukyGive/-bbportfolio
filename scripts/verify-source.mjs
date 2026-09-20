import fs from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const fail = (message) => { throw new Error(message); };
const read = (file) => fs.readFile(path.join(root, file), 'utf8');

const runtimeFiles = [
  'app/page.tsx',
  'app/creations/page.tsx',
  'app/creations/[slug]/page.tsx',
  'app/admin/page.tsx',
  'app/api/admin/creations/route.ts',
  'app/api/admin/images/[id]/route.ts',
  'lib/creations/public.ts',
  'lib/admin/query.ts',
  'lib/admin/remote.ts',
];
for (const file of runtimeFiles) {
  const source = await read(file);
  if (source.includes('lib/admin/storage') || source.includes('lib/creations/read')) {
    fail(`Legacy local storage import found in ${file}`);
  }
}

const publicFiles = [
  'app/page.tsx',
  'app/creations/page.tsx',
  'app/creations/[slug]/page.tsx',
  'components/portfolio/CreationCard.tsx',
  'lib/creations/public.ts',
];
for (const file of publicFiles) {
  const source = (await read(file)).toLowerCase();
  if (file !== 'lib/creations/public.ts' && source.includes('.bbmodel')) fail(`Public bbmodel reference found in ${file}`);
}
const publicQuery = await read('lib/creations/public.ts');
const selectBlock = publicQuery.slice(publicQuery.indexOf('PUBLIC_CREATION_SELECT'), publicQuery.indexOf('function warnQuery'));
if (/bbmodel_/i.test(selectBlock)) fail('Public Supabase query selects private bbmodel fields');

const mutationRoute = await read('app/api/admin/creations/route.ts');
if (!mutationRoute.includes('getAdminContext')) fail('Admin mutation route is not authenticated');
const sourceRoute = await read('app/api/admin/bbmodel/[id]/route.ts');
if (!sourceRoute.includes('getAdminContext')) fail('Private source route is not authenticated');
if (/getPublicUrl|createSignedUrl/i.test(sourceRoute)) fail('Private bbmodel route must not create public/signed URLs');
const imageRoute = await read('app/api/admin/images/[id]/route.ts');
if (!imageRoute.includes('getAdminContext')) fail('Gallery mutation route is not authenticated');

const schema = await read('supabase/migrations/20260920160022_portfolio_online_admin.sql');
if (!schema.includes("('bbmodels', 'bbmodels', false")) fail('bbmodels bucket must be private');
if (!schema.includes('enable row level security')) fail('RLS migration missing');

console.log('source-verification: PASS (Supabase source of truth, authenticated admin, private bbmodels)');
