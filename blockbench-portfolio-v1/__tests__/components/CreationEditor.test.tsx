import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CreationEditor } from '@/components/admin/CreationEditor';

const originalFetch = global.fetch;
afterEach(() => { global.fetch = originalFetch; vi.restoreAllMocks(); });

describe('CreationEditor', () => {
  it('requires name and category', async () => {
    render(<CreationEditor categories={['Boss']} />);
    await userEvent.click(screen.getByRole('button', { name: /save creation/i }));
    expect(screen.getByLabelText(/name/i)).toBeInvalid();
    expect(screen.getByLabelText(/category/i)).toBeInvalid();
  });

  it('auto-suggests slug until the slug is manually edited', async () => {
    render(<CreationEditor categories={['Boss']} />);
    const name = screen.getByLabelText(/^name/i);
    const slug = screen.getByLabelText(/^slug/i);
    await userEvent.type(name, 'Ice Guardian');
    expect(slug).toHaveValue('ice-guardian');
    await userEvent.clear(slug);
    await userEvent.type(slug, 'custom-slug');
    await userEvent.clear(name);
    await userEvent.type(name, 'Other Name');
    expect(slug).toHaveValue('custom-slug');
  });

  it('serializes payload and image files into FormData', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
    global.fetch = fetchMock as typeof fetch;
    render(<CreationEditor categories={['Boss']} />);
    await userEvent.type(screen.getByLabelText(/^name/i), 'Vorakh');
    await userEvent.type(screen.getByLabelText(/^category/i), 'Boss');
    const file = new File(['png'], 'front.png', { type: 'image/png' });
    await userEvent.upload(screen.getByLabelText(/add render images/i), file);
    await userEvent.click(screen.getByRole('button', { name: /save creation/i }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const init = fetchMock.mock.calls[0][1];
    expect(init.method).toBe('POST');
    expect(init.body).toBeInstanceOf(FormData);
    expect((init.body as FormData).getAll('images')).toHaveLength(1);
  });
});
