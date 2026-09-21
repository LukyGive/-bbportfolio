export type SourceVec3 = [number, number, number];
export type SourceUvRect = [number, number, number, number];
export type SourceFaceName = 'north' | 'south' | 'east' | 'west' | 'up' | 'down';

export type SourceCubeFace = {
  uv?: SourceUvRect;
  texture?: number | string | null;
  rotation?: 0 | 90 | 180 | 270;
  enabled?: boolean;
};

export type SourceCube = {
  uuid: string;
  name?: string;
  from: SourceVec3;
  to: SourceVec3;
  origin: SourceVec3;
  rotation: SourceVec3;
  faces: Partial<Record<SourceFaceName, SourceCubeFace>>;
};

export type SourceGroup = {
  uuid: string;
  name?: string;
  origin: SourceVec3;
  rotation: SourceVec3;
  children: Array<SourceGroup | string>;
};

export type SourceTexture = {
  index: number;
  id?: string;
  uuid?: string;
  name?: string;
  width: number;
  height: number;
  uvWidth: number;
  uvHeight: number;
  source: string;
  renderMode?: string;
  renderSides?: string;
};

export type SourceAnimationKeyframe = {
  channel?: string;
  time: number;
  interpolation?: string;
  dataPoints: Array<Record<string, unknown>>;
  bezierLeftTime?: SourceVec3;
  bezierLeftValue?: SourceVec3;
  bezierRightTime?: SourceVec3;
  bezierRightValue?: SourceVec3;
};

export type SourceAnimationAnimator = {
  sourceUuid: string;
  name?: string;
  type?: string;
  keyframes: SourceAnimationKeyframe[];
};

export type SourceAnimation = {
  uuid?: string;
  name: string;
  loop: boolean;
  length: number;
  snapping?: number;
  animators: SourceAnimationAnimator[];
};

export type SupportedBbmodel = {
  format: 'java_block_item' | 'generic_entity';
  resolution: { width: number; height: number };
  cubes: SourceCube[];
  textures: SourceTexture[];
  outliner: Array<SourceGroup | string>;
  animations: SourceAnimation[];
};

type JsonRecord = Record<string, unknown>;

const FACE_NAMES: SourceFaceName[] = ['north', 'south', 'east', 'west', 'up', 'down'];
const FACE_ROTATIONS = new Set([0, 90, 180, 270]);

function asRecord(value: unknown, label: string): JsonRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object.`);
  return value as JsonRecord;
}

function asArray(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array.`);
  return value;
}

function optionalArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function finite(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`${label} must be a finite number.`);
  return value;
}

function positiveDimension(value: unknown, label: string, fallback?: number): number {
  const resolved = value ?? fallback;
  const number = finite(resolved, label);
  if (number <= 0) throw new Error(`${label} must be positive.`);
  return number;
}

function vec3(value: unknown, label: string, fallback: SourceVec3 = [0, 0, 0]): SourceVec3 {
  if (value === undefined) return [...fallback] as SourceVec3;
  const items = asArray(value, label);
  if (items.length !== 3) throw new Error(`${label} must contain three values.`);
  return [finite(items[0], `${label}[0]`), finite(items[1], `${label}[1]`), finite(items[2], `${label}[2]`)];
}

function uvRect(value: unknown, label: string): SourceUvRect | undefined {
  if (value === undefined) return undefined;
  const items = asArray(value, label);
  if (items.length !== 4) throw new Error(`${label} must contain four values.`);
  return [
    finite(items[0], `${label}[0]`),
    finite(items[1], `${label}[1]`),
    finite(items[2], `${label}[2]`),
    finite(items[3], `${label}[3]`),
  ];
}

