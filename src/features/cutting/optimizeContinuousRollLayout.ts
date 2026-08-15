export type ContinuousRollInput = { rollWidthMm: number; pieceWidthMm: number; pieceLengthMm: number; quantity: number; gapMm: number; sideMarginMm: number; startEndMarginMm: number; allowRotation: boolean; maxLengthMm?: number };

export type Placement = { id: number; x: number; y: number; width: number; height: number; rotated: boolean };

export type RowPatternUsage = { pattern: string; count: number; capacity: number; occupiedHeightMm: number; normalCount: number; rotatedCount: number; estimatedCutLines: number };
export type RowSequenceEntry = Omit<RowPatternUsage, 'count'> & { startY: number; endY: number };

export type ContinuousRollResult = {
  placements: Placement[]; usedLengthMm: number; producedQuantity: number; overproduction: number;
  utilizationPercent: number; wastePercent: number; normalCount: number; rotatedCount: number;
  rowPatterns: RowPatternUsage[]; rowSequence: RowSequenceEntry[]; estimatedCutLines: number;
};

export class ContinuousRollLayoutValidationError extends Error {}

type Pattern = Omit<RowPatternUsage, 'count'> & { placements: Omit<Placement, 'id'>[] };
type State = { quantity: number; contentLengthMm: number; rotations: number; patternKinds: string[]; previous?: State; pattern?: Pattern };

function positive(name: string, value: number): void {
  if (!Number.isFinite(value) || value <= 0) throw new ContinuousRollLayoutValidationError(`${name}은(는) 0보다 큰 숫자여야 합니다.`);
}

function nonNegative(name: string, value: number): void {
  if (!Number.isFinite(value) || value < 0) throw new ContinuousRollLayoutValidationError(`${name}은(는) 0 이상이어야 합니다.`);
}

function validate(input: ContinuousRollInput): ContinuousRollInput {
  positive('원단 폭', input.rollWidthMm); positive('재단 폭', input.pieceWidthMm); positive('재단 길이', input.pieceLengthMm); positive('수량', input.quantity);
  nonNegative('재단 간격', input.gapMm); nonNegative('좌우 여백', input.sideMarginMm); nonNegative('시작/끝 여백', input.startEndMarginMm);
  if (!Number.isInteger(input.quantity)) throw new ContinuousRollLayoutValidationError('수량은 정수여야 합니다.');
  if (input.quantity > 100_000) throw new ContinuousRollLayoutValidationError('수량은 100,000개 이하여야 합니다.');
  if (input.maxLengthMm !== undefined) positive('최대 길이', input.maxLengthMm);
  if (input.rollWidthMm - input.sideMarginMm * 2 <= 0) throw new ContinuousRollLayoutValidationError('좌우 여백이 원단 폭보다 큽니다.');
  return input;
}

function extent(count: number, size: number, gap: number): number { return count * size + Math.max(0, count - 1) * gap; }
function countIn(space: number, size: number, gap: number): number { return Math.max(0, Math.floor((space + gap) / (size + gap))); }

function makePattern(pattern: string, placements: Omit<Placement, 'id'>[], occupiedHeightMm: number): Pattern {
  const normalCount = placements.filter((placement) => !placement.rotated).length;
  return { pattern, capacity: placements.length, occupiedHeightMm, normalCount, rotatedCount: placements.length - normalCount, estimatedCutLines: placements.length + 1, placements };
}

