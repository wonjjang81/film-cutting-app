export type ContinuousRollInput = { rollWidthMm: number; pieceWidthMm: number; pieceLengthMm: number; quantity: number; gapMm: number; sideMarginMm: number; startEndMarginMm: number; allowRotation: boolean; maxLengthMm?: number };

export type Placement = { id: number; x: number; y: number; width: number; height: number; rotated: boolean };

export type RowPatternUsage = { pattern: string; count: number; capacity: number; occupiedHeightMm: number; normalCount: number; rotatedCount: number; estimatedCutLines: number };
export type RowSequenceEntry = Omit<RowPatternUsage, 'count'> & { startY: number; endY: number };

export type ContinuousRollResult = {
  placements: Placement[]; usedLengthMm: number; producedQuantity: number; overproduction: number;
  utilizationPercent: number; wastePercent: number; normalCount: number; rotatedCount: number;
  rowPatterns: RowPatternUsage[]; rowSequence: RowSequenceEntry[]; estimatedCutLines: number;
  optimizationStatus: 'exact' | 'certified' | 'approximate';
  lowerBoundLengthMm: number;
  optimalityGapMm: number;
  planningMetrics: ContinuousRollPlanningMetrics;
};

export type ContinuousRollPlanningMetrics = {
  strategy: 'exact' | 'material-first';
  estimatedWork: number;
  retainedStates: number;
};

export class ContinuousRollLayoutValidationError extends Error {}

/** Deliberately small browser budgets. The exact path aborts before exceeding either bound. */
const EXACT_RETAINED_STATE_LIMIT = 50_000;
const EXACT_WORK_LIMIT = 100_000_000;

type Pattern = Omit<RowPatternUsage, 'count'> & { placements: Omit<Placement, 'id'>[] };
type PureRows = { normalRows: number; rotatedRows: number; normalPieces: number; rotatedPieces: number };
type VerticalBlock = {
  normalColumns: number; normalRows: number; rotatedColumns: number; rotatedRows: number;
  normalPieces: number; rotatedPieces: number; occupiedHeightMm: number;
};
type CompactPlan = {
  adjustedLengthMm: number;
  rotations: number;
  patternKindCount: number;
  pure: PureRows;
  vertical?: VerticalBlock;
  sequence?: Pattern[];
  signature: string;
};

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

function extent(count: number, size: number, gap: number): number {
  return count * size + Math.max(0, count - 1) * gap;
}

function countIn(space: number, size: number, gap: number): number {
  return Math.max(0, Math.floor((space + gap) / (size + gap)));
}

function greatestCommonDivisor(left: number, right: number): number {
  let a = left;
  let b = right;
  while (b !== 0) [a, b] = [b, a % b];
  return a;
}

function decimalInteger(value: number): { integer: bigint; scale: number } {
  const [coefficient, exponentText] = value.toString().toLowerCase().split('e');
  const exponent = exponentText === undefined ? 0 : Number(exponentText);
  const [whole, fraction = ''] = coefficient!.split('.');
  const unsignedDigits = `${whole}${fraction}`.replace(/^\+/, '');
  const scale = fraction.length - exponent;
  if (scale <= 0) {
    return { integer: BigInt(unsignedDigits) * (10n ** BigInt(-scale)), scale: 0 };
  }
  return { integer: BigInt(unsignedDigits), scale };
}

/** Exact decimal gcd for the two row-height steps; failure only disables the fast proof. */
function rowHeightQuantum(input: ContinuousRollInput): number | undefined {
  const normal = decimalInteger(input.pieceLengthMm + input.gapMm);
  const rotated = decimalInteger(input.pieceWidthMm + input.gapMm);
  const scale = Math.max(normal.scale, rotated.scale);
  const normalInteger = normal.integer * (10n ** BigInt(scale - normal.scale));
  const rotatedInteger = rotated.integer * (10n ** BigInt(scale - rotated.scale));
  let left = normalInteger;
  let right = rotatedInteger;
  while (right !== 0n) [left, right] = [right, left % right];
  const quantum = Number(left) * (10 ** -scale);
  return Number.isFinite(quantum) && quantum > 0 ? quantum : undefined;
}

/**
 * Every adjusted block height is a multiple of gcd(length+gap, width+gap).
 * Also, every piece consumes at least
 * (width+gap)*(length+gap)/(usableWidth+gap) adjusted roll length in the
 * continuous relaxation. If the preceding lattice point is below that lower
 * bound, the supplied feasible plan is globally length-optimal.
 */
function reachesLatticeLengthLowerBound(plan: CompactPlan, quantity: number, input: ContinuousRollInput, usableWidth: number): boolean {
  const quantum = rowHeightQuantum(input);
  if (quantum === undefined) return false;
  const continuousLowerBound = quantity
    * (input.pieceWidthMm + input.gapMm)
    * (input.pieceLengthMm + input.gapMm)
    / (usableWidth + input.gapMm);
  if (!Number.isFinite(continuousLowerBound)) return false;
  // Subtracting a slightly smaller quantum is conservative under Number rounding.
  const precedingLatticePointUpperBound = plan.adjustedLengthMm - quantum * (1 - 1e-12);
  return precedingLatticePointUpperBound < continuousLowerBound;
}

function rowKindCount(pieces: number, rows: number): number {
  if (pieces === 0 || rows === 0) return 0;
  return pieces % rows === 0 ? 1 : 2;
}

function comparePlans(candidate: CompactPlan, current: CompactPlan | undefined): boolean {
  if (!current) return true;
  if (candidate.adjustedLengthMm !== current.adjustedLengthMm) return candidate.adjustedLengthMm < current.adjustedLengthMm;
  if (candidate.rotations !== current.rotations) return candidate.rotations < current.rotations;
  if (candidate.patternKindCount !== current.patternKindCount) return candidate.patternKindCount < current.patternKindCount;
  return candidate.signature < current.signature;
}

/**
 * Exact two-item covering. Once the denser row orientation is known, an
 * optimum uses fewer than capacity/gcd rows of the other orientation: a full
 * group beyond that can be exchanged for equal capacity at no greater length.
 */
function planPureRows(quantity: number, input: ContinuousRollInput, normalCapacity: number, rotatedCapacity: number): CompactPlan {
  if (quantity === 0) {
    return {
      adjustedLengthMm: 0,
      rotations: 0,
      patternKindCount: 0,
      pure: { normalRows: 0, rotatedRows: 0, normalPieces: 0, rotatedPieces: 0 },
      signature: '',
    };
  }
  const normalCost = input.pieceLengthMm + input.gapMm;
  const rotatedCost = input.pieceWidthMm + input.gapMm;
  let best: CompactPlan | undefined;
  const consider = (normalRows: number, rotatedRows: number): void => {
    if (normalRows === 0 && rotatedRows === 0) return;
    const normalPieces = Math.min(quantity, normalRows * normalCapacity);
    const rotatedPieces = quantity - normalPieces;
    if (rotatedPieces > rotatedRows * rotatedCapacity) return;
    const usedRotatedRows = rotatedPieces === 0 ? 0 : Math.ceil(rotatedPieces / rotatedCapacity);
    const usedNormalRows = normalPieces === 0 ? 0 : Math.ceil(normalPieces / normalCapacity);
    const candidate: CompactPlan = {
      adjustedLengthMm: usedNormalRows * normalCost + usedRotatedRows * rotatedCost,
      rotations: rotatedPieces,
      patternKindCount: rowKindCount(normalPieces, usedNormalRows) + rowKindCount(rotatedPieces, usedRotatedRows),
      pure: { normalRows: usedNormalRows, rotatedRows: usedRotatedRows, normalPieces, rotatedPieces },
      signature: `p-${usedNormalRows}-${usedRotatedRows}-${normalPieces}-${rotatedPieces}`,
    };
    if (comparePlans(candidate, best)) best = candidate;
  };

  if (normalCapacity === 0) {
    consider(0, Math.ceil(quantity / rotatedCapacity));
    return best!;
  }
  if (rotatedCapacity === 0) {
    consider(Math.ceil(quantity / normalCapacity), 0);
    return best!;
  }

  const divisor = greatestCommonDivisor(normalCapacity, rotatedCapacity);
  const normalIsDenser = normalCost * rotatedCapacity <= rotatedCost * normalCapacity;
  if (normalIsDenser) {
    consider(Math.ceil(quantity / normalCapacity), 0);
    const maximumRotatedRows = Math.min(Math.ceil(quantity / rotatedCapacity), Math.floor(normalCapacity / divisor));
    for (let rotatedRows = 1; rotatedRows <= maximumRotatedRows; rotatedRows += 1) {
      consider(Math.max(0, Math.ceil((quantity - rotatedRows * rotatedCapacity) / normalCapacity)), rotatedRows);
    }
  } else {
    consider(0, Math.ceil(quantity / rotatedCapacity));
    const maximumNormalRows = Math.min(Math.ceil(quantity / normalCapacity), Math.floor(rotatedCapacity / divisor));
    for (let normalRows = 1; normalRows <= maximumNormalRows; normalRows += 1) {
      consider(normalRows, Math.max(0, Math.ceil((quantity - normalRows * normalCapacity) / rotatedCapacity)));
    }
  }
  return best!;
}

