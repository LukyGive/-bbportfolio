import { AdminDashboard } from '@/components/admin/AdminDashboard';
import { getAllPacksForAdmin } from '@/lib/admin/pack-query';
import { getAllCreationsForAdmin } from '@/lib/admin/query';

export const dynamic = 'force-dynamic';
export const metadata = {
  title: 'Portfolio Admin',
  robots: { index: false, follow: false },
};

export default async function AdminPage() {
  const [creations, packs] = await Promise.all([
    getAllCreationsForAdmin(),
    getAllPacksForAdmin(),
  ]);
  const categories = [...new Set(creations.map((creation) => creation.category))].sort((a, b) => a.localeCompare(b));
  return <AdminDashboard initialCreations={creations} initialPacks={packs} categories={categories} />;
}
