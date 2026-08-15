import { describe, expect, it } from 'vitest';
import { ContinuousRollInput, ContinuousRollLayoutValidationError, getContinuousRollCandidateCount, getContinuousRollPlanningMetrics, optimizeContinuousRollLayout } from './optimizeContinuousRollLayout';

type OraclePattern = { key: string; capacity: number; height: number; rotations: number };
type OracleState = { quantity: number; height: number; rotations: number; kinds: string[] };

function exhaustiveObjective(input: ContinuousRollInput): [number, number, number, number, number] {
  const usableWidth = input.rollWidthMm - input.sideMarginMm * 2;
  const countIn = (size: number) => Math.floor((usableWidth + input.gapMm) / (size + input.gapMm));
  const patterns: OraclePattern[] = [];
  const add = (key: string, capacity: number, height: number, rotations: number) => patterns.push({ key, capacity, height, rotations });
  const normalColumns = countIn(input.pieceWidthMm);
  const rotatedColumns = input.allowRotation ? countIn(input.pieceLengthMm) : 0;
  for (let count = 1; count <= normalColumns; count += 1) add(`n${count}`, count, input.pieceLengthMm, 0);
  for (let count = 1; count <= rotatedColumns; count += 1) add(`r${count}`, count, input.pieceWidthMm, count);
  for (let normalRows = 1; normalRows <= input.quantity; normalRows += 1) for (let rotatedRows = 1; rotatedRows <= input.quantity; rotatedRows += 1) {
    const capacity = normalRows + rotatedRows;
    if (input.allowRotation && normalColumns >= 1 && rotatedColumns >= 1 && capacity <= input.quantity && input.pieceWidthMm + input.gapMm + input.pieceLengthMm <= usableWidth) {
      add(`v${normalRows}-${rotatedRows}`, capacity, Math.max(normalRows * input.pieceLengthMm + (normalRows - 1) * input.gapMm, rotatedRows * input.pieceWidthMm + (rotatedRows - 1) * input.gapMm), rotatedRows);
    }
  }
  const states = Array.from({ length: input.quantity + 1 }, () => new Map<string, OracleState>());
  states[0]!.set('', { quantity: 0, height: 0, rotations: 0, kinds: [] });
  for (let quantity = 0; quantity <= input.quantity; quantity += 1) for (const state of states[quantity]!.values()) for (const pattern of patterns) {
    const nextQuantity = quantity + pattern.capacity;
    if (nextQuantity > input.quantity) continue;
    const height = state.height + (state.quantity === 0 ? 0 : input.gapMm) + pattern.height;
    const length = height + input.startEndMarginMm * 2;
    if (input.maxLengthMm !== undefined && length > input.maxLengthMm) continue;
    const kinds = state.kinds.includes(pattern.key) ? state.kinds : [...state.kinds, pattern.key].sort();
    const key = kinds.join('|'); const current = states[nextQuantity]!.get(key);
    const candidate = { quantity: nextQuantity, height, rotations: state.rotations + pattern.rotations, kinds };
    if (!current || height < current.height || (height === current.height && candidate.rotations < current.rotations)) states[nextQuantity]!.set(key, candidate);
  }
  const all = [...states[input.quantity]!.values()];
  const best = all.slice(1).reduce<OracleState>((current, state) => {
    const tuple = (item: OracleState): [number, number, number, number, number] => {
      const length = item.height + input.startEndMarginMm * 2;
      return [length, input.quantity - item.quantity, input.rollWidthMm * length - item.quantity * input.pieceWidthMm * input.pieceLengthMm, item.rotations, item.kinds.length];
    };
    const candidateTuple = tuple(state); const currentTuple = tuple(current);
    return candidateTuple.some((value, index) => value !== currentTuple[index]! && candidateTuple.slice(0, index).every((prior, priorIndex) => prior === currentTuple[priorIndex]!) && value < currentTuple[index]!) ? state : current;
  }, all[0]!);
  const length = best.height + input.startEndMarginMm * 2;
  return [length, input.quantity - best.quantity, input.rollWidthMm * length - best.quantity * input.pieceWidthMm * input.pieceLengthMm, best.rotations, best.kinds.length];
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
  ] satisfies ContinuousRollInput[])('matches the exhaustive objective oracle for %o', (input) => {
    const result = optimizeContinuousRollLayout(input);
    const actual: [number, number, number, number, number] = [
      result.usedLengthMm,
      result.overproduction,
      input.rollWidthMm * result.usedLengthMm - result.producedQuantity * input.pieceWidthMm * input.pieceLengthMm,
      result.rotatedCount,
      new Set(result.rowSequence.map((row) => row.pattern)).size,
    ];

    expect(actual).toEqual(exhaustiveObjective(input));
  });

  it('uses a compressed plan with a bounded state count at quantity 100,000', () => {
    expect(getContinuousRollPlanningMetrics({
      rollWidthMm: 100, pieceWidthMm: 60, pieceLengthMm: 40, quantity: 100_000,
      gapMm: 0, sideMarginMm: 0, startEndMarginMm: 0, allowRotation: true,
    })).toMatchObject({ strategy: 'compressed', stateCount: 1 });
  });
});
