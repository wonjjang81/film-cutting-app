export const DEFAULT_CUT_ALLOWANCE_MM = 50;
export const LEGACY_CUT_ALLOWANCE_MM = 0;

export type CutAllowanceDimensions = {
  sourcePieceWidthMm: number;
  sourcePieceLengthMm: number;
  cutAllowanceMm: number;
  pieceWidthMm: number;
  pieceLengthMm: number;
};

function finiteNumber(value: unknown): number {
  return typeof value === 'number' ? value : Number(value);
}

export function normalizeCutAllowance(value: unknown): number {
  if (value === undefined || value === null || value === '') return LEGACY_CUT_ALLOWANCE_MM;
  const parsed = finiteNumber(value);
  if (!Number.isFinite(parsed) || parsed < 0) throw new Error('재단 여유치는 0 이상의 숫자로 입력해 주세요.');
  return parsed;
}

/** Returns a new form whose allowance inherits the current overall setting. */
export function inheritCutAllowance<T extends { cutAllowance?: string }>(form: T, overallAllowance: unknown): T {
  return { ...form, cutAllowance: String(normalizeCutAllowance(overallAllowance)) };
}

export function cutAllowanceDimensions(width: unknown, length: unknown, allowance: unknown): CutAllowanceDimensions {
  const sourcePieceWidthMm = finiteNumber(width);
  const sourcePieceLengthMm = finiteNumber(length);
  const cutAllowanceMm = normalizeCutAllowance(allowance);
  return {
    sourcePieceWidthMm,
    sourcePieceLengthMm,
    cutAllowanceMm,
    pieceWidthMm: sourcePieceWidthMm + cutAllowanceMm,
    pieceLengthMm: sourcePieceLengthMm + cutAllowanceMm,
  };
}

export function restoreCutAllowanceDimensions(input: {
  pieceWidthMm: number;
  pieceLengthMm: number;
  sourcePieceWidthMm?: number;
  sourcePieceLengthMm?: number;
  cutAllowanceMm?: number;
}): Pick<CutAllowanceDimensions, 'sourcePieceWidthMm' | 'sourcePieceLengthMm' | 'cutAllowanceMm'> {
  if (input.cutAllowanceMm === undefined) {
    return { sourcePieceWidthMm: input.pieceWidthMm, sourcePieceLengthMm: input.pieceLengthMm, cutAllowanceMm: LEGACY_CUT_ALLOWANCE_MM };
  }
  const cutAllowanceMm = normalizeCutAllowance(input.cutAllowanceMm);
  const sourcePieceWidthMm = Number.isFinite(input.sourcePieceWidthMm) && Number(input.sourcePieceWidthMm) >= 0
    ? Number(input.sourcePieceWidthMm) : input.pieceWidthMm - cutAllowanceMm;
  const sourcePieceLengthMm = Number.isFinite(input.sourcePieceLengthMm) && Number(input.sourcePieceLengthMm) >= 0
    ? Number(input.sourcePieceLengthMm) : input.pieceLengthMm - cutAllowanceMm;
  if (sourcePieceWidthMm < 0 || sourcePieceLengthMm < 0) {
    return { sourcePieceWidthMm: input.pieceWidthMm, sourcePieceLengthMm: input.pieceLengthMm, cutAllowanceMm: LEGACY_CUT_ALLOWANCE_MM };
  }
  return { sourcePieceWidthMm, sourcePieceLengthMm, cutAllowanceMm };
}

export type CutAllowanceSummary = { kind: 'uniform'; valueMm: number } | { kind: 'mixed' };

export function summarizeCutAllowances(values: readonly unknown[]): CutAllowanceSummary {
  if (values.length === 0) return { kind: 'uniform', valueMm: DEFAULT_CUT_ALLOWANCE_MM };
  const normalized = values.map(normalizeCutAllowance);
  return normalized.every((value) => value === normalized[0])
    ? { kind: 'uniform', valueMm: normalized[0]! }
    : { kind: 'mixed' };
}