/** A zero-gap perfect tiling reaches the physical area lower bound exactly. */
function planPerfectTiling(
  quantity: number,
  input: ContinuousRollInput,
  usableWidth: number,
  normalCapacity: number,
  rotatedCapacity: number,
): CompactPlan | undefined {
  if (input.gapMm !== 0) return undefined;
  const contentLengthMm = quantity * input.pieceWidthMm * input.pieceLengthMm / usableWidth;
  let best: CompactPlan | undefined;
  const closeToInteger = (value: number): number | undefined => {
    const rounded = Math.round(value);
    return Math.abs(value - rounded) <= Number.EPSILON * Math.max(1, Math.abs(value)) * 16 ? rounded : undefined;
  };
  const normalRows = closeToInteger(contentLengthMm / input.pieceLengthMm);
  const rotatedRows = closeToInteger(contentLengthMm / input.pieceWidthMm);
  if (normalRows === undefined || rotatedRows === undefined) return undefined;
  for (let rotatedColumns = 0; rotatedColumns <= Math.min(rotatedCapacity, quantity); rotatedColumns += 1) {
    if (rotatedColumns > 0 && !input.allowRotation) continue;
    const normalColumns = closeToInteger((usableWidth - rotatedColumns * input.pieceLengthMm) / input.pieceWidthMm);
    if (normalColumns === undefined || normalColumns < 0 || normalColumns > normalCapacity) continue;
    if (normalColumns === 0 && rotatedColumns === 0) continue;
    const normalPieces = normalColumns * normalRows;
    const rotatedPieces = rotatedColumns * rotatedRows;
    if (normalPieces + rotatedPieces !== quantity) continue;
    const pure: PureRows = normalColumns === 0 || rotatedColumns === 0
      ? {
        normalRows: normalColumns > 0 ? normalRows : 0,
        rotatedRows: rotatedColumns > 0 ? rotatedRows : 0,
        normalPieces,
        rotatedPieces,
      }
      : { normalRows: 0, rotatedRows: 0, normalPieces: 0, rotatedPieces: 0 };
    const vertical = normalColumns > 0 && rotatedColumns > 0
      ? {
        normalColumns,
        normalRows,
        rotatedColumns,
        rotatedRows,
        normalPieces,
        rotatedPieces,
        occupiedHeightMm: contentLengthMm,
      }
      : undefined;
    const candidate: CompactPlan = {
      adjustedLengthMm: contentLengthMm,
      rotations: rotatedPieces,
      patternKindCount: 1,
      pure,
      vertical,
      signature: `tile-${normalColumns}-${rotatedColumns}-${normalRows}-${rotatedRows}`,
    };
    if (comparePlans(candidate, best)) best = candidate;
  }
  return best;
}

function hasCertifiedDirectPlan(
  quantity: number,
  input: ContinuousRollInput,
  usableWidth: number,
  normalCapacity: number,
  rotatedCapacity: number,
  pure: CompactPlan,
): boolean {
  const shortestPieceHeight = Math.min(
    normalCapacity > 0 ? input.pieceLengthMm : Number.POSITIVE_INFINITY,
    rotatedCapacity > 0 ? input.pieceWidthMm : Number.POSITIVE_INFINITY,
  );
  return pure.adjustedLengthMm - input.gapMm === shortestPieceHeight
    || !input.allowRotation
    || normalCapacity === 0
    || rotatedCapacity === 0
    || input.pieceWidthMm + input.gapMm + input.pieceLengthMm > usableWidth
    || input.pieceWidthMm === input.pieceLengthMm
    || planPerfectTiling(quantity, input, usableWidth, normalCapacity, rotatedCapacity) !== undefined
    || (pure.rotations === 0 && reachesLatticeLengthLowerBound(pure, quantity, input, usableWidth));
}

type RotationBoundPattern = { costTicks: number; capacity: number; rotations: number };

function certifySingleLatticePattern(
  quantity: number,
  input: ContinuousRollInput,
  usableWidth: number,
  normalCapacity: number,
  rotatedCapacity: number,
): CompactPlan | undefined {
  if (!input.allowRotation || normalCapacity === 0 || rotatedCapacity === 0) return undefined;
  const quantum = rowHeightQuantum(input);
  if (quantum === undefined) return undefined;
  const normalStepTicks = Math.round((input.pieceLengthMm + input.gapMm) / quantum);
  const rotatedStepTicks = Math.round((input.pieceWidthMm + input.gapMm) / quantum);
  if (normalStepTicks <= 0 || rotatedStepTicks <= 0) return undefined;
  const continuousLowerBound = quantity
    * (input.pieceWidthMm + input.gapMm)
    * (input.pieceLengthMm + input.gapMm)
    / (usableWidth + input.gapMm);
  const costTicks = Math.ceil(continuousLowerBound / quantum);
  const adjustedLengthMm = costTicks * quantum;
  if (adjustedLengthMm - quantum * (1 - 1e-12) >= continuousLowerBound) return undefined;
  const normalRows = Math.floor(costTicks / normalStepTicks);
  const rotatedRows = Math.floor(costTicks / rotatedStepTicks);
  if (normalRows === 0 || rotatedRows === 0) return undefined;
  const normalWidthStep = input.pieceWidthMm + input.gapMm;
  const rotatedWidthStep = input.pieceLengthMm + input.gapMm;
  let candidate: CompactPlan | undefined;
  for (let rotatedColumns = 1; rotatedColumns <= Math.min(rotatedCapacity, quantity); rotatedColumns += 1) {
    const remainingAdjustedWidth = usableWidth + input.gapMm - rotatedColumns * rotatedWidthStep;
    const normalColumns = Math.min(normalCapacity, quantity, Math.floor(remainingAdjustedWidth / normalWidthStep));
    if (normalColumns <= 0) continue;
    const normalPieces = normalColumns * normalRows;
    const rotatedPieces = rotatedColumns * rotatedRows;
    if (normalPieces + rotatedPieces !== quantity) continue;
    const occupiedHeightMm = adjustedLengthMm - input.gapMm;
    const plan: CompactPlan = {
      adjustedLengthMm,
      rotations: rotatedPieces,
      patternKindCount: 1,
      pure: { normalRows: 0, rotatedRows: 0, normalPieces: 0, rotatedPieces: 0 },
      vertical: {
        normalColumns, normalRows, rotatedColumns, rotatedRows,
        normalPieces, rotatedPieces, occupiedHeightMm,
      },
      signature: `lattice-${normalColumns}-${normalRows}-${rotatedColumns}-${rotatedRows}`,
    };
    if (comparePlans(plan, candidate)) candidate = plan;
  }
  if (!candidate || candidate.rotations === 0) return candidate;

  // Prove the single block's rotation count: with a smaller rotation budget,
  // maximize producible quantity over every lattice cost and every mixed
  // frontier. If none reaches the request at the already minimal length, the
  // candidate also attains the rotation lower bound; one kind is then minimal.
  const rotationLimit = candidate.rotations - 1;
  const patterns: RotationBoundPattern[] = [
    { costTicks: normalStepTicks, capacity: normalCapacity, rotations: 0 },
  ];
  for (let rotations = 1; rotations <= Math.min(rotatedCapacity, rotationLimit); rotations += 1) {
    patterns.push({ costTicks: rotatedStepTicks, capacity: rotations, rotations });
  }
  for (let ticks = 1; ticks <= costTicks; ticks += 1) {
    if (ticks % normalStepTicks !== 0 && ticks % rotatedStepTicks !== 0) continue;
    const rowsNormal = Math.floor(ticks / normalStepTicks);
    const rowsRotated = Math.floor(ticks / rotatedStepTicks);
    if (rowsNormal === 0 || rowsRotated === 0) continue;
    const maximumRotatedColumns = Math.min(rotatedCapacity, Math.floor(rotationLimit / rowsRotated));
    for (let rotatedColumns = 1; rotatedColumns <= maximumRotatedColumns; rotatedColumns += 1) {
      const remainingAdjustedWidth = usableWidth + input.gapMm - rotatedColumns * rotatedWidthStep;
      const normalColumns = Math.min(normalCapacity, quantity, Math.floor(remainingAdjustedWidth / normalWidthStep));
      if (normalColumns <= 0) continue;
      patterns.push({
        costTicks: ticks,
        capacity: normalColumns * rowsNormal + rotatedColumns * rowsRotated,
        rotations: rotatedColumns * rowsRotated,
      });
    }
  }
  const maximumQuantity = Array.from({ length: costTicks + 1 }, () => Array(rotationLimit + 1).fill(-1));
  maximumQuantity[0]![0] = 0;
  for (let ticks = 0; ticks <= costTicks; ticks += 1) {
    for (let rotations = 0; rotations <= rotationLimit; rotations += 1) {
      const produced = maximumQuantity[ticks]![rotations]!;
      if (produced < 0) continue;
      for (const pattern of patterns) {
        const nextTicks = ticks + pattern.costTicks;
        const nextRotations = rotations + pattern.rotations;
        if (nextTicks > costTicks || nextRotations > rotationLimit) continue;
        maximumQuantity[nextTicks]![nextRotations] = Math.max(
          maximumQuantity[nextTicks]![nextRotations]!,
          produced + pattern.capacity,
        );
      }
    }
  }
  const lowerRotationPlanExists = maximumQuantity[costTicks]!.some((produced) => produced >= quantity);
  return lowerRotationPlanExists ? undefined : candidate;
}

