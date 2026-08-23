import { describe, expect, it } from 'vitest';
import { ContinuousRollInput, ContinuousRollLayoutValidationError, compareContinuousRollCandidates, getContinuousRollCandidateCount, getContinuousRollPlanningMetrics, optimizeContinuousRollLayout } from './optimizeContinuousRollLayout';

type Objective = [number, number, number, number, number];
type OraclePattern = { key: string; capacity: number; height: number; rotations: number };
type OracleState = { quantity: number; height: number; rotations: number; kinds: string[] };

function compareTuple(left: readonly number[], right: readonly number[]): number {
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return left[index]! - right[index]!;
  }
  return 0;
}

/**
 * Test-only bounded enumeration. It deliberately derives geometry from the
 * public dimensions rather than importing production pattern helpers.
 */
function exhaustiveOracle(input: ContinuousRollInput): { producedQuantity: number; objective: Objective } {
  const usableWidth = input.rollWidthMm - input.sideMarginMm * 2;
  const extent = (count: number, size: number) => count * size + Math.max(0, count - 1) * input.gapMm;
  const fitsSideBySide = (normalColumns: number, rotatedColumns: number) => (
    extent(normalColumns, input.pieceWidthMm)
    + (normalColumns > 0 && rotatedColumns > 0 ? input.gapMm : 0)
    + extent(rotatedColumns, input.pieceLengthMm)
    <= usableWidth
  );
  const normalColumnLimit = Math.floor((usableWidth + input.gapMm) / (input.pieceWidthMm + input.gapMm));
  const rotatedColumnLimit = input.allowRotation
    ? Math.floor((usableWidth + input.gapMm) / (input.pieceLengthMm + input.gapMm))
    : 0;
  const maximumRowCapacity = Math.max(1, normalColumnLimit + rotatedColumnLimit);
  const producedLimit = input.quantity + maximumRowCapacity;
  const patterns: OraclePattern[] = [];

  for (let normalCount = 0; normalCount <= Math.min(normalColumnLimit, producedLimit); normalCount += 1) {
    for (let rotatedCount = 0; rotatedCount <= Math.min(rotatedColumnLimit, producedLimit - normalCount); rotatedCount += 1) {
      if (normalCount + rotatedCount === 0 || !fitsSideBySide(normalCount, rotatedCount)) continue;
      patterns.push({
        key: `row-${normalCount}-${rotatedCount}`,
        capacity: normalCount + rotatedCount,
        height: Math.max(normalCount > 0 ? input.pieceLengthMm : 0, rotatedCount > 0 ? input.pieceWidthMm : 0),
        rotations: rotatedCount,
      });
    }
  }

  for (let normalColumns = 1; normalColumns <= normalColumnLimit; normalColumns += 1) {
    for (let rotatedColumns = 1; rotatedColumns <= rotatedColumnLimit; rotatedColumns += 1) {
      if (!fitsSideBySide(normalColumns, rotatedColumns)) continue;
      for (let normalRows = 1; normalColumns * normalRows < producedLimit; normalRows += 1) {
        for (let rotatedRows = 1; ; rotatedRows += 1) {
          const capacity = normalColumns * normalRows + rotatedColumns * rotatedRows;
          if (capacity > producedLimit) break;
          const normalSlots = normalColumns * normalRows;
          for (const produced of new Set([capacity, Math.min(capacity, input.quantity)])) {
            if (produced <= normalSlots) continue;
            patterns.push({
              key: `vertical-${normalColumns}x${normalRows}-${rotatedColumns}x${rotatedRows}`,
              capacity: produced,
              height: Math.max(extent(normalRows, input.pieceLengthMm), extent(rotatedRows, input.pieceWidthMm)),
              rotations: produced - normalSlots,
            });
          }
        }
      }
    }
  }

  const states = Array.from({ length: producedLimit + 1 }, () => new Map<string, OracleState>());
  states[0]!.set('', { quantity: 0, height: 0, rotations: 0, kinds: [] });
  for (let quantity = 0; quantity <= input.quantity; quantity += 1) {
    for (const state of states[quantity]!.values()) {
      for (const pattern of patterns) {
        const nextQuantity = quantity + pattern.capacity;
        if (nextQuantity > producedLimit) continue;
        const height = state.height + (quantity === 0 ? 0 : input.gapMm) + pattern.height;
        if (input.maxLengthMm !== undefined && height + input.startEndMarginMm * 2 > input.maxLengthMm) continue;
        const kinds = state.kinds.includes(pattern.key) ? state.kinds : [...state.kinds, pattern.key].sort();
        const candidate: OracleState = {
          quantity: nextQuantity,
          height,
          rotations: state.rotations + pattern.rotations,
          kinds,
        };
        const kindKey = kinds.join('|');
        const current = states[nextQuantity]!.get(kindKey);
        if (!current || compareTuple([candidate.height, candidate.rotations], [current.height, current.rotations]) < 0) {
          states[nextQuantity]!.set(kindKey, candidate);
        }
      }
    }
  }

  const objective = (state: OracleState): Objective => {
    const length = state.height + input.startEndMarginMm * 2;
    return [
      length,
      Math.max(0, state.quantity - input.quantity),
      input.rollWidthMm * length - state.quantity * input.pieceWidthMm * input.pieceLengthMm,
      state.rotations,
      state.kinds.length,
    ];
  };
  const complete = states.slice(input.quantity).flatMap((state) => [...state.values()]);
  const candidates = complete.length > 0
    ? complete
    : states.slice(1, input.quantity).flatMap((state) => [...state.values()]);
  const best = candidates.reduce<OracleState | undefined>((current, candidate) => {
    if (!current) return candidate;
    if (complete.length === 0 && candidate.quantity !== current.quantity) {
      return candidate.quantity > current.quantity ? candidate : current;
    }
    return compareTuple(objective(candidate), objective(current)) < 0 ? candidate : current;
  }, undefined);
  if (!best) return { producedQuantity: 0, objective: [0, 0, 0, 0, 0] };
  return { producedQuantity: best.quantity, objective: objective(best) };
}

