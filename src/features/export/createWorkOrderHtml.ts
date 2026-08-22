import type { SavedCuttingJob } from '../library/models';

const UNAVAILABLE = '저장되지 않음';

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function formatNumber(value: number): string {
  return Number.isFinite(value) ? String(value) : '—';
}

function dimension(value: number): string {
  return `${formatNumber(value)} mm`;
}

function statusLabel(status: SavedCuttingJob['result']['optimizationStatus']): string {
  switch (status) {
    case 'exact': return '정확한 최적해';
    case 'certified': return '하한 인증 해';
    case 'approximate': return '근사해 (최적 보장 없음)';
  }
}

function row(label: string, value: string): string {
  return `<tr><th scope="row">${label}</th><td>${value}</td></tr>`;
}

function remnantSummary(job: SavedCuttingJob): string {
  if (job.remnantSummary.length === 0) return '사용 안 함';
  return job.remnantSummary.map((remnant) => `${escapeHtml(remnant.id)}: ${dimension(remnant.widthMm)} × ${dimension(remnant.lengthMm)} × ${formatNumber(remnant.quantity)}`).join('<br>');
}

/** Creates self-contained printable markup. `layoutSvg` is trusted renderer output at this single insertion point. */
export function createWorkOrderHtml(job: SavedCuttingJob, layoutSvg: string): string {
  const layout = layoutSvg.length > 0
    // Intentional trust boundary: renderer-generated SVG is inserted as markup here and nowhere else.
    ? layoutSvg
    : '<p class="layout-empty">배치 도면이 없습니다.</p>';
  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>필름 재단 작업지시서</title>
<style>
@page { margin: 14mm; }
* { box-sizing: border-box; }
body { color: #111827; font-family: sans-serif; font-size: 12pt; line-height: 1.45; margin: 0; }
h1, h2 { margin: 0 0 8px; } h1 { font-size: 22pt; } h2 { font-size: 15pt; }
.meta { color: #374151; margin: 0 0 18px; } section, figure { break-inside: avoid; margin: 0 0 18px; }
table { border-collapse: collapse; width: 100%; } caption { font-weight: 700; text-align: left; margin-bottom: 6px; }
th, td { border: 1px solid #9ca3af; padding: 6px 8px; text-align: left; vertical-align: top; } th { background: #f3f4f6; width: 35%; }
figcaption { font-weight: 700; margin-bottom: 6px; } .legend { border-left: 4px solid #2563eb; padding-left: 8px; }
.layout-empty { border: 1px dashed #6b7280; padding: 12px; }
@media print { body { font-size: 10pt; } section, figure { page-break-inside: avoid; } }
</style>
</head>
<body>
<main aria-labelledby="work-order-title">
<header><h1 id="work-order-title">필름 재단 작업지시서</h1><p class="meta">작업명: ${escapeHtml(job.name)}<br>생성 시각: ${escapeHtml(job.createdAt)}</p></header>
<section aria-labelledby="input-heading"><h2 id="input-heading">작업 조건</h2>
<table><caption>필름 및 재단 규격</caption><tbody>
${row('브랜드', escapeHtml(job.brand))}
${row('제품 번호', escapeHtml(job.productNumber))}
${row('원단 폭', dimension(job.input.rollWidthMm))}
${row('제품 크기', `${dimension(job.input.pieceWidthMm)} × ${dimension(job.input.pieceLengthMm)}`)}
${row('요청 수량', formatNumber(job.input.quantity))}
${row('간격', dimension(job.input.gapMm))}
${row('좌우 여백', dimension(job.input.sideMarginMm))}
${row('시작/끝 여백', dimension(job.input.startEndMarginMm))}
${row('회전 허용', job.input.allowRotation ? '예' : '아니오')}
${row('최대 길이', job.input.maxLengthMm === undefined ? '제한 없음' : dimension(job.input.maxLengthMm))}
</tbody></table></section>
<section aria-labelledby="result-heading"><h2 id="result-heading">결과 요약</h2>
<table><caption>생산 및 최적화 결과</caption><tbody>
${row('사용 자투리 ID', job.remnantIds.length === 0 ? '사용 안 함' : job.remnantIds.map(escapeHtml).join(', '))}
${row('사용 자투리 요약', remnantSummary(job))}
${row('새 원단 길이', dimension(job.result.newRollLengthMm))}
${row('생산 수량', formatNumber(job.result.producedQuantity))}
${row('초과 생산', formatNumber(job.result.overproduction))}
${row('수율', `${formatNumber(job.result.utilizationPercent)} %`)}
${row('손실률', `${formatNumber(job.result.wastePercent)} %`)}
${row('최적화 상태', statusLabel(job.result.optimizationStatus))}
${row('물리 하한 길이', UNAVAILABLE)}
${row('최적성 격차', UNAVAILABLE)}
</tbody></table></section>
<figure aria-labelledby="layout-caption"><figcaption id="layout-caption">배치 도면</figcaption>
${layout}
</figure>
<section class="legend" aria-labelledby="legend-heading"><h2 id="legend-heading">범례</h2><p>도면의 각 사각형은 재단 제품 하나를 뜻합니다. 자투리 사용 내역과 새 원단 길이는 위 결과 요약을 따릅니다.</p></section>
</main>
</body>
</html>`;
}
