import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { BbmodelField } from '@/components/admin/BbmodelField';

describe('BbmodelField', () => {
  it('uses a bbmodel-only file picker and never renders the storage path', () => {
    render(<BbmodelField creationId="abc" existing={{ filename: 'Vorakh.bbmodel', size: 1024 }} file={null} onChange={vi.fn()} />);
    expect(screen.getByLabelText(/blockbench source/i)).toHaveAttribute('accept', '.bbmodel');
    expect(screen.getByText('Vorakh.bbmodel')).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/bbmodels\//i);
    expect(screen.getByRole('link', { name: /download/i })).toHaveAttribute('href', '/api/admin/bbmodel/abc');
  });
});
