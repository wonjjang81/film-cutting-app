const COLORS = ['#2563eb', '#0f766e', '#c2410c', '#7c3aed', '#be123c', '#0369a1', '#854d0e', '#4338ca'];
function hash(value: string): number {
  let result = 0;
  for (const character of value) result = (Math.imul(result, 31) + character.charCodeAt(0)) >>> 0;
  return result;
}

/** Independent of roll order and visibility, so moving a piece never changes its color. */
export function subgroupColor(sourceId: string, subgroups: Record<string, string> = {}, majorGroups: Record<string, string> = {}): string {
  const subgroup = subgroups[sourceId]?.trim();
  const key = subgroup ? JSON.stringify([majorGroups[sourceId] ?? '', subgroup]) : sourceId;
  return COLORS[hash(key) % COLORS.length]!;
}

/** Rotating a piece does not change its size class. Exact dimensions remain on the piece. */
export function sizeStroke(width: number, height: number): string | undefined {
  return [undefined, '16 6', '4 6', '18 5 4 5'][hash(`${Math.min(width, height)}x${Math.max(width, height)}`) % 4];
}