function generateExactSequencePatterns(input: ContinuousRollInput, quantity: number): Pattern[] {
  const usableWidth = input.rollWidthMm - input.sideMarginMm * 2;
  const normalLimit = Math.min(countIn(usableWidth, input.pieceWidthMm, input.gapMm), quantity);
  const rotatedLimit = input.allowRotation
    ? Math.min(countIn(usableWidth, input.pieceLengthMm, input.gapMm), quantity)
    : 0;
  const patterns: Pattern[] = [];
  for (let normalCount = 1; normalCount <= normalLimit; normalCount += 1) {
    patterns.push(makePattern(`row-${normalCount}-0`, Array.from({ length: normalCount }, (_, index) => ({
      x: index * (input.pieceWidthMm + input.gapMm), y: 0,
      width: input.pieceWidthMm, height: input.pieceLengthMm, rotated: false,
    })), input.pieceLengthMm));
  }
  for (let rotatedCount = 1; rotatedCount <= rotatedLimit; rotatedCount += 1) {
    patterns.push(makePattern(`row-0-${rotatedCount}`, Array.from({ length: rotatedCount }, (_, index) => ({
      x: index * (input.pieceLengthMm + input.gapMm), y: 0,
      width: input.pieceLengthMm, height: input.pieceWidthMm, rotated: true,
    })), input.pieceWidthMm));
  }
  for (let normalCount = 1; normalCount <= normalLimit; normalCount += 1) {
    const normalWidth = extent(normalCount, input.pieceWidthMm, input.gapMm);
    for (let rotatedCount = 1; rotatedCount <= rotatedLimit; rotatedCount += 1) {
      if (normalWidth + input.gapMm + extent(rotatedCount, input.pieceLengthMm, input.gapMm) > usableWidth) continue;
      patterns.push(makePattern(`row-${normalCount}-${rotatedCount}`, [
        ...Array.from({ length: normalCount }, (_, index) => ({
          x: index * (input.pieceWidthMm + input.gapMm), y: 0,
          width: input.pieceWidthMm, height: input.pieceLengthMm, rotated: false,
        })),
        ...Array.from({ length: rotatedCount }, (_, index) => ({
          x: normalWidth + input.gapMm + index * (input.pieceLengthMm + input.gapMm), y: 0,
          width: input.pieceLengthMm, height: input.pieceWidthMm, rotated: true,
        })),
      ], Math.max(input.pieceLengthMm, input.pieceWidthMm)));
    }
  }
  for (let normalColumns = 1; normalColumns <= normalLimit; normalColumns += 1) {
    const normalWidth = extent(normalColumns, input.pieceWidthMm, input.gapMm);
    for (let rotatedColumns = 1; rotatedColumns <= rotatedLimit; rotatedColumns += 1) {
      if (normalWidth + input.gapMm + extent(rotatedColumns, input.pieceLengthMm, input.gapMm) > usableWidth) continue;
      const maximumNormalRows = Math.floor(quantity / normalColumns);
      const maximumRotatedRows = Math.floor(quantity / rotatedColumns);
      for (let normalRows = 1; normalRows <= maximumNormalRows; normalRows += 1) {
        for (let rotatedRows = 1; rotatedRows <= maximumRotatedRows; rotatedRows += 1) {
          const capacity = normalColumns * normalRows + rotatedColumns * rotatedRows;
          if (capacity > quantity || (normalRows === 1 && rotatedRows === 1)) continue;
          const normalHeight = extent(normalRows, input.pieceLengthMm, input.gapMm);
          const rotatedHeight = extent(rotatedRows, input.pieceWidthMm, input.gapMm);
          patterns.push(makePattern(`vertical-${normalColumns}x${normalRows}-${rotatedColumns}x${rotatedRows}`, [
            ...Array.from({ length: normalColumns * normalRows }, (_, index) => ({
              x: (index % normalColumns) * (input.pieceWidthMm + input.gapMm),
              y: Math.floor(index / normalColumns) * (input.pieceLengthMm + input.gapMm),
              width: input.pieceWidthMm, height: input.pieceLengthMm, rotated: false,
            })),
            ...Array.from({ length: rotatedColumns * rotatedRows }, (_, index) => ({
              x: normalWidth + input.gapMm + (index % rotatedColumns) * (input.pieceLengthMm + input.gapMm),
              y: Math.floor(index / rotatedColumns) * (input.pieceWidthMm + input.gapMm),
              width: input.pieceLengthMm, height: input.pieceWidthMm, rotated: true,
            })),
          ], Math.max(normalHeight, rotatedHeight)));
        }
      }
    }
  }
  return patterns;
}

type ExactSequenceState = {
  quantity: number;
  adjustedLengthMm: number;
  rotations: number;
  kinds: string[];
  previous?: ExactSequenceState;
  pattern?: Pattern;
};

type BandBlueprint = {
  key: string;
  costTicks: number;
  occupiedHeightMm: number;
  normalColumns: number;
  rotatedColumns: number;
  normalRows: number;
  rotatedRows: number;
  normalCount: number;
  rotatedCount: number;
};

function materializeBlueprint(blueprint: BandBlueprint, input: ContinuousRollInput): Pattern {
  const normalWidth = extent(blueprint.normalColumns, input.pieceWidthMm, input.gapMm);
  const normalPlacements = Array.from({ length: blueprint.normalCount }, (_, index) => ({
    x: (index % blueprint.normalColumns) * (input.pieceWidthMm + input.gapMm),
    y: Math.floor(index / blueprint.normalColumns) * (input.pieceLengthMm + input.gapMm),
    width: input.pieceWidthMm, height: input.pieceLengthMm, rotated: false,
  }));
  const rotatedPlacements = Array.from({ length: blueprint.rotatedCount }, (_, index) => ({
    x: normalWidth + (blueprint.normalCount > 0 ? input.gapMm : 0)
      + (index % blueprint.rotatedColumns) * (input.pieceLengthMm + input.gapMm),
    y: Math.floor(index / blueprint.rotatedColumns) * (input.pieceWidthMm + input.gapMm),
    width: input.pieceLengthMm, height: input.pieceWidthMm, rotated: true,
  }));
  return makePattern(blueprint.key, [...normalPlacements, ...rotatedPlacements], blueprint.occupiedHeightMm);
}