function stringOrUndefined(value: unknown, label: string): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string') throw new Error(`${label} must be a string.`);
  return value;
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} must be a non-empty string.`);
  return value;
}

function parseFace(value: unknown, label: string): SourceCubeFace {
  const item = asRecord(value, label);
  let rotation: 0 | 90 | 180 | 270 | undefined;
  if (item.rotation !== undefined) {
    const raw = finite(item.rotation, `${label}.rotation`);
    if (!FACE_ROTATIONS.has(raw)) throw new Error(`${label}.rotation must be 0, 90, 180 or 270.`);
    rotation = raw as 0 | 90 | 180 | 270;
  }
  const texture = item.texture;
  if (texture !== undefined && texture !== null && typeof texture !== 'number' && typeof texture !== 'string') {
    throw new Error(`${label}.texture must be a texture index, id or null.`);
  }
  if (typeof texture === 'number' && !Number.isSafeInteger(texture)) throw new Error(`${label}.texture index is invalid.`);
  return {
    ...(uvRect(item.uv, `${label}.uv`) ? { uv: uvRect(item.uv, `${label}.uv`) } : {}),
    ...(texture !== undefined ? { texture: texture as number | string | null } : {}),
    ...(rotation !== undefined ? { rotation } : {}),
    ...(item.enabled !== undefined ? { enabled: Boolean(item.enabled) } : {}),
  };
}

function parseCube(value: unknown, index: number): SourceCube {
  const item = asRecord(value, `elements[${index}]`);
  const facesRecord = item.faces === undefined ? {} : asRecord(item.faces, `elements[${index}].faces`);
  const faces: SourceCube['faces'] = {};
  for (const faceName of FACE_NAMES) {
    const face = facesRecord[faceName];
    if (face !== undefined && face !== null) faces[faceName] = parseFace(face, `elements[${index}].faces.${faceName}`);
  }
  return {
    uuid: requiredString(item.uuid, `elements[${index}].uuid`),
    ...(stringOrUndefined(item.name, `elements[${index}].name`) ? { name: item.name as string } : {}),
    from: vec3(item.from, `elements[${index}].from`),
    to: vec3(item.to, `elements[${index}].to`),
    origin: vec3(item.origin, `elements[${index}].origin`),
    rotation: vec3(item.rotation, `elements[${index}].rotation`),
    faces,
  };
}

function parseTexture(value: unknown, index: number, resolution: { width: number; height: number }): SourceTexture {
  const item = asRecord(value, `textures[${index}]`);
  const source = requiredString(item.source, `textures[${index}].source`);
  if (!/^data:image\/(png|webp);base64,/i.test(source)) {
    throw new Error(`textures[${index}].source must be an embedded PNG or WebP data URL.`);
  }
  const width = positiveDimension(item.width, `textures[${index}].width`, resolution.width);
  const height = positiveDimension(item.height, `textures[${index}].height`, resolution.height);
  return {
    index,
    ...(stringOrUndefined(item.id, `textures[${index}].id`) ? { id: item.id as string } : {}),
    ...(stringOrUndefined(item.uuid, `textures[${index}].uuid`) ? { uuid: item.uuid as string } : {}),
    ...(stringOrUndefined(item.name, `textures[${index}].name`) ? { name: item.name as string } : {}),
    width,
    height,
    uvWidth: positiveDimension(item.uv_width, `textures[${index}].uv_width`, width),
    uvHeight: positiveDimension(item.uv_height, `textures[${index}].uv_height`, height),
    source,
    ...(stringOrUndefined(item.render_mode, `textures[${index}].render_mode`) ? { renderMode: item.render_mode as string } : {}),
    ...(stringOrUndefined(item.render_sides, `textures[${index}].render_sides`) ? { renderSides: item.render_sides as string } : {}),
  };
}

function parseAnimationKeyframe(value: unknown, label: string): SourceAnimationKeyframe {
  const item = asRecord(value, label);
  const points = optionalArray(item.data_points).map((point, index) => asRecord(point, `${label}.data_points[${index}]`));
  return {
    ...(stringOrUndefined(item.channel, `${label}.channel`) ? { channel: item.channel as string } : {}),
    time: finite(item.time ?? 0, `${label}.time`),
    ...(stringOrUndefined(item.interpolation, `${label}.interpolation`) ? { interpolation: item.interpolation as string } : {}),
    dataPoints: points,
    ...(item.bezier_left_time !== undefined ? { bezierLeftTime: vec3(item.bezier_left_time, `${label}.bezier_left_time`) } : {}),
    ...(item.bezier_left_value !== undefined ? { bezierLeftValue: vec3(item.bezier_left_value, `${label}.bezier_left_value`) } : {}),
    ...(item.bezier_right_time !== undefined ? { bezierRightTime: vec3(item.bezier_right_time, `${label}.bezier_right_time`) } : {}),
    ...(item.bezier_right_value !== undefined ? { bezierRightValue: vec3(item.bezier_right_value, `${label}.bezier_right_value`) } : {}),
  };
}

function parseAnimations(value: unknown): SourceAnimation[] {
  return optionalArray(value).map((rawAnimation, animationIndex) => {
    const item = asRecord(rawAnimation, `animations[${animationIndex}]`);
    const rawAnimators = item.animators === undefined ? {} : asRecord(item.animators, `animations[${animationIndex}].animators`);
    const animators = Object.entries(rawAnimators).map(([sourceUuid, rawAnimator]) => {
      const animator = asRecord(rawAnimator, `animations[${animationIndex}].animators.${sourceUuid}`);
      return {
        sourceUuid,
        ...(stringOrUndefined(animator.name, `animations[${animationIndex}].animators.${sourceUuid}.name`) ? { name: animator.name as string } : {}),
        ...(stringOrUndefined(animator.type, `animations[${animationIndex}].animators.${sourceUuid}.type`) ? { type: animator.type as string } : {}),
        keyframes: optionalArray(animator.keyframes).map((keyframe, keyframeIndex) => parseAnimationKeyframe(
          keyframe,
          `animations[${animationIndex}].animators.${sourceUuid}.keyframes[${keyframeIndex}]`,
        )),
      } satisfies SourceAnimationAnimator;
    });
    const loopValue = item.loop;
    const loop = loopValue === true || loopValue === 'loop';
    return {
      ...(stringOrUndefined(item.uuid, `animations[${animationIndex}].uuid`) ? { uuid: item.uuid as string } : {}),
      name: requiredString(item.name ?? `Animation ${animationIndex + 1}`, `animations[${animationIndex}].name`),
      loop,
      length: finite(item.length ?? 0, `animations[${animationIndex}].length`),
      ...(item.snapping !== undefined ? { snapping: finite(item.snapping, `animations[${animationIndex}].snapping`) } : {}),
      animators,
    } satisfies SourceAnimation;
  });
}

function textureReferenceExists(reference: number | string | null | undefined, textures: SourceTexture[]): boolean {
  if (reference === undefined || reference === null || reference === -1 || reference === '-1') return true;
  if (typeof reference === 'number') return reference >= 0 && reference < textures.length;
  if (/^\d+$/.test(reference)) {
    const index = Number(reference);
    if (index >= 0 && index < textures.length) return true;
  }
  return textures.some((texture) => texture.uuid === reference || texture.id === reference);
}

function hydrateOutliner(
  value: unknown,
  groups: Map<string, Omit<SourceGroup, 'children'>>,
  cubeIds: Set<string>,
  stack: string[] = [],
): SourceGroup | string {
  if (typeof value === 'string') {
    if (!cubeIds.has(value)) throw new Error(`Outliner references unknown cube ${value}.`);
    return value;
  }
  const item = asRecord(value, 'outliner group');
  const uuid = requiredString(item.uuid, 'outliner group uuid');
  if (stack.includes(uuid)) throw new Error(`Outliner group hierarchy contains a cycle at ${uuid}.`);
  const definition = groups.get(uuid);
  const origin = definition?.origin ?? vec3(item.origin, `outliner group ${uuid}.origin`);
  const rotation = definition?.rotation ?? vec3(item.rotation, `outliner group ${uuid}.rotation`);
  const inlineName = stringOrUndefined(item.name, `outliner group ${uuid}.name`);
  const children = optionalArray(item.children).map((child) => hydrateOutliner(child, groups, cubeIds, [...stack, uuid]));
  return {
    uuid,
    ...(definition?.name || inlineName ? { name: definition?.name ?? inlineName } : {}),
    origin,
    rotation,
    children,
  };
}

function parseGroups(value: unknown): Map<string, Omit<SourceGroup, 'children'>> {
  const groups = new Map<string, Omit<SourceGroup, 'children'>>();
  for (const [index, rawGroup] of optionalArray(value).entries()) {
    const item = asRecord(rawGroup, `groups[${index}]`);
    const uuid = requiredString(item.uuid, `groups[${index}].uuid`);
    if (groups.has(uuid)) throw new Error(`Duplicate group uuid ${uuid}.`);
    const name = stringOrUndefined(item.name, `groups[${index}].name`);
    groups.set(uuid, {
      uuid,
      ...(name ? { name } : {}),
      origin: vec3(item.origin, `groups[${index}].origin`),
      rotation: vec3(item.rotation, `groups[${index}].rotation`),
    });
  }
  return groups;
}

export function parseSupportedBbmodel(text: string): SupportedBbmodel {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch {
    throw new Error('Blockbench source contains malformed JSON.');
  }
  const root = asRecord(parsed, 'Blockbench source');
  const meta = asRecord(root.meta, 'meta');
  const modelFormat = requiredString(meta.model_format, 'meta.model_format');
  if (modelFormat !== 'java_block') {
    throw new Error(`Unsupported Blockbench model format: ${modelFormat}.`);
  }

  const resolutionRecord = asRecord(root.resolution, 'resolution');
  const resolution = {
    width: positiveDimension(resolutionRecord.width, 'resolution.width'),
    height: positiveDimension(resolutionRecord.height, 'resolution.height'),
  };

  const textures = optionalArray(root.textures).map((texture, index) => parseTexture(texture, index, resolution));
  const cubes = asArray(root.elements ?? [], 'elements').map(parseCube);
  const cubeIds = new Set<string>();
  for (const cube of cubes) {
    if (cubeIds.has(cube.uuid)) throw new Error(`Duplicate cube uuid ${cube.uuid}.`);
    cubeIds.add(cube.uuid);
    for (const [faceName, face] of Object.entries(cube.faces)) {
      if (!textureReferenceExists(face?.texture, textures)) {
        throw new Error(`Cube ${cube.uuid} face ${faceName} has an unknown texture reference.`);
      }
    }
  }

  const groups = parseGroups(root.groups);
  const outliner = optionalArray(root.outliner).map((item) => hydrateOutliner(item, groups, cubeIds));

  // Every authored cube should be reachable from the outliner unless the file intentionally omits it.
  const referencedCubes = new Set<string>();
  const collect = (items: Array<SourceGroup | string>) => {
    for (const item of items) {
      if (typeof item === 'string') referencedCubes.add(item);
      else collect(item.children);
    }
  };
  collect(outliner);
  if (outliner.length > 0) {
    for (const cube of cubes) {
      if (!referencedCubes.has(cube.uuid)) throw new Error(`Cube ${cube.uuid} is not referenced by the outliner.`);
    }
  }

  return {
    format: 'java_block_item',
    resolution,
    cubes,
    textures,
    outliner,
    animations: parseAnimations(root.animations),
  };
}

export async function readSupportedBbmodel(file: File): Promise<SupportedBbmodel> {
  if (!/\.bbmodel$/i.test(file.name)) throw new Error('Blockbench source must use the .bbmodel extension.');
  return parseSupportedBbmodel(await file.text());
}
