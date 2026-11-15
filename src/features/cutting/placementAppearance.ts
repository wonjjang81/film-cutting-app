const COLORS = [
  '#2563eb', '#c2410c', '#15803d', '#a21caf', '#a16207', '#0e7490', '#be123c', '#475569',
  '#4338ca', '#92400e', '#4d7c0f', '#be185d', '#0f766e', '#7e22ce', '#b45309', '#7f1d1d',
] as const;
function hash(value: string): number {
  let result = 0;
  for (const character of value) result = (Math.imul(result, 31) + character.charCodeAt(0)) >>> 0;
  return result;
}

export function subgroupAppearance(titles: readonly string[]) {
  const sortedTitles = [...new Set(titles)].sort((left, right) => left.localeCompare(right, 'ko', { numeric: true }));
  return new Map(sortedTitles.map((title, index) => [title, COLORS[index % COLORS.length]!]));
}

/** Rotating a piece does not change its size class. Exact dimensions remain on the piece. */
export function sizeStroke(width: number, height: number): string | undefined {
  return [undefined, '16 6', '4 6', '18 5 4 5'][hash(`${Math.min(width, height)}x${Math.max(width, height)}`) % 4];
}
