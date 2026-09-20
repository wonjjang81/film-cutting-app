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

/** Fits both lines inside a piece; rotate only the annotation when the long axis is more legible. */
export function placementTextMetrics(width: number, height: number, annotation?: PlacementAnnotation): { labelFontSize: number; dimensionFontSize: number; rotateText: boolean } {
  const safeWidth = Math.max(1, Math.abs(width));
  const safeHeight = Math.max(1, Math.abs(height));
  const labelLength = Math.max(2, annotation?.label.length ?? 3);
  const dimensionLength = Math.max(6, annotation?.dimensions.length ?? 11);
  const fit = (along: number, across: number) => ({
    labelFontSize: Math.max(1, Math.floor(Math.min(72, along * 0.84 / (labelLength * 0.64), across * 0.42))),
    dimensionFontSize: Math.max(1, Math.floor(Math.min(36, along * 0.84 / (dimensionLength * 0.56), across * 0.24))),
  });
  const horizontal = fit(safeWidth, safeHeight);
  const vertical = fit(safeHeight, safeWidth);
  const rotateText = safeHeight > safeWidth * 1.35 && vertical.dimensionFontSize > horizontal.dimensionFontSize * 1.15;
  return { ...(rotateText ? vertical : horizontal), rotateText };
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
