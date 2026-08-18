import type { ContinuousRollResult } from './optimizeContinuousRollLayout';

export type LayoutSvgOptions = {
  result: ContinuousRollResult;
  rollWidthMm: number;
  displayLengthMm: number;
  sideMarginMm?: number;
  startEndMarginMm?: number;
  ariaLabel?: string;
};

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function finiteNonnegative(value: number): boolean {
  return Number.isFinite(value) && value >= 0;
}

function numeric(value: number): string {
  return String(Math.round(value * 1_000_000) / 1_000_000);
}

/** Deterministic trusted-renderer SVG for printable work orders. */
export function createLayoutSvgMarkup({
  result,
  rollWidthMm,
  displayLengthMm,
  sideMarginMm = 0,
  startEndMarginMm = 0,
  ariaLabel = '필름 자동배치 도면',
}: LayoutSvgOptions): string {
  if (!Number.isFinite(rollWidthMm) || rollWidthMm <= 0
    || !Number.isFinite(displayLengthMm) || displayLengthMm <= 0
    || !finiteNonnegative(sideMarginMm) || !finiteNonnegative(startEndMarginMm)
    || rollWidthMm - sideMarginMm * 2 <= 0
    || displayLengthMm - startEndMarginMm * 2 <= 0) return '';

  const strokeWidth = Math.max(0.8, rollWidthMm / 700);
  const fontSize = Math.max(8, Math.min(18, Math.min(rollWidthMm, displayLengthMm) / 22));
  const margin = sideMarginMm > 0 || startEndMarginMm > 0
    ? `<rect x="${numeric(sideMarginMm)}" y="${numeric(startEndMarginMm)}" width="${numeric(rollWidthMm - sideMarginMm * 2)}" height="${numeric(displayLengthMm - startEndMarginMm * 2)}" fill="none" stroke="#f59e0b" stroke-dasharray="8 5" stroke-width="${numeric(Math.max(1, rollWidthMm / 500))}" />`
    : '';
  const separators = result.rowSequence
    .filter((row) => Number.isFinite(row.endY) && row.endY >= 0 && row.endY <= displayLengthMm)
    .map((row) => `<g><rect x="${numeric(sideMarginMm)}" y="${numeric(row.endY)}" width="${numeric(rollWidthMm - sideMarginMm * 2)}" height="${numeric(Math.max(0.6, rollWidthMm / 1000))}" fill="#94a3b8" opacity="0.7" /><text x="${numeric(rollWidthMm - sideMarginMm)}" y="${numeric(Math.max(0, row.endY - 2))}" text-anchor="end" font-size="${numeric(Math.max(7, fontSize * 0.7))}" fill="#64748b">${escapeXml(row.pattern)}</text></g>`)
    .join('');
  const placements = result.placements
    .filter((placement) => Number.isFinite(placement.x)
      && Number.isFinite(placement.y)
      && Number.isFinite(placement.width)
      && Number.isFinite(placement.height)
      && placement.x >= 0
      && placement.y >= 0
      && placement.width > 0
      && placement.height > 0
      && placement.x + placement.width <= rollWidthMm
      && placement.y + placement.height <= displayLengthMm)
    .map((placement) => {
      const direction = placement.rotated ? '90도 회전' : '기본 방향';
      const fill = placement.rotated ? '#ccfbf1' : '#dbeafe';
      const stroke = placement.rotated ? '#0f766e' : '#1d4ed8';
      const textFill = placement.rotated ? '#115e59' : '#1e3a8a';
      return `<g aria-label="제품 ${numeric(placement.id)} · ${direction}"><rect x="${numeric(placement.x)}" y="${numeric(placement.y)}" width="${numeric(placement.width)}" height="${numeric(placement.height)}" rx="2" fill="${fill}" stroke="${stroke}" stroke-width="${numeric(strokeWidth)}" /><text x="${numeric(placement.x + placement.width / 2)}" y="${numeric(placement.y + placement.height / 2 + fontSize / 3)}" text-anchor="middle" font-size="${numeric(fontSize)}" font-weight="700" fill="${textFill}">${numeric(placement.id)} · ${direction}</text></g>`;
    })
    .join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${escapeXml(ariaLabel)}" viewBox="0 0 ${numeric(rollWidthMm)} ${numeric(displayLengthMm)}" preserveAspectRatio="xMidYMin meet"><rect x="0" y="0" width="${numeric(rollWidthMm)}" height="${numeric(displayLengthMm)}" fill="#f8fafc" stroke="#334155" stroke-width="${numeric(Math.max(1, rollWidthMm / 350))}" rx="4" />${margin}${separators}${placements}</svg>`;
}
