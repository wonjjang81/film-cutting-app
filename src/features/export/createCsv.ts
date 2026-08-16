import type { SavedCuttingJob } from '../library/models';

const BOM = '\uFEFF';
const CRLF = '\r\n';
const UNAVAILABLE = '저장되지 않음';

function formatNumber(value: number): string {
  return Number.isFinite(value) ? String(value) : '—';
}

function protectFormula(value: string): string {
  return /^\s*[=+\-@]/.test(value) ? `'${value}` : value;
}

function escapeCsv(value: string, userControlled = false): string {
  const safe = userControlled ? protectFormula(value) : value;
  return /[,"\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

function remnantSummary(job: SavedCuttingJob): string {
  return job.remnantSummary
    .map((remnant) => `${remnant.id}: ${formatNumber(remnant.widthMm)}×${formatNumber(remnant.lengthMm)}mm × ${formatNumber(remnant.quantity)}`)
    .join('; ');
}

function statusLabel(status: SavedCuttingJob['result']['optimizationStatus']): string {
  switch (status) {
    case 'exact': return '정확한 최적해';
    case 'certified': return '하한 인증 해';
    case 'approximate': return '근사해 (최적 보장 없음)';
  }
}

/** Generates a spreadsheet-safe, deterministic UTF-8 CSV work-order summary. */
export function createCsv(job: SavedCuttingJob): string {
  const rows: Array<[string, string, boolean?]> = [
    ['항목', '값'], ['작업 ID', job.id, true], ['작업명', job.name, true], ['생성 시각', job.createdAt, true],
    ['브랜드', job.brand, true], ['제품 번호', job.productNumber, true],
    ['원단 폭 (mm)', formatNumber(job.input.rollWidthMm)], ['제품 폭 (mm)', formatNumber(job.input.pieceWidthMm)],
    ['제품 길이 (mm)', formatNumber(job.input.pieceLengthMm)], ['요청 수량', formatNumber(job.input.quantity)],
    ['간격 (mm)', formatNumber(job.input.gapMm)], ['좌우 여백 (mm)', formatNumber(job.input.sideMarginMm)],
    ['시작/끝 여백 (mm)', formatNumber(job.input.startEndMarginMm)], ['회전 허용', job.input.allowRotation ? '예' : '아니오'],
    ['최대 길이 (mm)', job.input.maxLengthMm === undefined ? '제한 없음' : formatNumber(job.input.maxLengthMm)],
    ['사용 자투리 ID', job.remnantIds.join(', '), true], ['사용 자투리 요약', remnantSummary(job), true],
    ['새 원단 길이 (mm)', formatNumber(job.result.newRollLengthMm)], ['생산 수량', formatNumber(job.result.producedQuantity)],
    ['초과 생산', formatNumber(job.result.overproduction)], ['수율 (%)', formatNumber(job.result.utilizationPercent)],
    ['손실률 (%)', formatNumber(job.result.wastePercent)], ['최적화 상태', statusLabel(job.result.optimizationStatus)],
    // SavedCuttingJob does not persist optimizer lower-bound or gap values.
    ['물리 하한 길이 (mm)', UNAVAILABLE], ['최적성 격차 (mm)', UNAVAILABLE],
  ];

  return BOM + rows.map(([label, value, userControlled]) => `${escapeCsv(label)},${escapeCsv(value, userControlled)}`).join(CRLF) + CRLF;
}
