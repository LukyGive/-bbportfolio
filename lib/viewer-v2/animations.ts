import type { PreviewAnimation, PreviewAnimationTrack, PreviewNode, Vec3 } from './schema';
import type { PreviewHierarchy } from './hierarchy';
import type { SourceAnimationKeyframe, SupportedBbmodel } from './source';

const AXES = ['x', 'y', 'z'] as const;
const MAX_SAMPLE_RATE = 60;

function numeric(value: unknown): number {
  const result = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(result) ? result : 0;
}

function point(keyframe: SourceAnimationKeyframe, index: number): Record<string, unknown> {
  return keyframe.dataPoints[index] ?? keyframe.dataPoints[0] ?? {};
}

function keyValue(keyframe: SourceAnimationKeyframe, pointIndex: number, axis: 0 | 1 | 2): number {
  return numeric(point(keyframe, pointIndex)[AXES[axis]]);
}

function segmentValue(keyframe: SourceAnimationKeyframe, side: 'before' | 'after', axis: 0 | 1 | 2): number {
  const pointIndex = side === 'before' ? Math.max(0, keyframe.dataPoints.length - 1) : 0;
  return keyValue(keyframe, pointIndex, axis);
}

function catmullRom(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const v0 = (p2 - p0) * 0.5;
  const v1 = (p3 - p1) * 0.5;
  const t2 = t * t;
  const t3 = t * t2;
  return (2 * p1 - 2 * p2 + v0 + v1) * t3
    + (-3 * p1 + 3 * p2 - 2 * v0 - v1) * t2
    + v0 * t
    + p1;
}

function cubic(a: number, b: number, c: number, d: number, t: number): number {
  const inverse = 1 - t;
  return inverse ** 3 * a + 3 * inverse ** 2 * t * b + 3 * inverse * t ** 2 * c + t ** 3 * d;
}

function solveBezierTime(x1: number, x2: number, target: number): number {
  let low = 0;
  let high = 1;
  let current = target;
  for (let iteration = 0; iteration < 18; iteration += 1) {
    current = (low + high) / 2;
    if (cubic(0, x1, x2, 1, current) < target) low = current;
    else high = current;
  }
  return current;
}

function bezierValue(
  before: SourceAnimationKeyframe,
  after: SourceAnimationKeyframe,
  axis: 0 | 1 | 2,
  alpha: number,
): number {
  const start = segmentValue(before, 'before', axis);
  const end = segmentValue(after, 'after', axis);
  const gap = Math.max(after.time - before.time, Number.EPSILON);
  const rightTime = Math.min(gap, Math.max(0, before.bezierRightTime?.[axis] ?? 0));
  const leftTime = Math.min(0, Math.max(-gap, after.bezierLeftTime?.[axis] ?? 0));
  const rightValue = before.bezierRightValue?.[axis] ?? 0;
  const leftValue = after.bezierLeftValue?.[axis] ?? 0;
  const curve = solveBezierTime(rightTime / gap, 1 + leftTime / gap, alpha);
  return cubic(start, start + rightValue, end + leftValue, end, curve);
}

function sampleChannel(keyframes: SourceAnimationKeyframe[], time: number, channel: PreviewAnimationTrack['channel']): Vec3 {
  if (keyframes.length === 0) return channel === 'scale' ? [1, 1, 1] : [0, 0, 0];
  const sorted = [...keyframes].sort((a, b) => a.time - b.time);
  let before: SourceAnimationKeyframe | undefined;
  let after: SourceAnimationKeyframe | undefined;
  let beforeIndex = -1;
  sorted.forEach((keyframe, index) => {
    if (keyframe.time <= time && (!before || keyframe.time > before.time)) {
      before = keyframe;
      beforeIndex = index;
    }
    if (keyframe.time >= time && (!after || keyframe.time < after.time)) after = keyframe;
  });
  if (before && Math.abs(before.time - time) < 1e-7) return [0, 1, 2].map((axis) => keyValue(before!, 0, axis as 0 | 1 | 2)) as Vec3;
  if (after && Math.abs(after.time - time) < 1e-7) return [0, 1, 2].map((axis) => keyValue(after!, 0, axis as 0 | 1 | 2)) as Vec3;
  if (!before && after) return [0, 1, 2].map((axis) => segmentValue(after!, 'after', axis as 0 | 1 | 2)) as Vec3;
  if (!after && before) return [0, 1, 2].map((axis) => segmentValue(before!, 'before', axis as 0 | 1 | 2)) as Vec3;
  if (!before || !after) return channel === 'scale' ? [1, 1, 1] : [0, 0, 0];
  if (before.interpolation === 'step') return [0, 1, 2].map((axis) => segmentValue(before!, 'before', axis as 0 | 1 | 2)) as Vec3;

  const alpha = Math.max(0, Math.min(1, (time - before.time) / Math.max(after.time - before.time, Number.EPSILON)));
  return [0, 1, 2].map((axisValue) => {
    const axis = axisValue as 0 | 1 | 2;
    if (before!.interpolation === 'catmullrom' || after!.interpolation === 'catmullrom') {
      const p1 = segmentValue(before!, 'before', axis);
      const p2 = segmentValue(after!, 'after', axis);
      const previous = sorted[beforeIndex - 1];
      const following = sorted[beforeIndex + 2];
      const p0 = previous ? segmentValue(previous, 'before', axis) : p1;
      const p3 = following ? segmentValue(following, 'after', axis) : p2;
      return catmullRom(p0, p1, p2, p3, alpha);
    }
    if (before!.interpolation === 'bezier' || after!.interpolation === 'bezier') {
      return bezierValue(before!, after!, axis, alpha);
    }
    const start = segmentValue(before!, 'before', axis);
    const end = segmentValue(after!, 'after', axis);
    return start + (end - start) * alpha;
  }) as Vec3;
}

