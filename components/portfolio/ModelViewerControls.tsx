'use client';

import { displayAnimationName } from '@/lib/viewer/animation';

type Props = {
  animationNames: string[];
  activeAnimation?: string;
  playing: boolean;
  onAnimationChange(name: string): void;
  onPlayingChange(playing: boolean): void;
};

export function ModelViewerControls({
  animationNames,
  activeAnimation,
  playing,
  onAnimationChange,
  onPlayingChange,
}: Props) {
  if (animationNames.length === 0) return null;

  return (
    <div className="model-viewer-controls">
      <button
        type="button"
        className="model-viewer-control-button"
        aria-label={playing ? 'Pause animation' : 'Play animation'}
        onClick={() => onPlayingChange(!playing)}
      >
        {playing ? 'Ⅱ' : '▶'}
      </button>
      <select
        aria-label="Animation"
        value={activeAnimation ?? animationNames[0]}
        onChange={(event) => onAnimationChange(event.target.value)}
      >
        {animationNames.map((name) => (
          <option key={name} value={name}>{displayAnimationName(name)}</option>
        ))}
      </select>
    </div>
  );
}
