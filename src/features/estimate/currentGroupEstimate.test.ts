import { describe, expect, it } from 'vitest';
import { calculateCurrentGroupEstimate, calculateCurrentGroupPlan, createCurrentEstimateSnapshot, parseCurrentEstimateSnapshot } from './currentGroupEstimate';
import { calculateProjectEstimate } from './calculateProjectEstimate';

const form = (pieceWidth: string, pieceLength: string, quantity = '1') => ({
  brand: '영림', productNumber: '', rollWidth: '1220', pieceWidth, pieceLength, quantity,
  gap: '0', sideMargin: '5', startEndMargin: '5', allowRotation: true,
});

describe('current group estimate', () => {
  it('calculates all valid current pieces without saving a project', () => {
    const snapshot = createCurrentEstimateSnapshot([{ id: 'g1', name: '그룹 1', pieces: [
      { id: 'p1', name: '조각 1', form: form('500', '1000', '2') },
      { id: 'p2', name: '조각 2', form: form('300', '800', '1') },
    ] }]);
    const result = calculateCurrentGroupEstimate(snapshot);
    expect(result.jobs).toHaveLength(2);
    expect(result.jobs.every((job) => job.result.newRollLengthMm > 0)).toBe(true);
  });

  it('restores a serialized current group snapshot', () => {
    const snapshot = { pieces: [{ id: 'g1', name: '그룹 1', pieces: [{ id: 'p1', name: '조각 1', form: form('500', '1000') }] }] };
    expect(parseCurrentEstimateSnapshot(JSON.stringify(snapshot))?.pieces[0]?.pieces).toHaveLength(1);
    expect(parseCurrentEstimateSnapshot(null)).toBeNull();
  });

  it('keeps a multi-piece group as one merged-roll estimate', () => {
    const snapshot = createCurrentEstimateSnapshot([{ id: 'g1', name: '그룹 1', pieces: [
      { id: 'p1', name: '조각 1', form: form('500', '1000') },
      { id: 'p2', name: '조각 2', form: form('300', '800') },
    ] }]);
    const result = calculateCurrentGroupEstimate(snapshot);
    const estimate = calculateProjectEstimate(result.jobs, 10_000, 15_000, 0, result.mergedJobs);
    expect(result.mergedJobs).toHaveLength(1);
    expect(estimate.jobs).toHaveLength(0);
    expect(estimate.mergedJobs).toHaveLength(1);
  });

  it('splits merged placement by major group even when merge numbers match', () => {
    const snapshot = createCurrentEstimateSnapshot([
      { id: 'g1', name: '그룹 1', mergeGroupId: 'auto', pieces: [
        { id: 'g1-p1', name: '조각 1', form: form('500', '1000') },
        { id: 'g1-p2', name: '조각 2', form: form('300', '800') },
      ] },
      { id: 'g2', name: '그룹 2', mergeGroupId: 'auto', pieces: [
        { id: 'g2-p1', name: '조각 1', form: form('500', '1000') },
        { id: 'g2-p2', name: '조각 2', form: form('300', '800') },
      ] },
    ]);

    const result = calculateCurrentGroupPlan(snapshot);

    expect(result.mergedPlans).toHaveLength(2);
    expect(result.mergedPlans.map((plan) => plan.sourceIds)).toEqual([
      ['g1-g1-p1', 'g1-g1-p2'],
      ['g2-g2-p1', 'g2-g2-p2'],
    ]);
  });

  it('uses the subgroup piece name in the material plan', () => {
    const snapshot = createCurrentEstimateSnapshot([{
      id: 'g1',
      name: '그룹 1',
      subgroups: [{ id: 'sg-a', name: 'A', pieceIds: ['group-1-그룹 1_01'], expanded: true }],
      pieces: [{ id: 'group-1-그룹 1_01', name: 'group-1-그룹 1_01', form: form('500', '1000') }],
    } as any]);
    const plan = calculateCurrentGroupPlan(snapshot);
    expect(plan.groupedPlans[0]?.pieceName).toBe('A_01');
    expect(plan.pieceNamesBySourceId['g1-group-1-그룹 1_01']).toBe('A_01');
    expect(plan.subgroupNamesBySourceId['g1-group-1-그룹 1_01']).toBe('A');
  });

  it('carries subgroup name and difficulty into current estimate jobs', () => {
    const snapshot = createCurrentEstimateSnapshot([{
      id: 'g1',
      name: '그룹 1',
      subgroups: [{ id: 'sg-a', name: 'A', difficulty: 'high', pieceIds: ['p1'], expanded: true }],
      pieces: [{ id: 'p1', name: 'p1', form: form('500', '1000') }],
    }]);
    const result = calculateCurrentGroupEstimate(snapshot);
    expect(result.jobs[0]).toMatchObject({ groupId: 'g1', subgroupName: 'A', difficulty: 'high' });
  });
});
