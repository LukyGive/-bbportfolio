import * as THREE from 'three';
import { findDefaultAnimationName } from '../animations';
import type { BbPreview, PreviewAnimationTrack } from '../schema';

function trackInterpolation(track: PreviewAnimationTrack) {
  return track.interpolation === 'step' ? THREE.InterpolateDiscrete : undefined;
}

function buildTrack(track: PreviewAnimationTrack): THREE.KeyframeTrack {
  if (track.channel === 'position' || track.channel === 'scale') {
    return new THREE.VectorKeyframeTrack(
      `bbv2-node-${track.nodeId}.${track.channel}`,
      track.times,
      track.values,
      trackInterpolation(track),
    );
  }

  const quaternionValues: number[] = [];
  for (let offset = 0; offset < track.values.length; offset += 3) {
    const quaternion = new THREE.Quaternion().setFromEuler(new THREE.Euler(
      track.values[offset],
      track.values[offset + 1],
      track.values[offset + 2],
      'ZYX',
    ));
    quaternionValues.push(quaternion.x, quaternion.y, quaternion.z, quaternion.w);
  }
  return new THREE.QuaternionKeyframeTrack(
    `bbv2-node-${track.nodeId}.quaternion`,
    track.times,
    quaternionValues,
    trackInterpolation(track),
  );
}

export function buildPreviewAnimationClips(preview: BbPreview): {
  clips: THREE.AnimationClip[];
  defaultAnimation?: string;
} {
  const clips = preview.animations.map((sourceAnimation) => {
    const clip = new THREE.AnimationClip(
      sourceAnimation.name,
      sourceAnimation.duration,
      sourceAnimation.tracks.map(buildTrack),
    );
    clip.userData.bbpreviewLoop = sourceAnimation.loop;
    return clip;
  });
  const defaultAnimation = findDefaultAnimationName(preview.animations);
  return { clips, ...(defaultAnimation ? { defaultAnimation } : {}) };
}
