import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { PackMemberPicker } from '@/components/admin/PackMemberPicker';

const creationA = { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'Sakura Pickaxe', category: 'Item', tags: ['Sakura'], published: true };
const creationB = { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', name: 'Sakura Axe', category: 'Item', tags: ['Sakura'], published: true };

it('searches available creations and prevents duplicate selection', async () => {
  const user = userEvent.setup();
  const onChange = vi.fn();
  render(<PackMemberPicker creations={[creationA, creationB] as never} value={[]} onChange={onChange} />);
  await user.type(screen.getByRole('searchbox', { name: /search creations for pack/i }), 'pick');
  await user.click(screen.getByRole('button', { name: /add sakura pickaxe/i }));
  expect(onChange).toHaveBeenLastCalledWith([creationA.id]);
});

it('moves selected members with accessible up/down controls', async () => {
  const user = userEvent.setup();
  const onChange = vi.fn();
  render(<PackMemberPicker creations={[creationA, creationB] as never} value={[creationA.id, creationB.id]} onChange={onChange} />);
  await user.click(screen.getByRole('button', { name: /move sakura axe up/i }));
  expect(onChange).toHaveBeenLastCalledWith([creationB.id, creationA.id]);
});