function generateBandBlueprints(input: ContinuousRollInput, quantity: number, maximumTicks: number, quantum: number): BandBlueprint[][] {
  const usableWidth = input.rollWidthMm - input.sideMarginMm * 2;
  const normalCapacity = Math.min(quantity, countIn(usableWidth, input.pieceWidthMm, input.gapMm));
  const rotatedCapacity = input.allowRotation
    ? Math.min(quantity, countIn(usableWidth, input.pieceLengthMm, input.gapMm))
    : 0;
  const normalStepTicks = Math.round((input.pieceLengthMm + input.gapMm) / quantum);
  const rotatedStepTicks = Math.round((input.pieceWidthMm + input.gapMm) / quantum);
  const byCost = Array.from({ length: maximumTicks + 1 }, () => new Map<string, BandBlueprint>());
  const add = (pattern: BandBlueprint): void => {
    const cappedNormal = Math.min(quantity, pattern.normalCount);
    const cappedTotal = Math.min(quantity, pattern.normalCount + pattern.rotatedCount);
    const dominanceKey = `${cappedNormal}:${cappedTotal}`;
    const current = byCost[pattern.costTicks]!.get(dominanceKey);
    if (!current || pattern.key < current.key) byCost[pattern.costTicks]!.set(dominanceKey, pattern);
  };
  if (normalCapacity > 0 && normalStepTicks <= maximumTicks) {
    add({
      key: `row-${normalCapacity}-0`, costTicks: normalStepTicks,
      occupiedHeightMm: input.pieceLengthMm,
      normalColumns: normalCapacity, rotatedColumns: 0, normalRows: 1, rotatedRows: 0,
      normalCount: normalCapacity, rotatedCount: 0,
    });
  }
  if (rotatedCapacity > 0 && rotatedStepTicks <= maximumTicks) {
    add({
      key: `row-0-${rotatedCapacity}`, costTicks: rotatedStepTicks,
      occupiedHeightMm: input.pieceWidthMm,
      normalColumns: 0, rotatedColumns: rotatedCapacity, normalRows: 0, rotatedRows: 1,
      normalCount: 0, rotatedCount: rotatedCapacity,
    });
  }
  const normalWidthStep = input.pieceWidthMm + input.gapMm;
  const rotatedWidthStep = input.pieceLengthMm + input.gapMm;
  // A taller band has no new primary geometry after one common row period:
  // for L=lcm(normalStep, rotatedStep), floor((kL+r)/step) splits exactly
  // into k full-period bands plus the r-band. Width allocation is unchanged,
  // and adjusted heights add exactly because each band owns its following
  // inter-band gap. Therefore costs above L are redundant for the primary
  // length/rotation frontier (one-kind ties are certified separately).
  const commonPeriodTicks = normalStepTicks / greatestCommonDivisor(normalStepTicks, rotatedStepTicks) * rotatedStepTicks;
  const blueprintTickLimit = Math.min(maximumTicks, commonPeriodTicks);
  for (let ticks = 1; ticks <= blueprintTickLimit; ticks += 1) {
    if (ticks % normalStepTicks !== 0 && ticks % rotatedStepTicks !== 0) continue;
    const normalRows = Math.floor(ticks / normalStepTicks);
    const rotatedRows = Math.floor(ticks / rotatedStepTicks);
    if (normalRows === 0 || rotatedRows === 0) continue;
    for (let rotatedColumns = 1; rotatedColumns <= rotatedCapacity; rotatedColumns += 1) {
      const remainingAdjustedWidth = usableWidth + input.gapMm - rotatedColumns * rotatedWidthStep;
      const normalColumns = Math.min(normalCapacity, Math.floor(remainingAdjustedWidth / normalWidthStep));
      if (normalColumns <= 0) continue;
      const normalCount = normalColumns * normalRows;
      const rotatedCount = rotatedColumns * rotatedRows;
      const occupiedHeightMm = ticks * quantum - input.gapMm;
      const key = normalRows === 1 && rotatedRows === 1
        ? `row-${normalColumns}-${rotatedColumns}`
        : `vertical-${normalColumns}x${normalRows}-${rotatedColumns}x${rotatedRows}`;
      add({
        key, costTicks: ticks, occupiedHeightMm,
        normalColumns, rotatedColumns, normalRows, rotatedRows, normalCount, rotatedCount,
      });
    }
  }
  return byCost.map((patterns) => [...patterns.values()]);
}

function divisors(value: number): number[] {
  const lower: number[] = [];
  const upper: number[] = [];
  for (let divisor = 1; divisor * divisor <= value; divisor += 1) {
    if (value % divisor !== 0) continue;
    lower.push(divisor);
    if (divisor * divisor !== value) upper.unshift(value / divisor);
  }
  return [...lower, ...upper];
}

function findOneKindTickPlan(
  quantity: number,
  normalCount: number,
  adjustedTicks: number,
  quantum: number,
  input: ContinuousRollInput,
): CompactPlan | undefined {
  const rotatedCount = quantity - normalCount;
  const usableWidth = input.rollWidthMm - input.sideMarginMm * 2;
  const normalStepTicks = Math.round((input.pieceLengthMm + input.gapMm) / quantum);
  const rotatedStepTicks = Math.round((input.pieceWidthMm + input.gapMm) / quantum);
  const commonRepeats = divisors(adjustedTicks).filter((repeat) => (
    normalCount % repeat === 0 && rotatedCount % repeat === 0
  ));
  for (const repeat of commonRepeats) {
    const patternTicks = adjustedTicks / repeat;
    const patternNormal = normalCount / repeat;
    const patternRotated = rotatedCount / repeat;
    if (patternNormal === 0) {
      if (patternTicks !== rotatedStepTicks || extent(patternRotated, input.pieceLengthMm, input.gapMm) > usableWidth) continue;
      const blueprint: BandBlueprint = {
        key: `row-0-${patternRotated}`, costTicks: patternTicks, occupiedHeightMm: patternTicks * quantum - input.gapMm,
        normalColumns: 0, rotatedColumns: patternRotated, normalRows: 0, rotatedRows: 1,
        normalCount: 0, rotatedCount: patternRotated,
      };
      const pattern = materializeBlueprint(blueprint, input);
      return {
        adjustedLengthMm: adjustedTicks * quantum, rotations: rotatedCount, patternKindCount: 1,
        pure: { normalRows: 0, rotatedRows: 0, normalPieces: 0, rotatedPieces: 0 },
        sequence: Array.from({ length: repeat }, () => pattern), signature: pattern.pattern,
      };
    }
    if (patternRotated === 0) {
      if (patternTicks !== normalStepTicks || extent(patternNormal, input.pieceWidthMm, input.gapMm) > usableWidth) continue;
      const blueprint: BandBlueprint = {
        key: `row-${patternNormal}-0`, costTicks: patternTicks, occupiedHeightMm: patternTicks * quantum - input.gapMm,
        normalColumns: patternNormal, rotatedColumns: 0, normalRows: 1, rotatedRows: 0,
        normalCount: patternNormal, rotatedCount: 0,
      };
      const pattern = materializeBlueprint(blueprint, input);
      return {
        adjustedLengthMm: adjustedTicks * quantum, rotations: 0, patternKindCount: 1,
        pure: { normalRows: 0, rotatedRows: 0, normalPieces: 0, rotatedPieces: 0 },
        sequence: Array.from({ length: repeat }, () => pattern), signature: pattern.pattern,
      };
    }
    for (const normalColumns of divisors(patternNormal)) {
      const normalRows = patternNormal / normalColumns;
      if (normalRows * normalStepTicks > patternTicks) continue;
      for (const rotatedColumns of divisors(patternRotated)) {
        const rotatedRows = patternRotated / rotatedColumns;
        if (rotatedRows * rotatedStepTicks > patternTicks
          || Math.max(normalRows * normalStepTicks, rotatedRows * rotatedStepTicks) !== patternTicks
          || extent(normalColumns, input.pieceWidthMm, input.gapMm) + input.gapMm
            + extent(rotatedColumns, input.pieceLengthMm, input.gapMm) > usableWidth) continue;
        const key = normalRows === 1 && rotatedRows === 1
          ? `row-${normalColumns}-${rotatedColumns}`
          : `vertical-${normalColumns}x${normalRows}-${rotatedColumns}x${rotatedRows}`;
        const blueprint: BandBlueprint = {
          key, costTicks: patternTicks, occupiedHeightMm: patternTicks * quantum - input.gapMm,
          normalColumns, rotatedColumns, normalRows, rotatedRows, normalCount: patternNormal, rotatedCount: patternRotated,
        };
        const pattern = materializeBlueprint(blueprint, input);
        return {
          adjustedLengthMm: adjustedTicks * quantum, rotations: rotatedCount, patternKindCount: 1,
          pure: { normalRows: 0, rotatedRows: 0, normalPieces: 0, rotatedPieces: 0 },
          sequence: Array.from({ length: repeat }, () => pattern), signature: pattern.pattern,
        };
      }
    }
  }
  return undefined;
}

type KindGroup = { costTicks: number; blueprint: BandBlueprint; repeat: number };

