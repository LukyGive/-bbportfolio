export type ViewerGeometryGroup = {
  start: number;
  count: number;
  materialIndex: number;
};

export type CompactMaterialGroupResult = {
  singleMaterialIndex?: number;
  groups: ViewerGeometryGroup[];
};

export function compactMaterialGroups(
  groups: readonly ViewerGeometryGroup[],
): CompactMaterialGroupResult {
  const usable = groups.filter((group) => group.count > 0);
  if (usable.length === 0) return { singleMaterialIndex: 0, groups: [] };

  const firstMaterial = usable[0].materialIndex;
  if (usable.every((group) => group.materialIndex === firstMaterial)) {
    return { singleMaterialIndex: firstMaterial, groups: [] };
  }

  const compacted: ViewerGeometryGroup[] = [];
  for (const group of usable) {
    const previous = compacted[compacted.length - 1];
    if (
      previous &&
      previous.materialIndex === group.materialIndex &&
      previous.start + previous.count === group.start
    ) {
      previous.count += group.count;
    } else {
      compacted.push({ ...group });
    }
  }

  return { groups: compacted };
}
