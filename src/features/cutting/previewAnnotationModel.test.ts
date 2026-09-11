import { describe, expect, it } from 'vitest';
import {
  completionCrossMetrics,
  formatPlacementAnnotation,
  formatPlacementInfo,
  formatPlacementPreview,
  gridLinePositions,
  placementTextMetrics,
} from './previewAnnotationModel';

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

  it('shows only the numeric placement id in the preview', () => {
    expect(formatPlacementPreview(7, 1000, 500, true)).toEqual({
      label: '#7 ↻',
      dimensions: '1,000×500mm',
    });
  });

  it('uses a larger but bounded dimension label', () => {
    expect(placementTextMetrics(100, 450)).toEqual({ labelFontSize: 20, dimensionFontSize: 16 });
    expect(placementTextMetrics(500, 1000)).toEqual({ labelFontSize: 30, dimensionFontSize: 23 });
  });

  it('insets completion crosses by 10% on every edge', () => {
    expect(completionCrossMetrics(100, 450)).toEqual({ insetX: 10, insetY: 45, strokeWidth: 12 });
    expect(completionCrossMetrics(20, 20)).toEqual({ insetX: 2, insetY: 2, strokeWidth: 4 });
  });

  it('places 100mm grid lines inside the film boundary', () => {
    expect(gridLinePositions(350)).toEqual([100, 200, 300]);
    expect(gridLinePositions(100)).toEqual([]);
    expect(gridLinePositions(99)).toEqual([]);
  });
});
