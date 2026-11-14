import { describe, expect, it } from 'vitest';
import { buildFilmEstimateSubmission, parseConstructionManagerContext, buildFilmBreakdown } from './constructionManager';

describe('construction manager film integration', () => {
  it('builds film-estimate/v1 from a normalized launch context', () => {
    const context = parseConstructionManagerContext({ canonicalProjectId: ' cm-1 ', projectName: ' 현장 ', externalEntityId: ' film-1 ' })!;
    expect(buildFilmEstimateSubmission({ context, externalEntityId: '', sourceUpdatedAt: '2026-09-23T08:00:00.000Z', materialCost: 100, constructionCost: 200, discount: 30, total: 270 }))
      .toMatchObject({ schema: 'film-estimate/v1', canonicalProjectId: 'cm-1', externalEntityId: 'film-1', summary: { total: 270 } });
  });
  it('rejects missing links', () => {
    expect(parseConstructionManagerContext({ canonicalProjectId: ' ' })).toBeNull();
    expect(() => buildFilmEstimateSubmission({ context: { canonicalProjectId: 'c', projectName: '' }, externalEntityId: '', sourceUpdatedAt: '', materialCost: 1, constructionCost: 1, discount: 0, total: 2 })).toThrow('프로젝트 ID');
  });
});

describe('자동 견적서 세부내역', () => {
  it('preserves film quantities and reconciles the new costs and discount', () => {
    const payload = buildFilmEstimateSubmission({ context: { canonicalProjectId: 'c', projectName: '' }, externalEntityId: 'film', sourceUpdatedAt: '2026-09-23T08:00:00.000Z', materialCost: 100, auxiliaryCost: 10, constructionCost: 200, preparationCost: 40, miscCost: 20, expenseCost: 10, discount: 30, total: 300, quantities: { materialLengthM: 3, materialAreaM2: 3.66 } });
    expect(payload.summary.otherCost).toBe(30);
    expect(payload.breakdown).toContainEqual({ name: '필름 원단', amount: 90, kind: 'mainMaterial', spec: '인테리어 필름', unit: 'm', quantity: 3 });
    expect(payload.breakdown).toContainEqual({ name: '필름 시공', amount: 160, kind: 'labor', spec: '필름 시공', unit: '㎡', quantity: 3.7 });
    expect(payload.breakdown.reduce((sum, row) => sum + row.amount, 0)).toBe(payload.summary.total);
  });
  it('sends material length, construction area and discount as typed rows', () => {
    expect(buildFilmBreakdown({ materialCost: 900000, constructionCost: 5175000, discount: 150000, quantities: { materialLengthM: 60.04, materialAreaM2: 72.36 } })).toEqual([
      { name: '필름 시공', amount: 5175000, kind: 'labor', spec: '필름 시공', unit: '㎡', quantity: 72.4 },
      { name: '필름 원단', amount: 900000, kind: 'mainMaterial', spec: '인테리어 필름', unit: 'm', quantity: 60 },
      { name: '할인', amount: -150000, kind: 'discount' },
    ]);
  });

  it('keeps the old two rows when quantities are not given', () => {
    expect(buildFilmBreakdown({ materialCost: 1, constructionCost: 2, discount: 0 })).toEqual([{ name: '필름 원단', amount: 1 }, { name: '필름 시공', amount: 2 }]);
  });
});