function kindGroupsForCounts(
  normalCount: number,
  rotatedCount: number,
  maximumTicks: number,
  quantum: number,
  input: ContinuousRollInput,
): KindGroup[] {
  if (normalCount === 0 && rotatedCount === 0) return [];
  const usableWidth = input.rollWidthMm - input.sideMarginMm * 2;
  const normalStepTicks = Math.round((input.pieceLengthMm + input.gapMm) / quantum);
  const rotatedStepTicks = Math.round((input.pieceWidthMm + input.gapMm) / quantum);
  const groups: KindGroup[] = [];
  if (rotatedCount === 0) {
    for (const columns of divisors(normalCount)) {
      if (extent(columns, input.pieceWidthMm, input.gapMm) > usableWidth) continue;
      const repeat = normalCount / columns;
      const costTicks = repeat * normalStepTicks;
      if (costTicks > maximumTicks) continue;
      const blueprint: BandBlueprint = {
        key: `row-${columns}-0`, costTicks: normalStepTicks,
        occupiedHeightMm: normalStepTicks * quantum - input.gapMm,
        normalColumns: columns, rotatedColumns: 0, normalRows: 1, rotatedRows: 0,
        normalCount: columns, rotatedCount: 0,
      };
      groups.push({ costTicks, blueprint, repeat });
    }
    return groups;
  }
  if (normalCount === 0) {
    for (const columns of divisors(rotatedCount)) {
      if (extent(columns, input.pieceLengthMm, input.gapMm) > usableWidth) continue;
      const repeat = rotatedCount / columns;
      const costTicks = repeat * rotatedStepTicks;
      if (costTicks > maximumTicks) continue;
      const blueprint: BandBlueprint = {
        key: `row-0-${columns}`, costTicks: rotatedStepTicks,
        occupiedHeightMm: rotatedStepTicks * quantum - input.gapMm,
        normalColumns: 0, rotatedColumns: columns, normalRows: 0, rotatedRows: 1,
        normalCount: 0, rotatedCount: columns,
      };
      groups.push({ costTicks, blueprint, repeat });
    }
    return groups;
  }
  for (const normalColumns of divisors(normalCount)) {
    const normalRows = normalCount / normalColumns;
    for (const rotatedColumns of divisors(rotatedCount)) {
      if (extent(normalColumns, input.pieceWidthMm, input.gapMm) + input.gapMm
        + extent(rotatedColumns, input.pieceLengthMm, input.gapMm) > usableWidth) continue;
      const rotatedRows = rotatedCount / rotatedColumns;
      const costTicks = Math.max(normalRows * normalStepTicks, rotatedRows * rotatedStepTicks);
      if (costTicks > maximumTicks) continue;
      const key = normalRows === 1 && rotatedRows === 1
        ? `row-${normalColumns}-${rotatedColumns}`
        : `vertical-${normalColumns}x${normalRows}-${rotatedColumns}x${rotatedRows}`;
      groups.push({
        costTicks,
        blueprint: {
          key, costTicks, occupiedHeightMm: costTicks * quantum - input.gapMm,
          normalColumns, rotatedColumns, normalRows, rotatedRows, normalCount, rotatedCount,
        },
        repeat: 1,
      });
    }
  }
  return groups;
}

/**
 * Exact support-two certificate. Multiple occurrences of one mixed pattern
 * kind can be stacked into one block with the same columns and multiplied row
 * counts; pure row occurrences are already identical. Thus every layout using
 * at most two kinds corresponds to one split of (ticks, normal, rotated), all
 * of which are enumerated here without a candidate cutoff.
 */
function findTwoKindTickPlan(
  quantity: number,
  normalCount: number,
  adjustedTicks: number,
  quantum: number,
  input: ContinuousRollInput,
): CompactPlan | undefined {
  const rotatedCount = quantity - normalCount;
  const cache = new Map<string, KindGroup[]>();
  const groups = (normal: number, rotated: number): KindGroup[] => {
    const key = `${normal}:${rotated}`;
    const cached = cache.get(key);
    if (cached) return cached;
    const created = kindGroupsForCounts(normal, rotated, adjustedTicks, quantum, input);
    cache.set(key, created);
    return created;
  };
  for (let firstNormal = 0; firstNormal <= normalCount; firstNormal += 1) {
    for (let firstRotated = 0; firstRotated <= rotatedCount; firstRotated += 1) {
      if (firstNormal + firstRotated === 0
        || firstNormal + firstRotated === quantity) continue;
      const secondNormal = normalCount - firstNormal;
      const secondRotated = rotatedCount - firstRotated;
      const secondByCost = new Map(groups(secondNormal, secondRotated).map((group) => [group.costTicks, group]));
      for (const first of groups(firstNormal, firstRotated)) {
        const second = secondByCost.get(adjustedTicks - first.costTicks);
        if (!second) continue;
        const firstPattern = materializeBlueprint(first.blueprint, input);
        const secondPattern = materializeBlueprint(second.blueprint, input);
        const sequence = [
          ...Array.from({ length: first.repeat }, () => firstPattern),
          ...Array.from({ length: second.repeat }, () => secondPattern),
        ]
          .sort((left, right) => right.occupiedHeightMm - left.occupiedHeightMm || left.pattern.localeCompare(right.pattern));
        const kinds = new Set(sequence.map((pattern) => pattern.pattern));
        if (kinds.size > 2) continue;
        return {
          adjustedLengthMm: adjustedTicks * quantum, rotations: rotatedCount, patternKindCount: kinds.size,
          pure: { normalRows: 0, rotatedRows: 0, normalPieces: 0, rotatedPieces: 0 },
          sequence, signature: [...kinds].sort().join('|'),
        };
      }
    }
  }
  return undefined;
}

function planTickPatternSequence(quantity: number, input: ContinuousRollInput, pure: CompactPlan): CompactPlan | undefined {
  const quantum = rowHeightQuantum(input);
  if (quantum === undefined) return undefined;
  const maximumTicks = Math.round(pure.adjustedLengthMm / quantum);
  const patternsByCost = generateBandBlueprints(input, quantity, maximumTicks, quantum);
  const patterns = patternsByCost.flat();
  const normalByTicksAndRotations = Array.from(
    { length: maximumTicks + 1 },
    () => new Int32Array(quantity + 1).fill(-1),
  );
  const previousRotation = Array.from(
    { length: maximumTicks + 1 },
    () => new Int32Array(quantity + 1).fill(-1),
  );
  const previousPattern = Array.from(
    { length: maximumTicks + 1 },
    () => new Int32Array(quantity + 1).fill(-1),
  );
  normalByTicksAndRotations[0]![0] = 0;
  for (let ticks = 0; ticks <= maximumTicks; ticks += 1) {
    const currentNormals = normalByTicksAndRotations[ticks]!;
    let bestRotationState = -1;
    let bestNormal = -1;
    for (let rotations = 0; rotations <= quantity; rotations += 1) {
      const normal = currentNormals[rotations]!;
      if (normal + rotations < quantity) continue;
      if (normal > bestNormal || (normal === bestNormal && rotations < bestRotationState)) {
        bestNormal = normal;
        bestRotationState = rotations;
      }
    }
    if (bestRotationState >= 0) {
      const oneKind = findOneKindTickPlan(quantity, bestNormal, ticks, quantum, input);
      if (oneKind) return oneKind;
      const blueprints: BandBlueprint[] = [];
      let cursorTicks = ticks;
      let cursorRotations = bestRotationState;
      while (cursorTicks > 0) {
        const patternIndex = previousPattern[cursorTicks]![cursorRotations]!;
        if (patternIndex < 0) return undefined;
        const pattern = patterns[patternIndex]!;
        blueprints.unshift({ ...pattern });
        const oldRotations = previousRotation[cursorTicks]![cursorRotations]!;
        cursorTicks -= pattern.costTicks;
        cursorRotations = oldRotations;
      }
      let excess = blueprints.reduce((total, pattern) => total + pattern.normalCount + pattern.rotatedCount, 0) - quantity;
      for (let index = blueprints.length - 1; index >= 0 && excess > 0; index -= 1) {
        const pattern = blueprints[index]!;
        const removedRotated = Math.min(excess, pattern.rotatedCount);
        pattern.rotatedCount -= removedRotated;
        excess -= removedRotated;
      }
      for (let index = blueprints.length - 1; index >= 0 && excess > 0; index -= 1) {
        const pattern = blueprints[index]!;
        const removedNormal = Math.min(excess, pattern.normalCount);
        pattern.normalCount -= removedNormal;
        excess -= removedNormal;
      }
      const sequence = blueprints.filter((pattern) => pattern.normalCount + pattern.rotatedCount > 0).map((pattern) => {
        const normalRows = pattern.normalCount === 0 ? 0 : Math.ceil(pattern.normalCount / pattern.normalColumns);
        const rotatedRows = pattern.rotatedCount === 0 ? 0 : Math.ceil(pattern.rotatedCount / pattern.rotatedColumns);
        pattern.key = pattern.normalCount > 0 && pattern.rotatedCount > 0
          ? (normalRows === 1 && rotatedRows === 1
            ? `row-${pattern.normalCount}-${pattern.rotatedCount}`
            : `vertical-${pattern.normalColumns}x${normalRows}-${pattern.rotatedColumns}x${rotatedRows}`)
          : pattern.normalCount > 0 ? `row-${pattern.normalCount}-0` : `row-0-${pattern.rotatedCount}`;
        return materializeBlueprint(pattern, input);
      }).sort((left, right) => right.occupiedHeightMm - left.occupiedHeightMm || left.pattern.localeCompare(right.pattern));
      const actualKinds = new Set(sequence.map((pattern) => pattern.pattern));
      // One kind is the absolute lower bound. Two kinds are also certified
      // once no one-kind layout has the same primary (length, rotations)
      // objective. Larger supports fall through to the independent exact
      // quantity DP below rather than accepting an unproved tie-break.
      if (actualKinds.size > 2) {
        const twoKind = findTwoKindTickPlan(quantity, bestNormal, ticks, quantum, input);
        if (twoKind) return twoKind;
        if (actualKinds.size > 3) return undefined;
      }
      const rotations = sequence.reduce((total, pattern) => total + pattern.rotatedCount, 0);
      return {
        adjustedLengthMm: ticks * quantum,
        rotations,
        patternKindCount: actualKinds.size,
        pure: { normalRows: 0, rotatedRows: 0, normalPieces: 0, rotatedPieces: 0 },
        sequence,
        signature: [...actualKinds].sort().join('|'),
      };
    }
    for (let rotations = 0; rotations <= quantity; rotations += 1) {
      const normal = currentNormals[rotations]!;
      if (normal < 0) continue;
      for (let patternIndex = 0; patternIndex < patterns.length; patternIndex += 1) {
        const pattern = patterns[patternIndex]!;
        const nextTicks = ticks + pattern.costTicks;
        if (nextTicks > maximumTicks) continue;
        const nextRotations = Math.min(quantity, rotations + pattern.rotatedCount);
        const nextNormal = Math.min(quantity, normal + pattern.normalCount);
        if (nextNormal > normalByTicksAndRotations[nextTicks]![nextRotations]!) {
          normalByTicksAndRotations[nextTicks]![nextRotations] = nextNormal;
          previousRotation[nextTicks]![nextRotations] = rotations;
          previousPattern[nextTicks]![nextRotations] = patternIndex;
        }
      }
    }
  }
  return undefined;
}

