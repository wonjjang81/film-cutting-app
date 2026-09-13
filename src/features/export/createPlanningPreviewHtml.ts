export type PlanningPreviewSection = {
  title: string;
  detail: string;
  layoutSvg: string;
};

export type PlanningPreviewDocument = {
  title: string;
  generatedAt: string;
  pieceCount: number;
  producedQuantity: number;
  newRollLengthMm: number;
  sections: readonly PlanningPreviewSection[];
};

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function number(value: number): string {
  return Math.round(value).toLocaleString('ko-KR');
}

/** Self-contained print document. SVG strings must come from the trusted layout renderer. */
export function createPlanningPreviewHtml(document: PlanningPreviewDocument): string {
  const sections = document.sections.map((section, index) => `<section class="sheet" aria-labelledby="layout-${index}">
  <header class="sheet-header"><div><p class="eyebrow">LAYOUT ${index + 1}</p><h2 id="layout-${index}">${escapeHtml(section.title)}</h2></div><p>${escapeHtml(section.detail)}</p></header>
  <figure>${section.layoutSvg || '<p class="empty">배치 도면이 없습니다.</p>'}</figure>
  </section>`).join('');
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(document.title)}</title><style>
  @page { size: A4 portrait; margin: 10mm; } * { box-sizing: border-box; } body { margin: 0; color: #0f172a; font-family: sans-serif; font-size: 10pt; }
  .document-header { margin-bottom: 8mm; padding-bottom: 5mm; border-bottom: 2px solid #2563eb; } h1,h2,p { margin: 0; } h1 { font-size: 20pt; } h2 { font-size: 14pt; }
  .meta { margin-top: 2mm; color: #64748b; } .summary { display: flex; gap: 3mm; margin-top: 4mm; } .metric { flex: 1; padding: 3mm; border: 1px solid #cbd5e1; border-radius: 2mm; }
  .metric span { display: block; color: #64748b; font-size: 8pt; } .metric strong { display: block; margin-top: 1mm; font-size: 12pt; }
  .sheet { break-before: page; } .sheet:first-of-type { break-before: auto; } .sheet-header { display: flex; justify-content: space-between; gap: 5mm; align-items: end; margin-bottom: 3mm; }
  .sheet-header > p { color: #64748b; text-align: right; } .eyebrow { margin-bottom: 1mm; color: #2563eb; font-size: 7pt; font-weight: 700; letter-spacing: 1px; }
  figure { margin: 0; text-align: center; } figure svg { display: block; width: 100%; height: auto; max-height: 245mm; border: 1px solid #cbd5e1; background: #f8fafc; }
  .empty { padding: 12mm; border: 1px dashed #94a3b8; color: #64748b; } @media print { .sheet { break-inside: avoid; } }
  </style></head><body><main><header class="document-header"><h1>${escapeHtml(document.title)}</h1><p class="meta">생성 시각: ${escapeHtml(document.generatedAt)}</p><div class="summary"><div class="metric"><span>계산 조각</span><strong>${number(document.pieceCount)}개</strong></div><div class="metric"><span>생산 수량</span><strong>${number(document.producedQuantity)}개</strong></div><div class="metric"><span>새 롤 사용 길이</span><strong>${number(document.newRollLengthMm)}mm</strong></div></div></header>${sections}</main></body></html>`;
}
