import { redirect } from 'next/navigation';
import { LoginForm } from '@/components/admin/LoginForm';
import { isAdmin } from '@/lib/auth/server';

export const metadata = {
  title: 'Admin Login',
  robots: { index: false, follow: false },
};

export default async function AdminLoginPage() {
  if (await isAdmin()) redirect('/admin');
  return (
    <div className="admin-login-page shell">
      <LoginForm />
    </div>
  );
}
