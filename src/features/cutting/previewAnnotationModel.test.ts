import { describe, expect, it } from 'vitest';
import { formatPlacementAnnotation, formatPlacementInfo } from './previewAnnotationModel';

describe('preview annotation model', () => {
  it('formats a piece name and actual placed dimensions', () => {
    expect(formatPlacementAnnotation('A_01', 500, 1000, false)).toEqual({ label: 'A_01', dimensions: '500×1,000mm' });
    expect(formatPlacementAnnotation('A_01', 1000, 500, true)).toEqual({ label: 'A_01 ↻', dimensions: '1,000×500mm' });
  });

  it('builds the complete placement information shown in the detail popup', () => {
    expect(formatPlacementInfo('A_01', 120, 450, true, 15, 25)).toEqual({
      label: 'A_01 ↻',
      dimensions: '120×450mm',
      rotation: '90도 회전',
      position: 'X 15 · Y 25mm',
    });
  });
});
