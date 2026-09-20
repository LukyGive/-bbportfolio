import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ViewerStatus } from '@/components/admin/ViewerStatus';

describe('ViewerStatus', () => {
  it('shows ready state and animation count', () => {
    render(<ViewerStatus
      creationId="abc"
      sourceFilename="model.bbmodel"
      status="ready"
      animationCount={4}
      onRegenerated={vi.fn()}
    />);
    expect(screen.getByText(/3D viewer generated/i)).toBeInTheDocument();
    expect(screen.getByText(/4 animations/i)).toBeInTheDocument();
  });

  it('shows conversion errors without exposing storage paths', () => {
    render(<ViewerStatus
      creationId="abc"
      sourceFilename="model.bbmodel"
      status="error"
      error="Unsupported Blockbench element"
      animationCount={0}
    />);
    expect(screen.getByText(/conversion failed/i)).toBeInTheDocument();
    expect(screen.getByText(/unsupported blockbench element/i)).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/viewer-models\//i);
  });
});