type ExactPlannerStats = { retainedStates: number };

function planExactPatternSequence(quantity: number, input: ContinuousRollInput, stats?: ExactPlannerStats): CompactPlan | undefined {
  const patterns = generateExactSequencePatterns(input, quantity);
  const maximumCapacity = Math.max(...patterns.map((pattern) => pattern.capacity));
  const states = Array.from({ length: quantity + maximumCapacity + 1 }, () => new Map<string, ExactSequenceState>());
  states[0]!.set('', { quantity: 0, adjustedLengthMm: 0, rotations: 0, kinds: [] });
  let retainedStates = 1;
  if (stats) stats.retainedStates = retainedStates;
  for (let produced = 0; produced < quantity; produced += 1) {
    for (const state of states[produced]!.values()) {
      for (const pattern of patterns) {
        const nextQuantity = produced + pattern.capacity;
        const kinds = state.kinds.includes(pattern.pattern)
          ? state.kinds
          : [...state.kinds, pattern.pattern].sort();
        const candidate: ExactSequenceState = {
          quantity: nextQuantity,
          adjustedLengthMm: state.adjustedLengthMm + pattern.occupiedHeightMm + input.gapMm,
          rotations: state.rotations + pattern.rotatedCount,
          kinds,
          previous: state,
          pattern,
        };
        const key = kinds.join('|');
        const current = states[nextQuantity]!.get(key);
        if (!current) {
          retainedStates += 1;
          if (stats) stats.retainedStates = retainedStates;
          if (retainedStates > EXACT_RETAINED_STATE_LIMIT) return undefined;
        }
        if (!current
          || candidate.adjustedLengthMm < current.adjustedLengthMm
          || (candidate.adjustedLengthMm === current.adjustedLengthMm && candidate.rotations < current.rotations)) {
          states[nextQuantity]!.set(key, candidate);
        }
      }
    }
  }
  const complete = states.slice(quantity).flatMap((bucket) => [...bucket.values()]);
  const best = complete.reduce<ExactSequenceState | undefined>((current, candidate) => {
    if (!current) return candidate;
    if (candidate.adjustedLengthMm !== current.adjustedLengthMm) return candidate.adjustedLengthMm < current.adjustedLengthMm ? candidate : current;
    const candidateOverproduction = candidate.quantity - quantity;
    const currentOverproduction = current.quantity - quantity;
    if (candidateOverproduction !== currentOverproduction) return candidateOverproduction < currentOverproduction ? candidate : current;
    if (candidate.rotations !== current.rotations) return candidate.rotations < current.rotations ? candidate : current;
    if (candidate.kinds.length !== current.kinds.length) return candidate.kinds.length < current.kinds.length ? candidate : current;
    return candidate.kinds.join('|') < current.kinds.join('|') ? candidate : current;
  }, undefined);
  if (!best) return undefined;
  const sequence: Pattern[] = [];
  for (let cursor: ExactSequenceState | undefined = best; cursor?.pattern; cursor = cursor.previous) {
    sequence.unshift(cursor.pattern);
  }
  return {
    adjustedLengthMm: best.adjustedLengthMm,
    rotations: best.rotations,
    patternKindCount: best.kinds.length,
    pure: { normalRows: 0, rotatedRows: 0, normalPieces: 0, rotatedPieces: 0 },
    sequence,
    signature: best.kinds.join('|'),
  };
}

function planExactQuantity(quantity: number, input: ContinuousRollInput): CompactPlan {
  const usableWidth = input.rollWidthMm - input.sideMarginMm * 2;
  const normalCapacity = countIn(usableWidth, input.pieceWidthMm, input.gapMm);
  const rotatedCapacity = input.allowRotation ? countIn(usableWidth, input.pieceLengthMm, input.gapMm) : 0;
  if (normalCapacity === 0 && rotatedCapacity === 0) {
    throw new ContinuousRollLayoutValidationError('재단 규격이 가용 원단 폭보다 큽니다.');
  }
  const pure = planPureRows(quantity, input, normalCapacity, rotatedCapacity);

  if (hasCertifiedDirectPlan(quantity, input, usableWidth, normalCapacity, rotatedCapacity, pure)) {
    const perfectTiling = planPerfectTiling(quantity, input, usableWidth, normalCapacity, rotatedCapacity);
    return perfectTiling && comparePlans(perfectTiling, pure) ? perfectTiling : pure;
  }
  const latticePlan = certifySingleLatticePattern(quantity, input, usableWidth, normalCapacity, rotatedCapacity);
  if (latticePlan) return latticePlan;
  const tickPlan = planTickPatternSequence(quantity, input, pure);
  if (tickPlan) return tickPlan;
  return planExactPatternSequence(quantity, input) ?? pure;
}

function usedLength(plan: CompactPlan, input: ContinuousRollInput): number {
  return plan.adjustedLengthMm - input.gapMm + input.startEndMarginMm * 2;
}

function maximumAreaQuantity(input: ContinuousRollInput): number {
  if (input.maxLengthMm === undefined) return input.quantity;
  const usableWidth = input.rollWidthMm - input.sideMarginMm * 2;
  const usableLength = Math.max(0, input.maxLengthMm - input.startEndMarginMm * 2);
  const raw = usableWidth * usableLength / (input.pieceWidthMm * input.pieceLengthMm);
  return Math.min(input.quantity, Math.max(0, Math.floor(raw + Number.EPSILON * Math.max(1, raw) * 8)));
}

function selectPlan(input: ContinuousRollInput): { quantity: number; plan?: CompactPlan } {
  const areaBound = maximumAreaQuantity(input);
  if (areaBound === 0) return { quantity: 0 };
  if (input.maxLengthMm === undefined) return { quantity: input.quantity, plan: planExactQuantity(input.quantity, input) };
  const cache = new Map<number, CompactPlan>();
  const planFor = (quantity: number): CompactPlan => {
    const cached = cache.get(quantity);
    if (cached) return cached;
    const plan = planExactQuantity(quantity, input);
    cache.set(quantity, plan);
    return plan;
  };
  let low = 0;
  let high = areaBound;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (usedLength(planFor(middle), input) <= input.maxLengthMm) low = middle;
    else high = middle - 1;
  }
  return low === 0 ? { quantity: 0 } : { quantity: low, plan: planFor(low) };
}

function makePattern(pattern: string, placements: Omit<Placement, 'id'>[], occupiedHeightMm: number): Pattern {
  const normalCount = placements.filter((placement) => !placement.rotated).length;
  return {
    pattern,
    capacity: placements.length,
    occupiedHeightMm,
    normalCount,
    rotatedCount: placements.length - normalCount,
    estimatedCutLines: placements.length + 1,
    placements,
  };
}

function balancedCounts(total: number, rows: number): number[] {
  if (rows === 0) return [];
  const smaller = Math.floor(total / rows);
  const largerRows = total % rows;
  return Array.from({ length: rows }, (_, index) => smaller + (index < largerRows ? 1 : 0));
}

