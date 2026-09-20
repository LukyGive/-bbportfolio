import { notFound } from 'next/navigation';
import { AdminDashboard } from '@/components/admin/AdminDashboard';
import { getAllCreations } from '@/lib/creations/read';

export const metadata = {
  title: 'Local Admin',
  robots: { index: false, follow: false },
};

export default async function AdminPage() {
  if (process.env.NODE_ENV !== 'development') notFound();

  const creations = await getAllCreations();
  const categories = [...new Set(creations.map((creation) => creation.category))].sort((a, b) => a.localeCompare(b));
  return <AdminDashboard initialCreations={creations} categories={categories} />;
}
