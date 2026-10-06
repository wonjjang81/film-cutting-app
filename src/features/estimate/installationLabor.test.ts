import { describe, expect, it } from 'vitest';
import { allocateLaborCost, calculateInstallationLabor } from './installationLabor';

describe('average installation labor', () => {
  it('uses average allocated units rather than the old midpoint price', () => {
    expect(calculateInstallationLabor('책장', 5, 'whole')).toMatchObject({ allocatedUnits: 0.55, constructionCost: 137500, minimumApplied: false });
    expect(calculateInstallationLabor('책장', 5, 'whole')?.costPerM).toBeCloseTo(27500);
    const vanity = calculateInstallationLabor('화장대', 3.13, 'whole')!;
    expect(vanity.allocatedUnits).toBeCloseTo(0.275);
    expect(vanity.constructionCost).toBe(68750);
    expect(vanity.costPerM).toBeCloseTo(68750 / 3.13);
  });
  it('does not impose a solo minimum on each individual part', () => {
    expect(calculateInstallationLabor('책장', 1, 'standalone')?.constructionCost).toBe(27500);
    expect(calculateInstallationLabor('책장', 0, 'standalone')?.constructionCost).toBe(0);
    expect(calculateInstallationLabor('드레스룸', 1.67, 'standalone')?.unavailable).toBe(true);
    expect(calculateInstallationLabor('드레스룸', 1.67, 'whole')?.unavailable).toBe(false);
  });
  it('keeps single-value upper-only units and permits explicit custom rates', () => {
    expect(calculateInstallationLabor('붙박이장', 4.49, 'whole')?.constructionCost).toBe(50000);
    expect(calculateInstallationLabor('직접 입력', 2, 'whole', 10000)?.constructionCost).toBe(20000);
    expect(calculateInstallationLabor('직접 입력', 2, 'whole', 0)?.constructionCost).toBe(0);
    expect(calculateInstallationLabor('직접 입력', 2, 'whole')).toBeUndefined();
  });
  it('allocates exact integer totals even across many small shares', () => {
    const split = allocateLaborCost(125000, [1, 1, 1]);
    expect(split).toEqual([41667, 41667, 41666]);
    expect(split.reduce((sum, value) => sum + value, 0)).toBe(125000);
  });
});
