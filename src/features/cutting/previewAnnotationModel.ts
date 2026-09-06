export type PlacementAnnotation = { label: string; dimensions: string };

export function formatPlacementAnnotation(label: string, width: number, height: number, rotated: boolean): PlacementAnnotation {
  const normalizedLabel = label.trim() || '조각';
  return {
    label: rotated ? `${normalizedLabel} ↻` : normalizedLabel,
    dimensions: `${Math.round(width).toLocaleString()}×${Math.round(height).toLocaleString()}mm`,
  };
}
