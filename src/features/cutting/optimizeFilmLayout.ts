export type LayoutStrategy = 'normal' | 'rotated' | 'mixed-vertical' | 'mixed-horizontal';

export type FilmLayoutInput = {
  rollWidthMm: number;
  rollLengthMm: number;
  pieceWidthMm: number;
  pieceLengthMm: number;
  quantity: number;
  gapMm?: number;
  marginMm?: number;
  allowRotation?: boolean;
};

export type Placement = {
  id: number;
  x: number;
  y: number;
  width: number;
  height: number;
  rotated: boolean;
};

export type FilmLayoutResult = {
  strategy: LayoutStrategy;
  placements: Placement[];
  piecesPerSheet: number;
  sheetsRequired: number;
  producedQuantity: number;
  usedLengthMm: number;
  utilizationPercent: number;
  wastePercent: number;
  availableWidthMm: number;
  availableLengthMm: number;
};

export class FilmLayoutValidationError extends Error {}

type Candidate = { strategy: LayoutStrategy; placements: Placement[] };

function positive(name: string, value: number): void {
  if (!Number.isFinite(value) || value <= 0) throw new FilmLayoutValidationError(`${name}은(는) 0보다 큰 숫자여야 합니다.`);
}

function nonNegative(name: string, value: number): void {
  if (!Number.isFinite(value) || value < 0) throw new FilmLayoutValidationError(`${name}은(는) 0 이상이어야 합니다.`);
}

function countIn(space: number, size: number, gap: number): number {
  return Math.max(0, Math.floor((space + gap) / (size + gap)));
}

function extent(count: number, size: number, gap: number): number {
  return count <= 0 ? 0 : count * size + (count - 1) * gap;
}

function grid(
  startX: number,
  startY: number,
  regionWidth: number,
  regionHeight: number,
  pieceWidth: number,
  pieceHeight: number,
  gap: number,
  rotated: boolean,
): Placement[] {
  const columns = countIn(regionWidth, pieceWidth, gap);
  const rows = countIn(regionHeight, pieceHeight, gap);
  const placements: Placement[] = [];
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      placements.push({
        id: placements.length + 1,
        x: startX + column * (pieceWidth + gap),
        y: startY + row * (pieceHeight + gap),
        width: pieceWidth,
        height: pieceHeight,
        rotated,
      });
    }
  }
  return placements;
}

function combine(strategy: LayoutStrategy, groups: Placement[][]): Candidate {
  return {
    strategy,
    placements: groups.flat().map((placement, index) => ({ ...placement, id: index + 1 })),
  };
}

function candidates(input: Required<Pick<FilmLayoutInput, 'pieceWidthMm' | 'pieceLengthMm' | 'gapMm' | 'allowRotation'>>, width: number, height: number): Candidate[] {
  const { pieceWidthMm: pw, pieceLengthMm: ph, gapMm: gap, allowRotation } = input;
  const result: Candidate[] = [combine('normal', [grid(0, 0, width, height, pw, ph, gap, false)])];
  if (!allowRotation || pw === ph) return result;

  result.push(combine('rotated', [grid(0, 0, width, height, ph, pw, gap, true)]));

  const normalColumns = countIn(width, pw, gap);
  for (let columns = 1; columns <= normalColumns; columns += 1) {
    const normalWidth = extent(columns, pw, gap);
    const rotatedX = normalWidth + gap;
    if (rotatedX >= width) continue;
    result.push(combine('mixed-vertical', [
      grid(0, 0, normalWidth, height, pw, ph, gap, false),
      grid(rotatedX, 0, width - rotatedX, height, ph, pw, gap, true),
    ]));
  }

  const normalRows = countIn(height, ph, gap);
  for (let rows = 1; rows <= normalRows; rows += 1) {
    const normalHeight = extent(rows, ph, gap);
    const rotatedY = normalHeight + gap;
    if (rotatedY >= height) continue;
    result.push(combine('mixed-horizontal', [
      grid(0, 0, width, normalHeight, pw, ph, gap, false),
      grid(0, rotatedY, width, height - rotatedY, ph, pw, gap, true),
    ]));
  }

  return result;
}

export function optimizeFilmLayout(input: FilmLayoutInput): FilmLayoutResult {
  const gap = input.gapMm ?? 0;
  const margin = input.marginMm ?? 0;
  positive('원단 폭', input.rollWidthMm);
  positive('원단 길이', input.rollLengthMm);
  positive('재단 폭', input.pieceWidthMm);
  positive('재단 길이', input.pieceLengthMm);
  positive('수량', input.quantity);
  nonNegative('재단 간격', gap);
  nonNegative('가장자리 여백', margin);
  if (!Number.isInteger(input.quantity)) throw new FilmLayoutValidationError('수량은 정수여야 합니다.');

  const availableWidth = input.rollWidthMm - margin * 2;
  const availableLength = input.rollLengthMm - margin * 2;
  if (availableWidth <= 0 || availableLength <= 0) throw new FilmLayoutValidationError('가장자리 여백이 원단 규격보다 큽니다.');

  const best = candidates({
    pieceWidthMm: input.pieceWidthMm,
    pieceLengthMm: input.pieceLengthMm,
    gapMm: gap,
    allowRotation: input.allowRotation ?? false,
  }, availableWidth, availableLength).sort((a, b) => {
    const capacity = b.placements.length - a.placements.length;
    if (capacity !== 0) return capacity;
    const rotationsA = a.placements.filter((item) => item.rotated).length;
    const rotationsB = b.placements.filter((item) => item.rotated).length;
    return rotationsA - rotationsB;
  })[0];

  if (!best || best.placements.length === 0) throw new FilmLayoutValidationError('재단 규격이 가용 원단보다 큽니다.');

  const piecesPerSheet = best.placements.length;
  const sheetsRequired = Math.ceil(input.quantity / piecesPerSheet);
  const suppliedArea = sheetsRequired * input.rollWidthMm * input.rollLengthMm;
  const usedArea = input.quantity * input.pieceWidthMm * input.pieceLengthMm;
  const utilizationPercent = Math.round((usedArea / suppliedArea) * 10000) / 100;

  return {
    strategy: best.strategy,
    placements: best.placements.slice(0, Math.min(input.quantity, piecesPerSheet)).map((item) => ({
      ...item,
      x: item.x + margin,
      y: item.y + margin,
    })),
    piecesPerSheet,
    sheetsRequired,
    producedQuantity: input.quantity,
    usedLengthMm: sheetsRequired * input.rollLengthMm,
    utilizationPercent,
    wastePercent: Math.round((100 - utilizationPercent) * 100) / 100,
    availableWidthMm: availableWidth,
    availableLengthMm: availableLength,
  };
}
