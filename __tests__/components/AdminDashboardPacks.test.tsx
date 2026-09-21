import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it } from 'vitest';
import { AdminDashboard } from '@/components/admin/AdminDashboard';

it('switches to packs and exposes pack creation without replacing the creations section', async () => {
  const user = userEvent.setup();

  render(
    <AdminDashboard
      initialCreations={[]}
      initialPacks={[]}
      categories={[]}
    />,
  );

  expect(
    screen.getByRole('button', { name: 'Creations' }),
  ).toBeInTheDocument();

  await user.click(
    screen.getByRole('button', { name: 'Packs' }),
  );

  expect(
    screen.getByRole('button', { name: '＋ New pack' }),
  ).toBeInTheDocument();

  expect(
    screen.getByText('PACK MANAGER'),
  ).toBeInTheDocument();
});