function generateRowPatterns(input: ContinuousRollInput): Pattern[] {
  const usableWidth = input.rollWidthMm - input.sideMarginMm * 2;
  const normalLimit = Math.min(countIn(usableWidth, input.pieceWidthMm, input.gapMm), input.quantity);
  const rotatedLimit = input.allowRotation ? Math.min(countIn(usableWidth, input.pieceLengthMm, input.gapMm), input.quantity) : 0;
  const patterns: Pattern[] = [];
  for (let normalCount = 1; normalCount <= normalLimit; normalCount += 1) {
    patterns.push(makePattern(`row-${normalCount}-0`, Array.from({ length: normalCount }, (_, index) => ({ x: index * (input.pieceWidthMm + input.gapMm), y: 0, width: input.pieceWidthMm, height: input.pieceLengthMm, rotated: false })), input.pieceLengthMm));
  }
  for (let rotatedCount = 1; rotatedCount <= rotatedLimit; rotatedCount += 1) {
    patterns.push(makePattern(`row-0-${rotatedCount}`, Array.from({ length: rotatedCount }, (_, index) => ({ x: index * (input.pieceLengthMm + input.gapMm), y: 0, width: input.pieceLengthMm, height: input.pieceWidthMm, rotated: true })), input.pieceWidthMm));
  }
  for (let normalCount = 1; normalCount <= normalLimit; normalCount += 1) {
    const normalWidth = extent(normalCount, input.pieceWidthMm, input.gapMm);
    for (let rotatedCount = 1; rotatedCount <= rotatedLimit; rotatedCount += 1) {
      if (normalWidth + input.gapMm + extent(rotatedCount, input.pieceLengthMm, input.gapMm) > usableWidth) continue;
      patterns.push(makePattern(`row-${normalCount}-${rotatedCount}`, [
        ...Array.from({ length: normalCount }, (_, index) => ({ x: index * (input.pieceWidthMm + input.gapMm), y: 0, width: input.pieceWidthMm, height: input.pieceLengthMm, rotated: false })),
        ...Array.from({ length: rotatedCount }, (_, index) => ({ x: normalWidth + input.gapMm + index * (input.pieceLengthMm + input.gapMm), y: 0, width: input.pieceLengthMm, height: input.pieceWidthMm, rotated: true })),
      ], Math.max(input.pieceLengthMm, input.pieceWidthMm)));
    }
  }
  if (input.allowRotation) {
    for (let normalColumns = 1; normalColumns <= normalLimit; normalColumns += 1) {
      const normalWidth = extent(normalColumns, input.pieceWidthMm, input.gapMm);
      for (let rotatedColumns = 1; rotatedColumns <= rotatedLimit; rotatedColumns += 1) {
        if (normalWidth + input.gapMm + extent(rotatedColumns, input.pieceLengthMm, input.gapMm) > usableWidth) continue;
        const normalRows = Math.floor(input.quantity / normalColumns);
        const rotatedRows = Math.floor(input.quantity / rotatedColumns);
        for (let normalCount = 1; normalCount <= normalRows; normalCount += 1) for (let rotatedCount = 1; rotatedCount <= rotatedRows; rotatedCount += 1) {
          if (normalColumns * normalCount + rotatedColumns * rotatedCount > input.quantity) continue;
          const normalHeight = extent(normalCount, input.pieceLengthMm, input.gapMm);
          const rotatedHeight = extent(rotatedCount, input.pieceWidthMm, input.gapMm);
          patterns.push(makePattern(`vertical-${normalColumns}x${normalCount}-${rotatedColumns}x${rotatedCount}`, [
            ...Array.from({ length: normalColumns * normalCount }, (_, index) => ({ x: (index % normalColumns) * (input.pieceWidthMm + input.gapMm), y: Math.floor(index / normalColumns) * (input.pieceLengthMm + input.gapMm), width: input.pieceWidthMm, height: input.pieceLengthMm, rotated: false })),
            ...Array.from({ length: rotatedColumns * rotatedCount }, (_, index) => ({ x: normalWidth + input.gapMm + (index % rotatedColumns) * (input.pieceLengthMm + input.gapMm), y: Math.floor(index / rotatedColumns) * (input.pieceWidthMm + input.gapMm), width: input.pieceLengthMm, height: input.pieceWidthMm, rotated: true })),
          ], Math.max(normalHeight, rotatedHeight)));
        }
      }
    }
  }
  return patterns;
}

function isBetterState(candidate: State, current: State): boolean {
  if (candidate.contentLengthMm !== current.contentLengthMm) return candidate.contentLengthMm < current.contentLengthMm;
  if (candidate.rotations !== current.rotations) return candidate.rotations < current.rotations;
  return false;
}

function usedLength(contentLengthMm: number, input: ContinuousRollInput): number { return contentLengthMm + input.startEndMarginMm * 2; }

function emptyResult(): ContinuousRollResult {
  return { placements: [], usedLengthMm: 0, producedQuantity: 0, overproduction: 0, utilizationPercent: 0, wastePercent: 100, normalCount: 0, rotatedCount: 0, rowPatterns: [], rowSequence: [], estimatedCutLines: 0 };
}

