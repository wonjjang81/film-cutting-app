export type PlacementAnnotation = { label: string; dimensions: string };

export function formatPlacementAnnotation(label: string, width: number, height: number, rotated: boolean): PlacementAnnotation {
  const normalizedLabel = label.trim() || '조각';
  return {
    label: rotated ? `${normalizedLabel} ↻` : normalizedLabel,
    dimensions: `${Math.round(width).toLocaleString()}×${Math.round(height).toLocaleString()}mm`,
  };
}

/** Keeps the drawing compact while the detail popup retains the full piece name. */
export function formatPlacementPreview(id: number, width: number, height: number, rotated: boolean): PlacementAnnotation {
  return formatPlacementAnnotation(`#${id}`, width, height, rotated);
}

/** Returns readable, bounded text sizes for labels drawn inside a placement. */
export function placementTextMetrics(width: number, height: number): { labelFontSize: number; dimensionFontSize: number } {
  const minDimension = Math.max(1, Math.min(Math.abs(width), Math.abs(height)));
  const labelFontSize = Math.max(11, Math.min(30, minDimension * 0.2));
  return {
    labelFontSize,
    dimensionFontSize: Math.max(11, Math.min(26, Math.round(labelFontSize * 0.78))),
  };
}

export type PlacementInfo = PlacementAnnotation & { rotation: string; position: string };

export function formatPlacementInfo(label: string, width: number, height: number, rotated: boolean, x: number, y: number): PlacementInfo {
  return {
    ...formatPlacementAnnotation(label, width, height, rotated),
    rotation: rotated ? '90도 회전' : '기본 방향',
    position: `X ${Math.round(x).toLocaleString()} · Y ${Math.round(y).toLocaleString()}mm`,
  };
}

/** Returns a completion cross covering 80% of the placement without crossing its edges. */
export function completionCrossMetrics(width: number, height: number): { insetX: number; insetY: number; strokeWidth: number } {
  const normalizedWidth = Math.max(1, Math.abs(width));
  const normalizedHeight = Math.max(1, Math.abs(height));
  const minDimension = Math.max(1, Math.min(Math.abs(width), Math.abs(height)));
  return {
    insetX: Math.max(1, Math.round(normalizedWidth * 0.1)),
    insetY: Math.max(1, Math.round(normalizedHeight * 0.1)),
    strokeWidth: Math.max(4, Math.round(minDimension * 0.12)),
  };
}

/** Returns internal grid positions at the requested real-world interval. */
export function gridLinePositions(extentMm: number, intervalMm = 100): number[] {
  if (!Number.isFinite(extentMm) || !Number.isFinite(intervalMm) || extentMm <= intervalMm || intervalMm <= 0) return [];
  const count = Math.ceil(extentMm / intervalMm) - 1;
  return Array.from({ length: count }, (_, index) => (index + 1) * intervalMm);
}
