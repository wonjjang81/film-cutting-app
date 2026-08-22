export type FilmCutInput = {
  rollWidthMm: number;
  rollLengthMm: number;
  pieceWidthMm: number;
  pieceLengthMm: number;
  quantity: number;
  allowRotation?: boolean;
};

export type FilmCutResult = {
  columns: number;
  rows: number;
  piecesPerSheet: number;
  sheetsRequired: number;
  usedLengthMm: number;
  utilizationPercent: number;
  rotated: boolean;
};

export class FilmCutValidationError extends Error {}

function assertPositiveFinite(name: string, value: number): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new FilmCutValidationError(`${name}은(는) 0보다 큰 숫자여야 합니다.`);
  }
}

function layout(rollWidth: number, rollLength: number, width: number, length: number) {
  const columns = Math.floor(rollWidth / width);
  const rows = Math.floor(rollLength / length);
  return { columns, rows, pieces: columns * rows };
}

export function calculateFilmCut(input: FilmCutInput): FilmCutResult {
  assertPositiveFinite('원단 폭', input.rollWidthMm);
  assertPositiveFinite('원단 길이', input.rollLengthMm);
  assertPositiveFinite('재단 폭', input.pieceWidthMm);
  assertPositiveFinite('재단 길이', input.pieceLengthMm);
  assertPositiveFinite('수량', input.quantity);

  if (!Number.isInteger(input.quantity)) {
    throw new FilmCutValidationError('수량은 정수여야 합니다.');
  }

  const normal = layout(input.rollWidthMm, input.rollLengthMm, input.pieceWidthMm, input.pieceLengthMm);
  const rotated = input.allowRotation
    ? layout(input.rollWidthMm, input.rollLengthMm, input.pieceLengthMm, input.pieceWidthMm)
    : { columns: 0, rows: 0, pieces: 0 };
  const best = rotated.pieces > normal.pieces ? { ...rotated, rotated: true } : { ...normal, rotated: false };

  if (best.pieces === 0) {
    throw new FilmCutValidationError('재단 규격이 원단보다 큽니다.');
  }

  const sheetsRequired = Math.ceil(input.quantity / best.pieces);
  const usedLengthMm = sheetsRequired * input.rollLengthMm;
  const usedPieceArea = input.quantity * input.pieceWidthMm * input.pieceLengthMm;
  const suppliedArea = sheetsRequired * input.rollWidthMm * input.rollLengthMm;

  return {
    columns: best.columns,
    rows: best.rows,
    piecesPerSheet: best.pieces,
    sheetsRequired,
    usedLengthMm,
    utilizationPercent: Math.round((usedPieceArea / suppliedArea) * 10000) / 100,
    rotated: best.rotated,
  };
}
