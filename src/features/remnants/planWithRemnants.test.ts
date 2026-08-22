import { describe, expect, it } from 'vitest';

import { type FilmRemnant, planWithRemnants } from './planWithRemnants';

const now = '2026-08-16T00:00:00.000Z';
const baseRequest = {
  rollWidthMm: 100,
  pieceWidthMm: 60,
  pieceLengthMm: 40,
  quantity: 2,
  gapMm: 0,
  sideMarginMm: 0,
  startEndMarginMm: 0,
  allowRotation: false,
  brand: 'A',
  productNumber: 'P1',
  remnants: [],
};

function remnant(overrides: Partial<FilmRemnant> = {}): FilmRemnant {
  return {
    id: 'r1', brand: 'A', productNumber: 'P1', widthMm: 60, lengthMm: 40,
    quantity: 1, createdAt: now, updatedAt: now,
    ...overrides,
  };
}

function intersects(
  left: { x: number; y: number; width: number; height: number },
  right: { x: number; y: number; width: number; height: number },
): boolean {
  return left.x < right.x + right.width
    && right.x < left.x + left.width
    && left.y < right.y + right.height
    && right.y < left.y + left.height;
}

describe('planWithRemnants', () => {
  it('uses a narrower remnant when the requested piece fits', () => {
    const plan = planWithRemnants(baseRequest, [{
      id: 'r1', brand: 'A', productNumber: 'P1', widthMm: 80,
      lengthMm: 100, quantity: 1, createdAt: now, updatedAt: now,
    }]);

    expect(plan.remnantUses[0]?.remnantId).toBe('r1');
    expect(plan.newRollQuantity).toBeLessThan(baseRequest.quantity);
  });

  it('uses matching rectangles in deterministic savings, area, and ID order before a new roll', () => {
    const plan = planWithRemnants({ ...baseRequest, quantity: 3 }, [
      remnant({ id: 'b' }), remnant({ id: 'a' }),
    ]);

    expect(plan.remnantUses.map((use) => use.remnantId)).toEqual(['a', 'b']);
    expect(plan.remnantUses.reduce((total, use) => total + use.producedQuantity, 0)).toBe(2);
    expect(plan.newRollQuantity).toBe(1);
    expect(plan.newRollResult?.producedQuantity).toBe(1);
  });

  it('does not consume mismatched or unusable remnants', () => {
    const mismatchedBrand = remnant({ id: 'brand', brand: 'B', widthMm: 100, lengthMm: 100 });
    const mismatchedProduct = remnant({ id: 'product', productNumber: 'P2', widthMm: 100, lengthMm: 100 });
    const tooSmall = remnant({ id: 'small', widthMm: 59, lengthMm: 100 });
    const plan = planWithRemnants(baseRequest, [mismatchedBrand, mismatchedProduct, tooSmall]);

    expect(plan.remnantUses).toEqual([]);
    expect(plan.inventoryDelta).toEqual({ removeIds: [], add: [], basedOnUpdatedAt: {} });
    expect(plan.newRollQuantity).toBe(baseRequest.quantity);
  });

  it('trims matching identifiers without accepting different values', () => {
    const plan = planWithRemnants({ ...baseRequest, brand: ' A ', productNumber: ' P1 ' }, [
      remnant({ id: 'trimmed', brand: 'A', productNumber: 'P1' }),
      remnant({ id: 'different', brand: 'A', productNumber: 'P10' }),
    ]);

    expect(plan.remnantUses.map((use) => use.remnantId)).toEqual(['trimmed']);
    expect(plan.inventoryDelta.removeIds).toEqual(['trimmed']);
  });

  it('matches same-brand remnants when the product number is omitted', () => {
    const plan = planWithRemnants({ ...baseRequest, productNumber: '' }, [
      remnant({ id: 'same-brand', productNumber: 'P9' }),
      remnant({ id: 'other-brand', brand: 'B', productNumber: 'P1' }),
    ]);

    expect(plan.remnantUses.map((use) => use.remnantId)).toEqual(['same-brand']);
    expect(plan.newRollQuantity).toBe(1);
  });

  it('sends only the remaining quantity to an unrestricted new-roll calculation', () => {
    const plan = planWithRemnants({ ...baseRequest, quantity: 2, maxLengthMm: 1 }, [remnant()]);

    expect(plan.newRollQuantity).toBe(1);
    expect(plan.newRollResult).toMatchObject({ producedQuantity: 1, usedLengthMm: 40 });
  });

  it('returns only bounded, non-overlapping residual rectangles that can fit a piece', () => {
    const request = {
      ...baseRequest,
      pieceWidthMm: 40,
      pieceLengthMm: 30,
      quantity: 1,
    };
    const source = remnant({ id: 'geometry', widthMm: 100, lengthMm: 100, note: 'keep' });
    const plan = planWithRemnants(request, [source]);
    const residuals = plan.inventoryDelta.add;
    const rectangles = residuals.map((item) => {
      if (item.id.endsWith('-right')) return { x: 40, y: 0, width: item.widthMm, height: item.lengthMm };
      return { x: 0, y: 30, width: item.widthMm, height: item.lengthMm };
    });

    expect(residuals).toHaveLength(2);
    expect(residuals).toEqual(expect.arrayContaining([
      expect.objectContaining({ brand: 'A', productNumber: 'P1', note: 'keep', widthMm: 60, lengthMm: 30 }),
      expect.objectContaining({ brand: 'A', productNumber: 'P1', note: 'keep', widthMm: 100, lengthMm: 70 }),
    ]));
    expect(rectangles.every((item) => item.x >= 0 && item.y >= 0 && item.x + item.width <= source.widthMm && item.y + item.height <= source.lengthMm)).toBe(true);
    expect(intersects(rectangles[0]!, rectangles[1]!)).toBe(false);
  });

  it('preserves unconsumed identical units and source timestamps in its tentative delta', () => {
    const source = remnant({ id: 'many', quantity: 3, createdAt: 'created', updatedAt: 'updated' });
    const plan = planWithRemnants({ ...baseRequest, quantity: 2 }, [source]);

    expect(plan.remnantUses).toHaveLength(2);
    expect(plan.inventoryDelta.removeIds).toEqual(['many']);
    expect(plan.inventoryDelta.basedOnUpdatedAt).toEqual({ many: 'updated' });
    expect(plan.inventoryDelta.add).toContainEqual(expect.objectContaining({
      id: 'many', quantity: 1, createdAt: 'created', updatedAt: 'updated',
    }));
    expect(new Set(plan.inventoryDelta.add.map((item) => item.id)).size).toBe(plan.inventoryDelta.add.length);
    expect(plan.inventoryDelta.add.filter((item) => plan.inventoryDelta.removeIds.includes(item.id)).map((item) => item.id)).toEqual(['many']);
  });

  it('never mutates requests or inventory, and produces the same tentative plan twice', () => {
    const remnants = [remnant({ id: 'immutable', widthMm: 100, lengthMm: 100 })];
    const request = { ...baseRequest, remnants, quantity: 1, pieceWidthMm: 40, pieceLengthMm: 30 };
    const before = structuredClone(request);

    const first = planWithRemnants(request);
    const second = planWithRemnants(request);

    expect(request).toEqual(before);
    expect(first).toEqual(second);
  });

  it('keeps the finite optimizer practical-status metadata on a remnant use', () => {
    const request = {
      ...baseRequest,
      rollWidthMm: 10,
      pieceWidthMm: 3,
      pieceLengthMm: 4,
      quantity: 21,
      gapMm: 1,
      allowRotation: true,
    };
    const plan = planWithRemnants(request, [remnant({ id: 'practical', widthMm: 10, lengthMm: 1_000 })]);

    expect(plan.remnantUses[0]?.result.planningMetrics.strategy).toBe('material-first');
    expect(plan.remnantUses[0]?.result.optimizationStatus).not.toBe('exact');
    expect(plan.remnantUses[0]?.result.lowerBoundLengthMm).toBeGreaterThanOrEqual(0);
    expect(plan.remnantUses[0]?.result.optimalityGapMm).toBeGreaterThanOrEqual(0);
  });

  it('never assigns a residual ID already held by another inventory source', () => {
    const request = {
      ...baseRequest,
      pieceWidthMm: 40,
      pieceLengthMm: 30,
      quantity: 2,
      gapMm: 30,
    };
    const sources = [
      remnant({ id: 'b', widthMm: 100, lengthMm: 50 }),
      remnant({ id: 'b--residual-1-1-right', widthMm: 100, lengthMm: 50 }),
      remnant({ id: 'reserved-mismatch', brand: 'B', widthMm: 100, lengthMm: 50 }),
    ];

    const plan = planWithRemnants(request, sources);
    const sourceIds = new Set(sources.map((source) => source.id));
    const addIds = plan.inventoryDelta.add.map((item) => item.id);
    const removeIds = new Set(plan.inventoryDelta.removeIds);

    expect(plan.remnantUses.map((use) => use.remnantId)).toEqual(['b', 'b--residual-1-1-right']);
    expect(new Set(addIds).size).toBe(addIds.length);
    expect(addIds.every((id) => !sourceIds.has(id))).toBe(true);
    expect(addIds.every((id) => !removeIds.has(id))).toBe(true);
    expect(addIds).toContain('b--residual-1-1-right--2');
  });

  it('reserves IDs from mismatched inventory that it leaves untouched', () => {
    const request = { ...baseRequest, pieceWidthMm: 40, pieceLengthMm: 30, quantity: 1, gapMm: 30 };
    const sources = [
      remnant({ id: 'b', widthMm: 100, lengthMm: 50 }),
      remnant({ id: 'b--residual-1-1-right', brand: 'B', widthMm: 100, lengthMm: 50 }),
    ];

    const plan = planWithRemnants(request, sources);

    expect(plan.inventoryDelta.removeIds).toEqual(['b']);
    expect(plan.inventoryDelta.add.map((item) => item.id)).toContain('b--residual-1-1-right--2');
    expect(plan.inventoryDelta.add.map((item) => item.id)).not.toContain('b--residual-1-1-right');
  });
});
