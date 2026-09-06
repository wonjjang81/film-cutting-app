import { describe, expect, it } from 'vitest';
import { formatPlacementAnnotation } from './previewAnnotationModel';

describe('preview annotation model', () => {
  it('formats a piece name and actual placed dimensions', () => {
    expect(formatPlacementAnnotation('A_01', 500, 1000, false)).toEqual({ label: 'A_01', dimensions: '500×1,000mm' });
    expect(formatPlacementAnnotation('A_01', 1000, 500, true)).toEqual({ label: 'A_01 ↻', dimensions: '1,000×500mm' });
  });
});
