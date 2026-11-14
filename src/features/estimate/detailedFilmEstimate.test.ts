import { describe, expect, it } from 'vitest';
import type { SavedCuttingJob, SavedMergedCuttingJob } from '../library/models';
import { calculateProjectEstimate } from './calculateProjectEstimate';
import { buildDetailedFilmEstimate, detailedFilmEstimateText, expenseForNet, filmEstimateCategories, parseDetailedEstimateDraft, parseExtraEstimateItems, priceExtraEstimateItem, type ExtraEstimateItem } from './detailedFilmEstimate';

const date = '2026-01-01T00:00:00Z';
const job = (id: string): SavedCuttingJob => ({
  id, name: `그룹 1 · ${id}`, groupId: 'group-1', subgroupName: id, installationPart: '책장',
  brand: '영림', productNumber: 'FILM01', createdAt: date, updatedAt: date,
  input: { rollWidthMm: 1220, pieceWidthMm: 500, pieceLengthMm: 500, quantity: 2, gapMm: 0, sideMarginMm: 5, startEndMarginMm: 5, allowRotation: true },
  remnantIds: [], remnantSummary: [],
  result: { newRollLengthMm: 1000, producedQuantity: 2, overproduction: 0, utilizationPercent: 80, wastePercent: 20, optimizationStatus: 'exact' },
});
const merged: SavedMergedCuttingJob = {
  id: 'roll', name: '병합 롤', mergeGroupId: 'auto', groupNames: ['그룹 1'], sourceJobIds: ['A', 'B'],
  createdAt: date, updatedAt: date, rollWidthMm: 1220, usedLengthMm: 1001,
  producedQuantity: 4, utilizationPercent: 80, wastePercent: 20, placements: [],
};
const extra: ExtraEstimateItem = { id: 'sanding', kind: 'auxiliary', name: '연마재', unit: '장', quantity: '1.5', rate: '4001', included: false };

describe('detailed film estimate', () => {
  it('reconciles merged source allocations and standalone supplement without changing totals', () => {
    const base = calculateProjectEstimate([job('A'), job('B')], 10001, 15000, 0.1, [merged], { installationMode: 'standalone' });
    const detail = buildDetailedFilmEstimate(base, []);
    expect(detail.total).toBe(base.total + expenseForNet(base.total, 9));
    expect(detail.subtotal - detail.expense).toBe(base.subtotal);
    expect(detail.films).toHaveLength(1);
    expect(detail.films[0]!.length).toBeCloseTo(1.001);
    expect(detail.films[0]!.amount).toBe(base.materialCost);
    expect(detail.labor.reduce((sum, line) => sum + line.amount, 0)).toBe(125000);
    expect(detail.labor.filter(line => line.name.includes('보정'))).toHaveLength(1);
    expect(detail.labor[0]!.basis).toContain('시공품수');
  });

  it('adds documented extras after the existing discount and avoids charging included items', () => {
    const base = calculateProjectEstimate([job('A')], 10000, 15000, 0.1);
    const detail = buildDetailedFilmEstimate(base, [
      extra, { ...extra, id: 'work', kind: 'preparation', name: '프라이머 도포', unit: 'm²', quantity: '2', rate: '12000' },
      { ...extra, id: 'included', kind: 'misc', name: '퍼티', included: true, rate: '' },
      { ...extra, id: 'primer', kind: 'misc', name: '프라이머', quantity: '1', rate: '3000' },
      { ...extra, id: 'management', kind: 'expense', name: '현장 관리비', quantity: '1', rate: '5000' },
    ]);
    expect(detail.valid).toBe(true);
    expect(detail.auxiliary).toBe(6002);
    expect(detail.preparation).toBe(24000);
    const net = base.total + 33002;
    expect(detail.netBeforeExpense).toBe(net);
    expect(detail.total).toBe(net + expenseForNet(net, 9));
    expect(detail.legacyExpenses).toHaveLength(1);
    const categories = filmEstimateCategories(detail);
    expect(categories.map(row => row.name)).toEqual(['인건비', '자재비', '기타잡비', '경비']);
    expect(categories.reduce((sum, row) => sum + row.amount, 0) - base.discount).toBe(detail.total);
    expect(detailedFilmEstimateText(detail)).toContain('퍼티 · 기존 견적에 포함 · 추가 청구 없음');
  });

  it.each(['', '-2', '1.2.3', '1e20', '999999999999999999999'])('does not silently price incomplete or invalid input %s', (rate) => {
    expect(priceExtraEstimateItem({ ...extra, rate })).toMatchObject({ valid: false, amount: 0 });
    expect(buildDetailedFilmEstimate(calculateProjectEstimate([job('A')]), [{ ...extra, rate }]).valid).toBe(false);
  });
  it('rejects malformed or duplicate stored rows', () => {
    expect(parseExtraEstimateItems(JSON.stringify([extra]))).toEqual([extra]);
    expect(() => parseExtraEstimateItems(JSON.stringify([extra, extra]))).toThrow();
    expect(() => parseExtraEstimateItems('[null]')).toThrow();
  });
  it('reclassifies previously saved putty and primer without changing their charges', () => {
    const items = [{ ...extra, name: ' 퍼티 ' }, { ...extra, id: 'primer', name: '프라이머' }, { ...extra, id: 'apply', kind: 'preparation', name: '프라이머 도포' }];
    const restored = parseExtraEstimateItems(JSON.stringify(items));
    expect(restored.map(row => row.kind)).toEqual(['misc', 'misc', 'preparation']);
    const base = calculateProjectEstimate([job('A')]);
    expect(buildDetailedFilmEstimate(base, restored).netBeforeExpense).toBe(base.total + 3 * 6002);
  });
  it('uses the final amount as denominator and applies the same rate to both range endpoints', () => {
    expect(expenseForNet(91000, 9)).toBe(9000);
    expect(expenseForNet(86000, 14)).toBe(14000);
    expect(expenseForNet(0, 14)).toBe(0);
    const base = calculateProjectEstimate([job('A')], 10000, 15000, 0.1);
    const detail = buildDetailedFilmEstimate(base, [], 14);
    expect(detail.expense / detail.total).toBeCloseTo(0.14, 4);
    expect(detail.totalRange.min).toBe(base.totalRange.min + expenseForNet(base.totalRange.min, 14));
    expect(detail.totalRange.max).toBe(base.totalRange.max + expenseForNet(base.totalRange.max, 14));
  });
  it('restores selected rates and accepts legacy arrays at the default', () => {
    expect(parseDetailedEstimateDraft(JSON.stringify([extra]))).toEqual({ items: [extra], expenseRate: 9 });
    expect(parseDetailedEstimateDraft(JSON.stringify({ items: [extra], expenseRate: 14 })).expenseRate).toBe(14);
    expect(() => parseDetailedEstimateDraft(JSON.stringify({ items: [], expenseRate: 15 }))).toThrow();
  });
});
