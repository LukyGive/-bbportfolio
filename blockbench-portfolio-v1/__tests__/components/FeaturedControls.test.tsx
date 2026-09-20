import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { FeaturedControls } from '@/components/admin/FeaturedControls';

it('reveals order only when featured is enabled', async () => {
  const onChange = vi.fn();
  const { rerender } = render(<FeaturedControls featured={false} onChange={onChange} />);
  expect(screen.queryByLabelText(/featured order/i)).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole('checkbox', { name: /featured/i }));
  expect(onChange).toHaveBeenLastCalledWith({ featured: true, featuredOrder: 1 });
  rerender(<FeaturedControls featured featuredOrder={1} onChange={onChange} />);
  expect(screen.getByLabelText(/featured order/i)).toBeInTheDocument();
});