function materializePatterns(plan: CompactPlan, input: ContinuousRollInput): Pattern[] {
  if (plan.sequence) return plan.sequence;
  const patterns: Pattern[] = [];
  if (plan.vertical) {
    const block = plan.vertical;
    const normalWidth = extent(block.normalColumns, input.pieceWidthMm, input.gapMm);
    const normalPlacements = Array.from({ length: block.normalPieces }, (_, index) => ({
      x: (index % block.normalColumns) * (input.pieceWidthMm + input.gapMm),
      y: Math.floor(index / block.normalColumns) * (input.pieceLengthMm + input.gapMm),
      width: input.pieceWidthMm,
      height: input.pieceLengthMm,
      rotated: false,
    }));
    const rotatedPlacements = Array.from({ length: block.rotatedPieces }, (_, index) => ({
      x: normalWidth + input.gapMm + (index % block.rotatedColumns) * (input.pieceLengthMm + input.gapMm),
      y: Math.floor(index / block.rotatedColumns) * (input.pieceWidthMm + input.gapMm),
      width: input.pieceLengthMm,
      height: input.pieceWidthMm,
      rotated: true,
    }));
    const pattern = block.normalRows === 1 && block.rotatedRows === 1
      ? `row-${block.normalPieces}-${block.rotatedPieces}`
      : `vertical-${block.normalColumns}x${block.normalRows}-${block.rotatedColumns}x${block.rotatedRows}`;
    patterns.push(makePattern(pattern, [...normalPlacements, ...rotatedPlacements], block.occupiedHeightMm));
  }

  for (const count of balancedCounts(plan.pure.normalPieces, plan.pure.normalRows)) {
    patterns.push(makePattern(`row-${count}-0`, Array.from({ length: count }, (_, index) => ({
      x: index * (input.pieceWidthMm + input.gapMm),
      y: 0,
      width: input.pieceWidthMm,
      height: input.pieceLengthMm,
      rotated: false,
    })), input.pieceLengthMm));
  }
  for (const count of balancedCounts(plan.pure.rotatedPieces, plan.pure.rotatedRows)) {
    patterns.push(makePattern(`row-0-${count}`, Array.from({ length: count }, (_, index) => ({
      x: index * (input.pieceLengthMm + input.gapMm),
      y: 0,
      width: input.pieceLengthMm,
      height: input.pieceWidthMm,
      rotated: true,
    })), input.pieceWidthMm));
  }
  return patterns;
}

function physicalLowerBoundLength(quantity: number, input: ContinuousRollInput): number {
  if (quantity === 0) return 0;
  const usableWidth = input.rollWidthMm - input.sideMarginMm * 2;
  return input.startEndMarginMm * 2 + quantity * input.pieceWidthMm * input.pieceLengthMm / usableWidth;
}

function statusForPlan(strategy: ContinuousRollPlanningMetrics['strategy'], quantity: number, length: number, input: ContinuousRollInput): Pick<ContinuousRollResult, 'optimizationStatus' | 'lowerBoundLengthMm' | 'optimalityGapMm'> {
  const lowerBoundLengthMm = physicalLowerBoundLength(quantity, input);
  const optimalityGapMm = Math.max(0, length - lowerBoundLengthMm);
  const tolerance = 1e-7 * Math.max(1, length, lowerBoundLengthMm);
  return {
    optimizationStatus: strategy === 'exact' ? 'exact' : optimalityGapMm <= tolerance ? 'certified' : 'approximate',
    lowerBoundLengthMm,
    optimalityGapMm,
  };
}

function emptyResult(metrics: ContinuousRollPlanningMetrics, input: ContinuousRollInput): ContinuousRollResult {
  return {
    placements: [], usedLengthMm: 0, producedQuantity: 0, overproduction: 0,
    utilizationPercent: 0, wastePercent: 100, normalCount: 0, rotatedCount: 0,
    rowPatterns: [], rowSequence: [], estimatedCutLines: 0,
    ...statusForPlan(metrics.strategy, 0, 0, input),
    planningMetrics: metrics,
  };
}

function materializeResult(quantity: number, plan: CompactPlan, input: ContinuousRollInput, metrics: ContinuousRollPlanningMetrics): ContinuousRollResult {
  const sequence = materializePatterns(plan, input);
  let y = input.startEndMarginMm;
  const rowSequence: RowSequenceEntry[] = [];
  const placements = sequence.flatMap((pattern) => {
    const startY = y;
    const row = pattern.placements.map((placement) => ({
      ...placement,
      x: placement.x + input.sideMarginMm,
      y: placement.y + y,
    }));
    y += pattern.occupiedHeightMm;
    rowSequence.push({ ...pattern, startY, endY: y });
    y += input.gapMm;
    return row;
  }).map((placement, index) => ({ ...placement, id: index + 1 }));
  const normalCount = placements.filter((placement) => !placement.rotated).length;
  const length = usedLength(plan, input);
  const utilizationPercent = Math.round((placements.length * input.pieceWidthMm * input.pieceLengthMm / (input.rollWidthMm * length)) * 10000) / 100;
  const usage = new Map<string, RowPatternUsage>();
  for (const pattern of sequence) {
    const previous = usage.get(pattern.pattern);
    usage.set(pattern.pattern, { ...pattern, count: (previous?.count ?? 0) + 1 });
  }
  return {
    placements,
    usedLengthMm: length,
    producedQuantity: quantity,
    overproduction: Math.max(0, quantity - input.quantity),
    utilizationPercent,
    wastePercent: Math.round((100 - utilizationPercent) * 100) / 100,
    normalCount,
    rotatedCount: placements.length - normalCount,
    rowPatterns: [...usage.values()],
    rowSequence,
    estimatedCutLines: sequence.reduce((total, pattern) => total + pattern.estimatedCutLines, 0),
    ...statusForPlan(metrics.strategy, quantity, length, input),
    planningMetrics: metrics,
  };
}

function eventCounts(capacity: number): number[] {
  if (capacity <= 0) return [];
  return [...new Set([1, 2, Math.floor(capacity / 4), Math.floor(capacity / 2), Math.ceil(capacity / 2), capacity])]
    .filter((value) => value > 0 && value <= capacity)
    .sort((left, right) => left - right);
}

function materialCandidates(quantity: number, input: ContinuousRollInput): CompactPlan[] {
  if (quantity === 0) return [];
  const usableWidth = input.rollWidthMm - input.sideMarginMm * 2;
  const normalCapacity = countIn(usableWidth, input.pieceWidthMm, input.gapMm);
  const rotatedCapacity = input.allowRotation ? countIn(usableWidth, input.pieceLengthMm, input.gapMm) : 0;
  const candidates = new Map<string, CompactPlan>();
  const add = (candidate: CompactPlan): void => {
    const existing = candidates.get(candidate.signature);
    if (!existing || comparePlans(candidate, existing)) candidates.set(candidate.signature, candidate);
  };
  if (normalCapacity > 0) {
    add({
      adjustedLengthMm: Math.ceil(quantity / normalCapacity) * (input.pieceLengthMm + input.gapMm),
      rotations: 0, patternKindCount: 1,
      pure: { normalRows: Math.ceil(quantity / normalCapacity), rotatedRows: 0, normalPieces: quantity, rotatedPieces: 0 },
      signature: `material-normal-${normalCapacity}`,
    });
  }
  if (rotatedCapacity > 0) {
    add({
      adjustedLengthMm: Math.ceil(quantity / rotatedCapacity) * (input.pieceWidthMm + input.gapMm),
      rotations: quantity, patternKindCount: 1,
      pure: { normalRows: 0, rotatedRows: Math.ceil(quantity / rotatedCapacity), normalPieces: 0, rotatedPieces: quantity },
      signature: `material-rotated-${rotatedCapacity}`,
    });
  }
  if (normalCapacity > 0 || rotatedCapacity > 0) add(planPureRows(quantity, input, normalCapacity, rotatedCapacity));

  const normalStep = input.pieceLengthMm + input.gapMm;
  const rotatedStep = input.pieceWidthMm + input.gapMm;
  for (const normalColumns of eventCounts(normalCapacity)) {
    const normalWidth = extent(normalColumns, input.pieceWidthMm, input.gapMm);
    for (const rotatedColumns of eventCounts(rotatedCapacity)) {
      if (normalWidth + input.gapMm + extent(rotatedColumns, input.pieceLengthMm, input.gapMm) > usableWidth) continue;
      const balancedHeight = quantity / (normalColumns / normalStep + rotatedColumns / rotatedStep);
      const idealNormal = Math.round(normalColumns * balancedHeight / normalStep);
      const normalPiecesEvents = new Set([
        1, quantity - 1, Math.floor(quantity / 2), Math.ceil(quantity / 2),
        idealNormal - normalColumns, idealNormal, idealNormal + normalColumns,
        quantity % normalColumns, quantity - (quantity % rotatedColumns),
      ]);
      for (const normalPieces of normalPiecesEvents) {
        const rotatedPieces = quantity - normalPieces;
        if (normalPieces <= 0 || rotatedPieces <= 0) continue;
        const normalRows = Math.ceil(normalPieces / normalColumns);
        const rotatedRows = Math.ceil(rotatedPieces / rotatedColumns);
        const occupiedHeightMm = Math.max(
          extent(normalRows, input.pieceLengthMm, input.gapMm),
          extent(rotatedRows, input.pieceWidthMm, input.gapMm),
        );
        add({
          adjustedLengthMm: occupiedHeightMm + input.gapMm,
          rotations: rotatedPieces,
          patternKindCount: 1,
          pure: { normalRows: 0, rotatedRows: 0, normalPieces: 0, rotatedPieces: 0 },
          vertical: { normalColumns, normalRows, rotatedColumns, rotatedRows, normalPieces, rotatedPieces, occupiedHeightMm },
          signature: `material-vertical-${normalColumns}-${normalRows}-${rotatedColumns}-${rotatedRows}-${normalPieces}`,
        });
      }
    }
  }
  return [...candidates.values()];
}

