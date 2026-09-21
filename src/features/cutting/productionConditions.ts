export const FIXED_ROLL_WIDTH_MM = 1220;
export const DEFAULT_GAP_MM = 0;
export const DEFAULT_SIDE_MARGIN_MM = 0;
export const DEFAULT_START_END_MARGIN_MM = 0;

export function normalizeProductionMargin(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(String(value ?? '').trim());
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

export function applyFixedProductionDefaults<T extends { rollWidth: string; gap: string }>(form: T): T {
  return { ...form, rollWidth: String(FIXED_ROLL_WIDTH_MM), gap: String(DEFAULT_GAP_MM) };
}