export function optimizeContinuousRollLayout(rawInput: ContinuousRollInput): ContinuousRollResult {
  const input = validate(rawInput);
  const patterns = generateRowPatterns(input);
  if (patterns.length === 0) throw new ContinuousRollLayoutValidationError('재단 규격이 가용 원단 폭보다 큽니다.');
  const maxCapacity = Math.max(...patterns.map((pattern) => pattern.capacity));
  const states: Array<Map<string, State>> = Array.from({ length: input.quantity + maxCapacity + 1 }, () => new Map());
  states[0]!.set('', { quantity: 0, contentLengthMm: 0, rotations: 0, patternKinds: [] });
  for (let quantity = 0; quantity <= input.quantity; quantity += 1) {
    for (const state of states[quantity]!.values()) for (const pattern of patterns) {
      const nextQuantity = quantity + pattern.capacity;
      const contentLengthMm = state.quantity === 0 ? pattern.occupiedHeightMm : state.contentLengthMm + input.gapMm + pattern.occupiedHeightMm;
      if (input.maxLengthMm !== undefined && usedLength(contentLengthMm, input) > input.maxLengthMm) continue;
      const patternKinds = state.patternKinds.includes(pattern.pattern)
        ? state.patternKinds
        : [...state.patternKinds, pattern.pattern].sort();
      const candidate: State = { quantity: nextQuantity, contentLengthMm, rotations: state.rotations + pattern.rotatedCount, patternKinds, previous: state, pattern };
      const kindKey = patternKinds.join('|');
      const nextStates = states[nextQuantity]!;
      const current = nextStates.get(kindKey);
      if (!current || isBetterState(candidate, current)) nextStates.set(kindKey, candidate);
    }
  }
  const complete = states.slice(input.quantity).flatMap((state) => [...state.values()]);
  const best = complete.reduce<State | undefined>((current, state) => {
    if (!current) return state;
    const currentLength = usedLength(current.contentLengthMm, input); const stateLength = usedLength(state.contentLengthMm, input);
    if (stateLength !== currentLength) return stateLength < currentLength ? state : current;
    if (state.quantity !== current.quantity) return state.quantity < current.quantity ? state : current;
    const stateWaste = input.rollWidthMm * stateLength - state.quantity * input.pieceWidthMm * input.pieceLengthMm;
    const currentWaste = input.rollWidthMm * currentLength - current.quantity * input.pieceWidthMm * input.pieceLengthMm;
    if (stateWaste !== currentWaste) return stateWaste < currentWaste ? state : current;
    if (state.rotations !== current.rotations) return state.rotations < current.rotations ? state : current;
    return state.patternKinds.length < current.patternKinds.length ? state : current;
  }, undefined) ?? states.reduce<State | undefined>((current, candidates) => [...candidates.values()].reduce<State | undefined>((best, state) => (!best || state.quantity > best.quantity ? state : best), current), undefined);
  if (!best || best.quantity === 0) return emptyResult();
  const sequence: Pattern[] = [];
  for (let cursor: State | undefined = best; cursor?.pattern; cursor = cursor.previous) sequence.unshift(cursor.pattern);
  let y = input.startEndMarginMm;
  const rowSequence: RowSequenceEntry[] = [];
  const placements = sequence.flatMap((pattern) => {
    const startY = y;
    const row = pattern.placements.map((placement) => ({ ...placement, x: placement.x + input.sideMarginMm, y: placement.y + y }));
    y += pattern.occupiedHeightMm;
    rowSequence.push({ ...pattern, startY, endY: y });
    y += input.gapMm; return row;
  }).map((placement, index) => ({ ...placement, id: index + 1 }));
  const normalCount = placements.filter((placement) => !placement.rotated).length;
  const length = usedLength(best.contentLengthMm, input);
  const utilizationPercent = Math.round((placements.length * input.pieceWidthMm * input.pieceLengthMm / (input.rollWidthMm * length)) * 10000) / 100;
  const usage = new Map<string, RowPatternUsage>();
  for (const pattern of sequence) { const previous = usage.get(pattern.pattern); usage.set(pattern.pattern, { ...pattern, count: (previous?.count ?? 0) + 1 }); }
  return { placements, usedLengthMm: length, producedQuantity: placements.length, overproduction: Math.max(0, placements.length - input.quantity), utilizationPercent, wastePercent: Math.round((100 - utilizationPercent) * 100) / 100, normalCount, rotatedCount: placements.length - normalCount, rowPatterns: [...usage.values()], rowSequence, estimatedCutLines: sequence.reduce((total, pattern) => total + pattern.estimatedCutLines, 0) };
}
