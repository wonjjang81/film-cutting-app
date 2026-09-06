export type PlacementAnnotation = { label: string; dimensions: string };

export function formatPlacementAnnotation(label: string, width: number, height: number, rotated: boolean): PlacementAnnotation {
  const normalizedLabel = label.trim() || '조각';
  return {
    label: rotated ? `${normalizedLabel} ↻` : normalizedLabel,
    dimensions: `${Math.round(width).toLocaleString()}×${Math.round(height).toLocaleString()}mm`,
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
