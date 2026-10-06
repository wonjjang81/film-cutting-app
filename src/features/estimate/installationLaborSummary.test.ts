import { describe, expect, it } from 'vitest';
import { installationLaborSummary } from './installationLaborSummary';
import { calculateProjectEstimate } from './calculateProjectEstimate';

describe('installation labor export summary', () => {
  it('shows mode, formulas and units without affecting an empty estimate', () => {
    const result = calculateProjectEstimate([], 10000, 15000, 0, [], { installationMode: 'standalone' });
    const summary = installationLaborSummary(result);
    expect(summary).toContain('단독시공');
    expect(summary).toContain('125,000원');
    expect(summary).toContain('평균 기준 품수');
    expect(summary).toContain('전체 청구 0품');
    expect(result.constructionCost).toBe(0);
    expect(installationLaborSummary(calculateProjectEstimate([]))).toBe('');
  });
});
