import { describe, expect, it } from 'vitest';

import { getEstimatePanelVisibility } from './estimateScreenModel';
import { selectEstimateSource } from './estimateScreenModel';

const job = (id: string) => ({
  id, name: id, brand: '영림', productNumber: '', createdAt: '2026-08-23T00:00:00.000Z', updatedAt: '2026-08-23T00:00:00.000Z',
  input: { rollWidthMm: 1220, pieceWidthMm: 500, pieceLengthMm: 500, quantity: 1, gapMm: 0, sideMarginMm: 5, startEndMarginMm: 5, allowRotation: true },
  remnantIds: [], remnantSummary: [], result: { newRollLengthMm: 500, producedQuantity: 1, overproduction: 0, utilizationPercent: 80, wastePercent: 20, optimizationStatus: 'exact' as const },
});

describe('getEstimatePanelVisibility', () => {
  it('shows one authoritative total instead of duplicating the same material cost in a detail card', () => {
    expect(getEstimatePanelVisibility(true)).toEqual({ showProjectSummary: true, showDetailSummary: false });
  });

  it('restores the saved project-wide estimate source by default when project jobs exist', () => {
    const project = [job('saved-1'), job('saved-2')];
    const current = [job('current-1')];
    const selected = selectEstimateSource('project', project, [], current, []);
    expect(selected.source).toBe('project');
    expect(selected.jobs.map((item) => item.id)).toEqual(['saved-1', 'saved-2']);
  });

  it('falls back to current input estimates when no saved project exists', () => {
    const selected = selectEstimateSource('project', [], [], [job('current-1')], []);
    expect(selected.source).toBe('current');
    expect(selected.jobs.map((item) => item.id)).toEqual(['current-1']);
  });

});
