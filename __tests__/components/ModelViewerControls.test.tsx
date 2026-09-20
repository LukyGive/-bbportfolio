import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ModelViewerControls } from '@/components/portfolio/ModelViewerControls';

describe('ModelViewerControls', () => {
  it('shows readable animation labels and play/pause controls', async () => {
    const onAnimationChange = vi.fn();
    const onPlayingChange = vi.fn();
    render(
      <ModelViewerControls
        animationNames={['animation.idle', 'heavy_slam']}
        activeAnimation="animation.idle"
        playing
        onAnimationChange={onAnimationChange}
        onPlayingChange={onPlayingChange}
      />,
    );

    expect(screen.getByRole('combobox', { name: /animation/i })).toHaveValue('animation.idle');
    expect(screen.getByRole('option', { name: 'Idle' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Heavy Slam' })).toBeInTheDocument();
    await userEvent.selectOptions(screen.getByRole('combobox'), 'heavy_slam');
    expect(onAnimationChange).toHaveBeenCalledWith('heavy_slam');
    await userEvent.click(screen.getByRole('button', { name: /pause/i }));
    expect(onPlayingChange).toHaveBeenCalledWith(false);
  });

  it('renders nothing when no animations exist', () => {
    const { container } = render(
      <ModelViewerControls
        animationNames={[]}
        playing={false}
        onAnimationChange={() => {}}
        onPlayingChange={() => {}}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