function materialPlanForQuantity(quantity: number, input: ContinuousRollInput): { plan?: CompactPlan; retainedStates: number } {
  const candidates = materialCandidates(quantity, input);
  const feasible = candidates.filter((candidate) => input.maxLengthMm === undefined || usedLength(candidate, input) <= input.maxLengthMm!);
  const plan = feasible.reduce<CompactPlan | undefined>((best, candidate) => comparePlans(candidate, best) ? candidate : best, undefined);
  return { plan, retainedStates: candidates.length };
}

function exactPreflight(input: ContinuousRollInput, quantity: number): { patterns?: Pattern[]; estimatedWork: number } | undefined {
  const usableWidth = input.rollWidthMm - input.sideMarginMm * 2;
  const normalCapacity = countIn(usableWidth, input.pieceWidthMm, input.gapMm);
  const rotatedCapacity = input.allowRotation ? countIn(usableWidth, input.pieceLengthMm, input.gapMm) : 0;
  // Candidate construction itself is bounded before it creates any placement arrays.
  if (quantity > 20 || normalCapacity + rotatedCapacity > 12) return undefined;
  const patterns = generateExactSequencePatterns(input, quantity);
  const attempts = input.maxLengthMm === undefined ? 1 : quantity;
  const estimatedWork = patterns.length * EXACT_RETAINED_STATE_LIMIT * attempts;
  return estimatedWork <= EXACT_WORK_LIMIT ? { patterns, estimatedWork } : undefined;
}

function selectExactPlan(input: ContinuousRollInput, quantity: number): { quantity: number; plan?: CompactPlan; metrics: ContinuousRollPlanningMetrics } | undefined {
  const preflight = exactPreflight(input, quantity);
  if (!preflight) return undefined;
  let retainedStates = 0;
  for (let produced = quantity; produced >= 1; produced -= 1) {
    const stats: ExactPlannerStats = { retainedStates: 0 };
    const usableWidth = input.rollWidthMm - input.sideMarginMm * 2;
    const normalCapacity = countIn(usableWidth, input.pieceWidthMm, input.gapMm);
    const rotatedCapacity = input.allowRotation ? countIn(usableWidth, input.pieceLengthMm, input.gapMm) : 0;
    const quantum = rowHeightQuantum(input);
    const pure = planPureRows(produced, input, normalCapacity, rotatedCapacity);
    const tickCount = quantum === undefined ? Number.POSITIVE_INFINITY : Math.round(pure.adjustedLengthMm / quantum);
    // The older lattice planner is useful for small mixed-block instances. Its
    // own dense arrays are admitted only when their complete allocation is small.
    const latticeStates = (tickCount + 1) * (produced + 1);
    const plan = latticeStates <= EXACT_RETAINED_STATE_LIMIT
      ? planExactQuantity(produced, input)
      : planExactPatternSequence(produced, input, stats);
    retainedStates += latticeStates <= EXACT_RETAINED_STATE_LIMIT ? latticeStates : stats.retainedStates;
    if (!plan) return undefined;
    if (input.maxLengthMm === undefined || usedLength(plan, input) <= input.maxLengthMm) {
      return { quantity: produced, plan, metrics: { strategy: 'exact', estimatedWork: preflight.estimatedWork, retainedStates } };
    }
  }
  return { quantity: 0, metrics: { strategy: 'exact', estimatedWork: preflight.estimatedWork, retainedStates } };
}

function selectMaterialPlan(input: ContinuousRollInput, quantity: number): { quantity: number; plan?: CompactPlan; metrics: ContinuousRollPlanningMetrics } {
  let retainedStates = 0;
  let estimatedWork = 0;
  const evaluate = (produced: number) => {
    const evaluated = materialPlanForQuantity(produced, input);
    retainedStates += evaluated.retainedStates;
    estimatedWork += evaluated.retainedStates;
    return evaluated.plan;
  };
  if (input.maxLengthMm === undefined) {
    return { quantity, plan: evaluate(quantity), metrics: { strategy: 'material-first', estimatedWork, retainedStates } };
  }
  // The retained geometry families are monotone under removal of their final cells,
  // so binary search finds the maximum quantity they can fit without a quantity DP.
  let low = 0;
  let high = maximumAreaQuantity(input);
  let best: CompactPlan | undefined;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    const plan = evaluate(middle);
    if (plan) { low = middle; best = plan; } else high = middle - 1;
  }
  if (low > 0 && !best) best = evaluate(low);
  return { quantity: low, plan: best, metrics: { strategy: 'material-first', estimatedWork, retainedStates } };
}

function latticeFrontierEventCount(input: ContinuousRollInput, quantity: number, adjustedLengthMm: number): number {
  const usableWidth = input.rollWidthMm - input.sideMarginMm * 2;
  const normalCapacity = Math.min(quantity, countIn(usableWidth, input.pieceWidthMm, input.gapMm));
  const rotatedCapacity = Math.min(quantity, countIn(usableWidth, input.pieceLengthMm, input.gapMm));
  const normalStep = input.pieceLengthMm + input.gapMm;
  const rotatedStep = input.pieceWidthMm + input.gapMm;
  let count = 0;
  for (let rotatedColumns = 1; rotatedColumns <= rotatedCapacity; rotatedColumns += 1) {
    const remainingAdjustedWidth = usableWidth + input.gapMm - rotatedColumns * (input.pieceLengthMm + input.gapMm);
    const normalColumns = Math.max(0, Math.min(normalCapacity, Math.floor(remainingAdjustedWidth / (input.pieceWidthMm + input.gapMm))));
    if (normalColumns === 0) continue;
    count += Math.min(Math.ceil(quantity / normalColumns), Math.floor(adjustedLengthMm / normalStep));
    count += Math.min(Math.ceil(quantity / rotatedColumns), Math.floor(adjustedLengthMm / rotatedStep));
  }
  return count;
}

export function getContinuousRollCandidateCount(rawInput: ContinuousRollInput): number {
  const input = validate(rawInput);
  const quantity = maximumAreaQuantity(input);
  const preflight = exactPreflight(input, quantity);
  return preflight?.patterns?.length ?? materialCandidates(Math.max(1, quantity), input).length;
}

export function getContinuousRollPlanningMetrics(rawInput: ContinuousRollInput): ContinuousRollPlanningMetrics {
  const input = validate(rawInput);
  const quantity = maximumAreaQuantity(input);
  // Intentionally exercise the same bounded route as the public optimizer so
  // callers never receive a label or retained-state count for a different plan.
  return (selectExactPlan(input, quantity) ?? selectMaterialPlan(input, quantity)).metrics;
}

export function optimizeContinuousRollLayout(rawInput: ContinuousRollInput): ContinuousRollResult {
  const input = validate(rawInput);
  const usableWidth = input.rollWidthMm - input.sideMarginMm * 2;
  const normalFits = countIn(usableWidth, input.pieceWidthMm, input.gapMm) > 0;
  const rotatedFits = input.allowRotation && countIn(usableWidth, input.pieceLengthMm, input.gapMm) > 0;
  if (!normalFits && !rotatedFits) {
    throw new ContinuousRollLayoutValidationError('재단 규격이 가용 원단 폭보다 큽니다.');
  }
  const targetQuantity = maximumAreaQuantity(input);
  const selected = selectExactPlan(input, targetQuantity) ?? selectMaterialPlan(input, targetQuantity);
  if (!selected.plan || selected.quantity === 0) return emptyResult(selected.metrics, input);
  return materializeResult(selected.quantity, selected.plan, input, selected.metrics);
}
