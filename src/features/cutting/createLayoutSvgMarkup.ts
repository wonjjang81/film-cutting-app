type PrintableLayoutResult = {
  placements: readonly { id: number; x: number; y: number; width: number; height: number; rotated: boolean }[];
  rowSequence?: readonly { endY: number; pattern: string }[];
};

export type LayoutSvgOptions = {
  result: PrintableLayoutResult;
  rollWidthMm: number;
  displayLengthMm: number;
  sideMarginMm?: number;
  startEndMarginMm?: number;
  ariaLabel?: string;
  showDimensions?: boolean;
  gridIntervalMm?: number;
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
  showDimensions = false,
  gridIntervalMm,
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
  const grid = Number.isFinite(gridIntervalMm) && gridIntervalMm! > 0
    ? `<g opacity="0.35">${Array.from({ length: Math.floor(rollWidthMm / gridIntervalMm!) }, (_, index) => (index + 1) * gridIntervalMm!).map((position) => `<line x1="${numeric(position)}" y1="0" x2="${numeric(position)}" y2="${numeric(displayLengthMm)}" stroke="#94a3b8" stroke-width="${numeric(strokeWidth * 0.65)}" stroke-dasharray="8 8" />`).join('')}${Array.from({ length: Math.floor(displayLengthMm / gridIntervalMm!) }, (_, index) => (index + 1) * gridIntervalMm!).map((position) => `<line x1="0" y1="${numeric(position)}" x2="${numeric(rollWidthMm)}" y2="${numeric(position)}" stroke="#94a3b8" stroke-width="${numeric(strokeWidth * 0.65)}" stroke-dasharray="8 8" />`).join('')}</g><g aria-label="1000mm 길이 기준선" opacity="0.62">${Array.from({ length: Math.floor(displayLengthMm / 1_000) }, (_, index) => (index + 1) * 1_000).filter((position) => position < displayLengthMm).map((position) => `<line data-grid="major-length" x1="0" y1="${numeric(position)}" x2="${numeric(rollWidthMm)}" y2="${numeric(position)}" stroke="#64748b" stroke-width="${numeric(Math.max(strokeWidth * 2.4, 2.8))}" stroke-dasharray="18 8" />`).join('')}</g>`
    : '';
  const separators = (result.rowSequence ?? [])
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
      const centerX = placement.x + placement.width / 2;
      const centerY = placement.y + placement.height / 2;
      const label = showDimensions ? `#${numeric(placement.id)}` : `${numeric(placement.id)} · ${direction}`;
      const dimensionLabel = `${numeric(placement.width)}×${numeric(placement.height)} mm${placement.rotated ? ' · ↻' : ''}`;
      return `<g aria-label="제품 ${numeric(placement.id)} · ${direction}"><rect x="${numeric(placement.x)}" y="${numeric(placement.y)}" width="${numeric(placement.width)}" height="${numeric(placement.height)}" rx="2" fill="${fill}" stroke="${stroke}" stroke-width="${numeric(strokeWidth)}" /><text x="${numeric(centerX)}" y="${numeric(centerY + (showDimensions ? -fontSize * 0.1 : fontSize / 3))}" text-anchor="middle" font-size="${numeric(fontSize)}" font-weight="700" fill="${textFill}">${label}</text>${showDimensions ? `<text x="${numeric(centerX)}" y="${numeric(centerY + fontSize * 1.05)}" text-anchor="middle" font-size="${numeric(Math.max(7, fontSize * 0.78))}" font-weight="600" fill="#334155">${dimensionLabel}</text>` : ''}</g>`;
    })
    .join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${escapeXml(ariaLabel)}" viewBox="0 0 ${numeric(rollWidthMm)} ${numeric(displayLengthMm)}" preserveAspectRatio="xMidYMin meet"><rect x="0" y="0" width="${numeric(rollWidthMm)}" height="${numeric(displayLengthMm)}" fill="#f8fafc" stroke="#334155" stroke-width="${numeric(Math.max(1, rollWidthMm / 350))}" rx="4" />${grid}${margin}${separators}${placements}</svg>`;
}
