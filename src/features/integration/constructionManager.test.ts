import { describe, expect, it } from 'vitest';
import { buildFilmEstimateSubmission, parseConstructionManagerContext } from './constructionManager';

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