function isPureStep(keyframes: SourceAnimationKeyframe[]): boolean {
  return keyframes.length > 0 && keyframes.every((keyframe) => (keyframe.interpolation ?? 'linear') === 'step');
}

function needsSampling(keyframes: SourceAnimationKeyframe[]): boolean {
  const modes = new Set(keyframes.map((keyframe) => keyframe.interpolation ?? 'linear'));
  return modes.has('catmullrom') || modes.has('bezier') || (modes.has('step') && modes.size > 1);
}

function sampleTimes(length: number, snapping: number | undefined, keyframes: SourceAnimationKeyframe[], sample: boolean): number[] {
  const values = new Set<number>([0, Math.max(0, length)]);
  for (const keyframe of keyframes) values.add(Math.max(0, Math.min(length, keyframe.time)));
  if (sample && length > 0) {
    const rate = Math.max(1, Math.min(MAX_SAMPLE_RATE, snapping || 20));
    const interval = 1 / rate;
    for (let time = 0; time < length; time += interval) values.add(Number(time.toFixed(6)));
  }
  return [...values].sort((a, b) => a - b);
}

function absoluteValues(node: PreviewNode, channel: PreviewAnimationTrack['channel'], sampled: Vec3): Vec3 {
  if (channel === 'position') return [
    node.position[0] + sampled[0],
    node.position[1] + sampled[1],
    node.position[2] + sampled[2],
  ];
  if (channel === 'rotation') return [
    node.rotation[0] + sampled[0] * Math.PI / 180,
    node.rotation[1] + sampled[1] * Math.PI / 180,
    node.rotation[2] + sampled[2] * Math.PI / 180,
  ];
  return [
    node.scale[0] * (sampled[0] || 0.00001),
    node.scale[1] * (sampled[1] || 0.00001),
    node.scale[2] * (sampled[2] || 0.00001),
  ];
}

export function extractPreviewAnimations(source: SupportedBbmodel, hierarchy: PreviewHierarchy): PreviewAnimation[] {
  const nodes = new Map(hierarchy.nodes.map((node) => [node.id, node] as const));
  const result: PreviewAnimation[] = [];

  for (const animation of source.animations) {
    const tracks: PreviewAnimationTrack[] = [];
    for (const animator of animation.animators) {
      if (animator.type === 'effect' || animator.sourceUuid === 'effects') continue;
      const nodeId = hierarchy.nodeIdBySourceUuid.get(animator.sourceUuid);
      if (nodeId === undefined) throw new Error(`Animation “${animation.name}” targets missing UUID ${animator.sourceUuid}.`);
      const node = nodes.get(nodeId);
      if (!node) throw new Error(`Animation “${animation.name}” targets missing node ${nodeId}.`);

      for (const channel of ['position', 'rotation', 'scale'] as const) {
        const keyframes = animator.keyframes.filter((keyframe) => keyframe.channel === channel);
        if (keyframes.length === 0) continue;
        const sample = needsSampling(keyframes);
        const times = sampleTimes(animation.length, animation.snapping, keyframes, sample);
        const values: number[] = [];
        for (const time of times) values.push(...absoluteValues(node, channel, sampleChannel(keyframes, time, channel)));
        tracks.push({
          nodeId,
          channel,
          times,
          values,
          interpolation: isPureStep(keyframes) ? 'step' : 'linear',
        });
      }
    }
    result.push({ name: animation.name, duration: animation.length, loop: animation.loop, tracks });
  }
  return result;
}

export function findDefaultAnimationName(animations: ReadonlyArray<PreviewAnimation>): string | undefined {
  if (animations.length === 0) return undefined;
  return animations.find((animation) => animation.name.toLowerCase().includes('idle'))?.name ?? animations[0].name;
}
