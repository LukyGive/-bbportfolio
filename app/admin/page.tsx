import { AdminDashboard } from '@/components/admin/AdminDashboard';
import { getAllCreationsForAdmin } from '@/lib/admin/query';

export const dynamic = 'force-dynamic';
export const metadata = {
  title: 'Portfolio Admin',
  robots: { index: false, follow: false },
};

export default async function AdminPage() {
  const creations = await getAllCreationsForAdmin();
  const categories = [...new Set(creations.map((creation) => creation.category))].sort((a, b) => a.localeCompare(b));
  return <AdminDashboard initialCreations={creations} categories={categories} />;
}
