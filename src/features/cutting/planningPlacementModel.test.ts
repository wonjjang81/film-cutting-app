import { describe, expect, it } from 'vitest';
import { findLatestMergedJob, findLatestPieceJob, groupPlacementsBySubgroup, nextPlacementCompletion } from './planningPlacementModel';

const placement = (id: number, sourceId: string) => ({ id, sourceId, instanceIndex: 0, x: 0, y: id * 10, width: 100, height: 200, rotated: false });

describe('planning placement model', () => {
  it('groups placement rows by subgroup while preserving first-seen order', () => {
    const groups = groupPlacementsBySubgroup(
      [placement(1, 'g1-p1'), placement(2, 'g1-p2'), placement(3, 'g1-p1')],
      { 'g1-p1': 'A', 'g1-p2': 'B' },
    );

    expect(groups).toEqual([
      { id: 'A', title: 'A', items: [placement(1, 'g1-p1'), placement(3, 'g1-p1')] },
      { id: 'B', title: 'B', items: [placement(2, 'g1-p2')] },
    ]);
  });

  it('toggles a completion mark and reports all-placement completion', () => {
    expect(nextPlacementCompletion([1], 2, [1, 2, 3])).toEqual({ completedIds: [1, 2], complete: false });
    expect(nextPlacementCompletion([1, 2], 3, [1, 2, 3])).toEqual({ completedIds: [1, 2, 3], complete: true });
    expect(nextPlacementCompletion([1, 2, 3], 2, [1, 2, 3])).toEqual({ completedIds: [1, 3], complete: false });
  });

  it('finds the latest saved merged job for the current plan sources', () => {
    const plan = { mergeGroupId: 'auto', sourceIds: ['g1-p1', 'g1-p2'] };
    const jobs = [
      { id: 'old', mergeGroupId: 'auto', sourceIds: ['g1-p1', 'g1-p2'], updatedAt: '2026-01-01T00:00:00.000Z' },
      { id: 'new', mergeGroupId: 'auto', sourceIds: ['g1-p1', 'g1-p2'], updatedAt: '2026-01-02T00:00:00.000Z' },
      { id: 'other', mergeGroupId: 'auto', sourceIds: ['g1-p3'], updatedAt: '2026-01-03T00:00:00.000Z' },
    ];
    expect(findLatestMergedJob(plan, jobs)?.id).toBe('new');
  });

  it('finds the latest saved independent job by group and piece source', () => {
    const jobs = [
      { id: 'old', name: '그룹 1 · 그룹 1_01 작업', updatedAt: '2026-01-01T00:00:00.000Z' },
      { id: 'new', name: '그룹 1 · 그룹 1_01 작업', updatedAt: '2026-01-02T00:00:00.000Z' },
      { id: 'other', name: '그룹 1 · 그룹 1_02 작업', updatedAt: '2026-01-03T00:00:00.000Z' },
    ];
    expect(findLatestPieceJob('그룹 1', '그룹 1_01', jobs)?.id).toBe('new');
  });
});