describe('optimizeContinuousRollLayout', () => {
  it('uses no more than 80mm for three 60x40 pieces on a 100mm roll', () => {
    const result = optimizeContinuousRollLayout({
      rollWidthMm: 100,
      pieceWidthMm: 60,
      pieceLengthMm: 40,
      quantity: 3,
      gapMm: 0,
      sideMarginMm: 0,
      startEndMarginMm: 0,
      allowRotation: true,
    });

    expect(result.usedLengthMm).toBeLessThanOrEqual(80);
    expect(result.producedQuantity).toBeGreaterThanOrEqual(3);
  });

  it('keeps placements inside side and start/end margins with gaps between pieces', () => {
    const result = optimizeContinuousRollLayout({
      rollWidthMm: 110,
      pieceWidthMm: 30,
      pieceLengthMm: 30,
      quantity: 4,
      gapMm: 5,
      sideMarginMm: 5,
      startEndMarginMm: 7,
      allowRotation: false,
    });

    expect(result.usedLengthMm).toBe(79);
    expect(result.placements).toHaveLength(4);
    expect(result.placements.every((placement) => (
      placement.x >= 5
      && placement.y >= 7
      && placement.x + placement.width <= 105
      && placement.y + placement.height <= 72
    ))).toBe(true);
    expect(result.placements.every((placement, index) => result.placements.slice(index + 1).every((other) => (
      placement.x + placement.width + 5 <= other.x
      || other.x + other.width + 5 <= placement.x
      || placement.y + placement.height + 5 <= other.y
      || other.y + other.height + 5 <= placement.y
    )))).toBe(true);
  });

  it('avoids overproduction when a partial final row uses the same length', () => {
    const result = optimizeContinuousRollLayout({
      rollWidthMm: 110,
      pieceWidthMm: 30,
      pieceLengthMm: 30,
      quantity: 4,
      gapMm: 5,
      sideMarginMm: 5,
      startEndMarginMm: 0,
      allowRotation: false,
    });

    expect(result.usedLengthMm).toBe(65);
    expect(result.producedQuantity).toBe(4);
    expect(result.overproduction).toBe(0);
  });

  it('rejects quantities above 100,000', () => {
    expect(() => optimizeContinuousRollLayout({
      rollWidthMm: 100,
      pieceWidthMm: 20,
      pieceLengthMm: 20,
      quantity: 100_001,
      gapMm: 0,
      sideMarginMm: 0,
      startEndMarginMm: 0,
      allowRotation: false,
    })).toThrow(ContinuousRollLayoutValidationError);
  });

  it('rejects a piece that cannot fit even when the finite area bound is empty', () => {
    expect(() => optimizeContinuousRollLayout({
      rollWidthMm: 50, pieceWidthMm: 60, pieceLengthMm: 70, quantity: 1,
      gapMm: 0, sideMarginMm: 0, startEndMarginMm: 0, allowRotation: true,
      maxLengthMm: 1,
    })).toThrow(ContinuousRollLayoutValidationError);
  });

  it('does not rotate pieces when rotation is disabled', () => {
    const result = optimizeContinuousRollLayout({
      rollWidthMm: 100, pieceWidthMm: 60, pieceLengthMm: 40, quantity: 3,
      gapMm: 0, sideMarginMm: 0, startEndMarginMm: 0, allowRotation: false,
    });

    expect(result.rotatedCount).toBe(0);
    expect(result.placements.every((placement) => !placement.rotated)).toBe(true);
  });

  it('returns the same layout for identical inputs', () => {
    const input = {
      rollWidthMm: 100, pieceWidthMm: 60, pieceLengthMm: 40, quantity: 3,
      gapMm: 0, sideMarginMm: 0, startEndMarginMm: 0, allowRotation: true,
    };

    expect(optimizeContinuousRollLayout(input)).toEqual(optimizeContinuousRollLayout(input));
  });

  it('labels a safely enumerated small layout exact and reports the same metrics helper route', () => {
    const input: ContinuousRollInput = {
      rollWidthMm: 100, pieceWidthMm: 60, pieceLengthMm: 40, quantity: 5,
      gapMm: 0, sideMarginMm: 0, startEndMarginMm: 0, allowRotation: true,
    };
    const result = optimizeContinuousRollLayout(input);

    expect(result.optimizationStatus).toBe('exact');
    expect(result.lowerBoundLengthMm).toBeGreaterThanOrEqual(0);
    expect(result.optimalityGapMm).toBeGreaterThanOrEqual(0);
    expect(result.planningMetrics).toEqual(getContinuousRollPlanningMetrics(input));
  });

  it('returns only the quantity that fits a finite maximum length', () => {
    const result = optimizeContinuousRollLayout({
      rollWidthMm: 100, pieceWidthMm: 60, pieceLengthMm: 40, quantity: 3,
      gapMm: 0, sideMarginMm: 0, startEndMarginMm: 0, allowRotation: true,
      maxLengthMm: 79,
    });

    expect(result.usedLengthMm).toBeLessThanOrEqual(79);
    expect(result.producedQuantity).toBe(2);
    expect(result.placements.every((placement) => placement.y + placement.height <= 79)).toBe(true);
  });

  it('uses a stacked vertical partition when it shortens the roll', () => {
    const result = optimizeContinuousRollLayout({
      rollWidthMm: 100, pieceWidthMm: 60, pieceLengthMm: 40, quantity: 3,
      gapMm: 0, sideMarginMm: 0, startEndMarginMm: 0, allowRotation: true,
    });

    expect(result.usedLengthMm).toBe(80);
    expect(result.placements).toMatchObject([
      { x: 0, y: 0, width: 60, height: 40, rotated: false },
      { x: 0, y: 40, width: 60, height: 40, rotated: false },
      { x: 60, y: 0, width: 40, height: 60, rotated: true },
    ]);
    expect(result.rowPatterns[0]?.pattern).toContain('vertical-');
  });

  it('packs five 60x40 pieces into the complete 120mm vertical partition', () => {
    const result = optimizeContinuousRollLayout({
      rollWidthMm: 100, pieceWidthMm: 60, pieceLengthMm: 40, quantity: 5,
      gapMm: 0, sideMarginMm: 0, startEndMarginMm: 0, allowRotation: true,
    });

    expect(result.usedLengthMm).toBe(120);
    expect(result.producedQuantity).toBe(5);
    expect(result.rowPatterns).toHaveLength(1);
    expect(result.rowPatterns[0]?.pattern).toBe('vertical-1x3-1x2');
  });

  it('reports populated vertical row counts in pattern identities', () => {
    const result = optimizeContinuousRollLayout({
      rollWidthMm: 100, pieceWidthMm: 60, pieceLengthMm: 40, quantity: 4,
      gapMm: 0, sideMarginMm: 0, startEndMarginMm: 0, allowRotation: true,
    });

    expect(result.rowPatterns.map((pattern) => pattern.pattern)).toContain('vertical-1x3-1x1');
    expect(result.rowPatterns.map((pattern) => pattern.pattern)).not.toContain('vertical-1x3-1x2');
  });

  it('accepts the complete five-piece partition within a finite 120mm remnant', () => {
    const result = optimizeContinuousRollLayout({
      rollWidthMm: 100, pieceWidthMm: 60, pieceLengthMm: 40, quantity: 5,
      gapMm: 0, sideMarginMm: 0, startEndMarginMm: 0, allowRotation: true,
      maxLengthMm: 120,
    });

    expect(result).toMatchObject({ usedLengthMm: 120, producedQuantity: 5 });
  });

  it('preserves ordered row identities and gap-aware coordinates for tie-breaking and preview guides', () => {
    const result = optimizeContinuousRollLayout({
      rollWidthMm: 110, pieceWidthMm: 30, pieceLengthMm: 30, quantity: 4,
      gapMm: 5, sideMarginMm: 5, startEndMarginMm: 7, allowRotation: false,
    });

    expect(result.rowSequence).toMatchObject([
      { pattern: 'row-2-0', startY: 7, endY: 37 },
      { pattern: 'row-2-0', startY: 42, endY: 72 },
    ]);
  });

  it('prefers the shorter rotated partial layout at the finite-length capacity limit', () => {
    const result = optimizeContinuousRollLayout({
      rollWidthMm: 100, pieceWidthMm: 30, pieceLengthMm: 100, quantity: 4,
      gapMm: 0, sideMarginMm: 0, startEndMarginMm: 0, allowRotation: true,
      maxLengthMm: 100,
    });

    expect(result).toMatchObject({ producedQuantity: 3, usedLengthMm: 90, rotatedCount: 3 });
  });

  it('bounds generated candidates at the documented maximum quantity', () => {
    expect(getContinuousRollCandidateCount({
      rollWidthMm: 100, pieceWidthMm: 60, pieceLengthMm: 40, quantity: 100_000,
      gapMm: 0, sideMarginMm: 0, startEndMarginMm: 0, allowRotation: true,
    })).toBeLessThanOrEqual(100);
  });

  it.each([
    { rollWidthMm: 100, pieceWidthMm: 60, pieceLengthMm: 40, quantity: 3, gapMm: 0, sideMarginMm: 0, startEndMarginMm: 0, allowRotation: true },
    { rollWidthMm: 100, pieceWidthMm: 60, pieceLengthMm: 40, quantity: 5, gapMm: 0, sideMarginMm: 0, startEndMarginMm: 0, allowRotation: true },
    { rollWidthMm: 110, pieceWidthMm: 30, pieceLengthMm: 30, quantity: 4, gapMm: 5, sideMarginMm: 5, startEndMarginMm: 7, allowRotation: false },
    { rollWidthMm: 200, pieceWidthMm: 60, pieceLengthMm: 40, quantity: 7, gapMm: 0, sideMarginMm: 0, startEndMarginMm: 0, allowRotation: true },
    { rollWidthMm: 100, pieceWidthMm: 60, pieceLengthMm: 40, quantity: 4, gapMm: 0, sideMarginMm: 0, startEndMarginMm: 0, allowRotation: true },
    { rollWidthMm: 100, pieceWidthMm: 60, pieceLengthMm: 40, quantity: 8, gapMm: 0, sideMarginMm: 0, startEndMarginMm: 0, allowRotation: false, maxLengthMm: 80 },
    { rollWidthMm: 4, pieceWidthMm: 2, pieceLengthMm: 3, quantity: 3, gapMm: 0, sideMarginMm: 0, startEndMarginMm: 0, allowRotation: true },
    { rollWidthMm: 7, pieceWidthMm: 2, pieceLengthMm: 3, quantity: 6, gapMm: 0, sideMarginMm: 0, startEndMarginMm: 0, allowRotation: true },
    { rollWidthMm: 12, pieceWidthMm: 3, pieceLengthMm: 4, quantity: 7, gapMm: 1, sideMarginMm: 0, startEndMarginMm: 0, allowRotation: true },
    { rollWidthMm: 13, pieceWidthMm: 3, pieceLengthMm: 5, quantity: 8, gapMm: 1, sideMarginMm: 1, startEndMarginMm: 2, allowRotation: true },
    { rollWidthMm: 9, pieceWidthMm: 2, pieceLengthMm: 5, quantity: 8, gapMm: 0, sideMarginMm: 0, startEndMarginMm: 1, allowRotation: true, maxLengthMm: 10 },
  ] satisfies ContinuousRollInput[])('matches the exhaustive objective oracle for %o', (input) => {
    const result = optimizeContinuousRollLayout(input);
    const actual: [number, number, number, number, number] = [
      result.usedLengthMm,
      result.overproduction,
      input.rollWidthMm * result.usedLengthMm - result.producedQuantity * input.pieceWidthMm * input.pieceLengthMm,
      result.rotatedCount,
      new Set(result.rowSequence.map((row) => row.pattern)).size,
    ];
    const expected = exhaustiveOracle(input);

    expect(result.producedQuantity).toBe(expected.producedQuantity);
    expect(actual).toEqual(expected.objective);
  });

  it('matches the independent oracle across a deterministic bounded geometry matrix', () => {
    for (let rollWidthMm = 4; rollWidthMm <= 7; rollWidthMm += 1) {
      for (let pieceWidthMm = 1; pieceWidthMm <= 3; pieceWidthMm += 1) {
        for (let pieceLengthMm = 1; pieceLengthMm <= 3; pieceLengthMm += 1) {
          for (let gapMm = 0; gapMm <= 1; gapMm += 1) {
            for (let quantity = 1; quantity <= 5; quantity += 1) {
              const input: ContinuousRollInput = {
                rollWidthMm,
                pieceWidthMm,
                pieceLengthMm,
                quantity,
                gapMm,
                sideMarginMm: 0,
                startEndMarginMm: 0,
                allowRotation: true,
              };
              const result = optimizeContinuousRollLayout(input);
              const expected = exhaustiveOracle(input);
              expect({
                producedQuantity: result.producedQuantity,
                objective: [
                  result.usedLengthMm,
                  result.overproduction,
                  input.rollWidthMm * result.usedLengthMm - result.producedQuantity * input.pieceWidthMm * input.pieceLengthMm,
                  result.rotatedCount,
                  new Set(result.rowSequence.map((row) => row.pattern)).size,
                ],
              }).toEqual(expected);
            }
          }
        }
      }
    }
  });

  it('routes large work through the material-first planner with truthful public metrics', () => {
    const input = {
      rollWidthMm: 100, pieceWidthMm: 60, pieceLengthMm: 40, quantity: 100_000,
      gapMm: 0, sideMarginMm: 0, startEndMarginMm: 0, allowRotation: true,
    } satisfies ContinuousRollInput;
    const metrics = getContinuousRollPlanningMetrics(input);
    const result = optimizeContinuousRollLayout(input);

    expect(metrics).toMatchObject({ strategy: 'material-first' });
    expect(metrics.estimatedWork).toBeGreaterThan(0);
    expect(metrics.retainedStates).toBeGreaterThan(0);
    expect(result).toMatchObject({ planningMetrics: metrics });
    expect(['certified', 'approximate']).toContain(result.optimizationStatus);
    expect(result.lowerBoundLengthMm).toBeGreaterThanOrEqual(0);
    expect(result.optimalityGapMm).toBeGreaterThanOrEqual(0);
  });

  it('chooses a layout no longer than the five-across rotated rows above the compression boundary', () => {
    const result = optimizeContinuousRollLayout({
      rollWidthMm: 200, pieceWidthMm: 60, pieceLengthMm: 40, quantity: 2_001,
      gapMm: 0, sideMarginMm: 0, startEndMarginMm: 0, allowRotation: true,
    });

    expect(result.producedQuantity).toBe(2_001);
    expect(result.usedLengthMm).toBe(24_020);
  });

  it('chooses the shorter all-rotated plan when only one orientation fits efficiently', () => {
    const result = optimizeContinuousRollLayout({
      rollWidthMm: 100, pieceWidthMm: 40, pieceLengthMm: 90, quantity: 2_001,
      gapMm: 0, sideMarginMm: 0, startEndMarginMm: 0, allowRotation: true,
    });

    expect(result).toMatchObject({
      producedQuantity: 2_001,
      usedLengthMm: 80_040,
      rotatedCount: 2_001,
    });
  });

  it('returns the maximum fitting partial quantity above the compression boundary', () => {
    const result = optimizeContinuousRollLayout({
      rollWidthMm: 100, pieceWidthMm: 60, pieceLengthMm: 40, quantity: 2_001,
      gapMm: 0, sideMarginMm: 0, startEndMarginMm: 0, allowRotation: false,
      maxLengthMm: 80,
    });

    expect(result).toMatchObject({ producedQuantity: 2, usedLengthMm: 80, rotatedCount: 0 });
  });

  it('routes an adversarial wide roll before a dense exact allocation', () => {
    expect(getContinuousRollPlanningMetrics({
      rollWidthMm: 1_000_000, pieceWidthMm: 1, pieceLengthMm: 1, quantity: 2_000,
      gapMm: 0, sideMarginMm: 0, startEndMarginMm: 0, allowRotation: true,
    })).toMatchObject({ strategy: 'material-first' });
  });

  it('materializes the exact 2,000-piece wide-roll boundary without candidate expansion', () => {
    const result = optimizeContinuousRollLayout({
      rollWidthMm: 1_000_000, pieceWidthMm: 1, pieceLengthMm: 1, quantity: 2_000,
      gapMm: 0, sideMarginMm: 0, startEndMarginMm: 0, allowRotation: true,
    });

    expect(result).toMatchObject({
      producedQuantity: 2_000,
      usedLengthMm: 1,
      normalCount: 2_000,
      rotatedCount: 0,
    });
    expect(result.rowPatterns).toHaveLength(1);
  });

  it('materializes the representative 100,000-piece perfect tiling as one retained plan', () => {
    const result = optimizeContinuousRollLayout({
      rollWidthMm: 100, pieceWidthMm: 60, pieceLengthMm: 40, quantity: 100_000,
      gapMm: 0, sideMarginMm: 0, startEndMarginMm: 0, allowRotation: true,
    });

    expect(result).toMatchObject({
      producedQuantity: 100_000,
      usedLengthMm: 2_400_000,
      normalCount: 60_000,
      rotatedCount: 40_000,
    });
    expect(result.rowPatterns).toHaveLength(1);
  });

  it('routes W10/3x4/100000 before allocation and reports an honest material-first result', () => {
    const input: ContinuousRollInput = {
      rollWidthMm: 10, pieceWidthMm: 3, pieceLengthMm: 4, quantity: 100_000,
      gapMm: 1, sideMarginMm: 0, startEndMarginMm: 0, allowRotation: true,
    };

    const metrics = getContinuousRollPlanningMetrics(input);
    expect(metrics).toMatchObject({ strategy: 'material-first' });
    expect(metrics.retainedStates).toBeLessThanOrEqual(400_000);

    const result = optimizeContinuousRollLayout(input);
    expect(result.producedQuantity).toBe(100_000);
    expect(['certified', 'approximate']).toContain(result.optimizationStatus);
    expect(result.optimalityGapMm).toBeCloseTo(Math.max(0, result.usedLengthMm - result.lowerBoundLengthMm));
  });

  it('routes W100000/2x3/100000 before allocation with bounded retained states', () => {
    const input: ContinuousRollInput = {
      rollWidthMm: 100_000, pieceWidthMm: 2, pieceLengthMm: 3, quantity: 100_000,
      gapMm: 1, sideMarginMm: 0, startEndMarginMm: 0, allowRotation: true,
    };

    const metrics = getContinuousRollPlanningMetrics(input);
    expect(metrics).toMatchObject({ strategy: 'material-first' });
    expect(metrics.retainedStates).toBeLessThanOrEqual(400_000);
    const result = optimizeContinuousRollLayout(input);
    expect(result.producedQuantity).toBe(100_000);
    expect(['certified', 'approximate']).toContain(result.optimizationStatus);
  });

  it('allows two mixed blocks when they minimize rotations at the optimal length', () => {
    const result = optimizeContinuousRollLayout({
      rollWidthMm: 9, pieceWidthMm: 1, pieceLengthMm: 2, quantity: 15,
      gapMm: 2, sideMarginMm: 0, startEndMarginMm: 0, allowRotation: true,
    });

    expect(result).toMatchObject({
      usedLengthMm: 16,
      producedQuantity: 15,
      overproduction: 0,
      rotatedCount: 8,
    });
    expect(result.rowSequence.map((row) => row.pattern)).toEqual([
      'vertical-2x3-1x4',
      'vertical-1x1-2x2',
    ]);
  });

  it('marks a bounded large material-first witness approximate when it exceeds the physical bound', () => {
    const result = optimizeContinuousRollLayout({
      rollWidthMm: 10, pieceWidthMm: 3, pieceLengthMm: 4, quantity: 100_000,
      gapMm: 1, sideMarginMm: 0, startEndMarginMm: 0, allowRotation: true,
    });

    expect(result.optimizationStatus).toBe('approximate');
    expect(result.usedLengthMm).toBeGreaterThan(result.lowerBoundLengthMm);
    expect(result.optimalityGapMm).toBeCloseTo(result.usedLengthMm - result.lowerBoundLengthMm);
  });

  it('compares approximate mixed orientation against deterministic direction baselines', () => {
    const input: ContinuousRollInput = {
      rollWidthMm: 10, pieceWidthMm: 3, pieceLengthMm: 4, quantity: 100_000,
      gapMm: 1, sideMarginMm: 0, startEndMarginMm: 0, allowRotation: true,
    };
    const candidates = compareContinuousRollCandidates(input);

    expect(candidates.map((candidate) => candidate.name)).toEqual(['최적 혼합', '순방향', '회전 방향']);
    expect(candidates[0]?.result.optimizationStatus).toBe('approximate');
    expect(candidates.every((candidate) => candidate.result.producedQuantity > 0)).toBe(true);
    expect(candidates[1]?.savedLengthMm).toBeGreaterThanOrEqual(0);
    expect(candidates[2]?.savedLengthMm).toBeGreaterThanOrEqual(0);
  });

  it('fails over to material-first when an admitted exact pattern search reaches its runtime cap', () => {
    const input: ContinuousRollInput = {
      rollWidthMm: 4, pieceWidthMm: 1, pieceLengthMm: 1.000001, quantity: 20,
      gapMm: 0, sideMarginMm: 0, startEndMarginMm: 0, allowRotation: true,
    };
    const result = optimizeContinuousRollLayout(input);

    expect(result.optimizationStatus).not.toBe('exact');
    expect(result.planningMetrics.strategy).toBe('material-first');
    expect(result.planningMetrics).toEqual(getContinuousRollPlanningMetrics(input));
  });

  it('reports actual exact-pattern retained work for a large-dimension three-piece layout', () => {
    const input: ContinuousRollInput = {
      rollWidthMm: 1_000_003, pieceWidthMm: 1_000_001, pieceLengthMm: 1_000_000, quantity: 3,
      gapMm: 0, sideMarginMm: 0, startEndMarginMm: 0, allowRotation: true,
    };
    const result = optimizeContinuousRollLayout(input);

    expect(result.optimizationStatus).toBe('exact');
    expect(result.planningMetrics.strategy).toBe('exact');
    expect(result.planningMetrics.retainedStates).toBeGreaterThan(0);
    expect(result.planningMetrics).toEqual(getContinuousRollPlanningMetrics(input));
  });
});
