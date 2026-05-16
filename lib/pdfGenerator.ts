import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as Print from 'expo-print';
import { GroupPlacementResult, Invoice, PlacedPiece, PlacementResult } from '@/lib/filmCutting';
import { Platform } from 'react-native';

/**
 * 숫자를 한글 형식으로 표시 (예: 1,000,000)
 */
function formatNumber(num: number): string {
  return num.toLocaleString('ko-KR');
}

/**
 * 미터를 소수점 2자리로 표시
 */
function formatM(meters: number): string {
  return meters.toFixed(2);
}

/**
 * 견적서 텍스트 생성 (CSV 형식으로 저장)
 */
export async function generateEstimatePDF(
  invoice: Invoice,
  projectName: string = '필름 재단 견적서',
  constructionPrice: number,
): Promise<string> {
  const lines: string[] = [];
  
  // 헤더
  lines.push(`필름 재단 계산기 - 견적서`);
  lines.push(`프로젝트명: ${projectName}`);
  lines.push(`작성일: ${new Date().toLocaleDateString('ko-KR')}`);
  lines.push('');
  
  // 배치 요약
  lines.push('=== 배치 요약 ===');
  lines.push(`총 필름 길이: ${formatM(invoice.totalFilmLengthM)}m`);
  lines.push(`총 면적: ${invoice.totalFilmAreaM2.toFixed(3)}m²`);
  lines.push(`그룹 수: ${invoice.groupInvoices.length}개`);
  lines.push('');
  
  // 그룹별 내역
  lines.push('=== 그룹별 내역 ===');
  for (const gi of invoice.groupInvoices) {
    lines.push(`${gi.groupName} - ${gi.brand}${gi.filmName ? ` · ${gi.filmName}` : ''}`);
    lines.push(`  필름 길이: ${formatM(gi.filmLengthM)}m`);
    lines.push(`  면적: ${gi.filmAreaM2.toFixed(3)}m²`);
    lines.push(`  자재비 단가: ${formatNumber(gi.materialCostPerM)}원/m`);
    lines.push(`  자재비: ${formatNumber(gi.materialCost)}원`);
    lines.push(`  시공비 단가: ${formatNumber(gi.constructionPricePerM2)}원/m²`);
    lines.push(`  시공비: ${formatNumber(gi.constructionCost)}원`);
    lines.push(`  소계: ${formatNumber(gi.subtotal)}원`);
    lines.push('');
  }
  
  // 최종 합계
  lines.push('=== 최종 합계 ===');
  lines.push(`자재비 합계: ${formatNumber(invoice.totalMaterialCost)}원`);
  lines.push(`시공비 합계: ${formatNumber(invoice.totalConstructionCost)}원`);
  if (invoice.discountRate > 0) {
    lines.push(`할인 (${(invoice.discountRate * 100).toFixed(0)}%): -${formatNumber(invoice.discount)}원`);
  }
  lines.push('');
  lines.push(`💰 최종 견적: ${formatNumber(invoice.subtotal - invoice.discount)}원`);
  lines.push('');
  lines.push('※ VAT 별도');
  
  const content = lines.join('\n');
  const fileName = `견적서_${projectName}_${new Date().getTime()}.txt`;
  const filePath = `${FileSystem.documentDirectory ?? ''}${fileName}`;

  try {
    await FileSystem.writeAsStringAsync(filePath, content);
    return filePath;
  } catch (error) {
    console.error('견적서 텍스트 생성 오류:', error);
    throw error;
  }
}

/**
 * 견적서 HTML 생성 (PDF 변환 전용)
 */
function generateEstimateHTML(
  invoice: Invoice,
  projectName: string,
  constructionPrice: number,
  companyInfo?: { companyName?: string; managerName?: string; phone?: string; email?: string; address?: string; note?: string },
): string {
  const groupRows = invoice.groupInvoices
    .map(
      (gi) => `
    <tr>
      <td>${gi.groupName}</td>
      <td>${gi.brand}${gi.filmName ? ` · ${gi.filmName}` : ''}</td>
      <td style="text-align: right">${formatM(gi.filmLengthM)}</td>
      <td style="text-align: right">${gi.filmAreaM2.toFixed(3)}</td>
      <td style="text-align: right">${formatNumber(gi.materialCostPerM)}</td>
      <td style="text-align: right">${formatNumber(gi.materialCost)}</td>
      <td style="text-align: right">${formatNumber(gi.constructionPricePerM2)}</td>
      <td style="text-align: right">${formatNumber(gi.constructionCost)}</td>
      <td style="text-align: right">${formatNumber(gi.subtotal)}</td>
    </tr>
  `
    )
    .join('');

  const discountRow =
    invoice.discountRate > 0
      ? `
    <tr style="background-color: #fff3cd;">
      <td colspan="8" style="text-align: right; font-weight: bold;">할인 (${(invoice.discountRate * 100).toFixed(0)}%):</td>
      <td style="text-align: right; font-weight: bold;">-${formatNumber(invoice.discount)}원</td>
    </tr>
  `
      : '';

  const finalAmount = invoice.subtotal - invoice.discount;

  return `
<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>필름 재단 견적서</title>
  <style>
    body {
      font-family: 'Noto Sans CJK KR', 'Apple SD Gothic Neo', sans-serif;
      margin: 20px;
      background-color: #f5f5f5;
    }
    .container {
      max-width: 1000px;
      margin: 0 auto;
      background-color: white;
      padding: 30px;
      border-radius: 8px;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
    }
    .header {
      text-align: center;
      margin-bottom: 30px;
      border-bottom: 2px solid #333;
      padding-bottom: 15px;
    }
    .header h1 {
      margin: 0;
      font-size: 28px;
      color: #333;
    }
    .header p {
      margin: 5px 0;
      color: #666;
      font-size: 14px;
    }
    .company-info {
      margin-bottom: 20px;
      padding: 15px;
      background-color: #f9f9f9;
      border-left: 4px solid #0a7ea4;
      border-radius: 4px;
    }
    .company-info p {
      margin: 5px 0;
      font-size: 13px;
      color: #555;
    }
    .summary {
      margin-bottom: 20px;
      display: grid;
      grid-template-columns: 1fr 1fr 1fr;
      gap: 15px;
    }
    .summary-box {
      padding: 12px;
      background-color: #f0f7ff;
      border-radius: 4px;
      text-align: center;
    }
    .summary-box label {
      display: block;
      font-size: 12px;
      color: #666;
      margin-bottom: 5px;
    }
    .summary-box value {
      display: block;
      font-size: 18px;
      font-weight: bold;
      color: #0a7ea4;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 20px;
      font-size: 13px;
    }
    th {
      background-color: #0a7ea4;
      color: white;
      padding: 10px;
      text-align: left;
      font-weight: bold;
      border: 1px solid #0a7ea4;
    }
    td {
      padding: 10px;
      border: 1px solid #ddd;
    }
    tr:nth-child(even) {
      background-color: #f9f9f9;
    }
    .total-row {
      background-color: #e8f4f8;
      font-weight: bold;
    }
    .final-row {
      background-color: #0a7ea4;
      color: white;
      font-weight: bold;
      font-size: 16px;
    }
    .final-row td {
      border-color: #0a7ea4;
    }
    .footer {
      margin-top: 20px;
      padding-top: 15px;
      border-top: 1px solid #ddd;
      font-size: 12px;
      color: #999;
      text-align: center;
    }
    .note {
      margin-top: 10px;
      padding: 10px;
      background-color: #fffbea;
      border-left: 3px solid #f59e0b;
      border-radius: 4px;
      font-size: 12px;
      color: #666;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>필름 재단 견적서</h1>
      <p>프로젝트명: ${projectName}</p>
      <p>작성일: ${new Date().toLocaleDateString('ko-KR')}</p>
    </div>

    ${
      companyInfo && (companyInfo.companyName || companyInfo.managerName || companyInfo.phone || companyInfo.email || companyInfo.address)
        ? `
    <div class="company-info">
      ${companyInfo.companyName ? `<p><strong>업체명:</strong> ${companyInfo.companyName}</p>` : ''}
      ${companyInfo.managerName ? `<p><strong>담당자:</strong> ${companyInfo.managerName}</p>` : ''}
      ${companyInfo.phone ? `<p><strong>연락처:</strong> ${companyInfo.phone}</p>` : ''}
      ${companyInfo.email ? `<p><strong>이메일:</strong> ${companyInfo.email}</p>` : ''}
      ${companyInfo.address ? `<p><strong>주소:</strong> ${companyInfo.address}</p>` : ''}
    </div>
    `
        : ''
    }

    <div class="summary">
      <div class="summary-box">
        <label>총 필름 길이</label>
        <value>${formatM(invoice.totalFilmLengthM)}m</value>
      </div>
      <div class="summary-box">
        <label>총 면적</label>
        <value>${invoice.totalFilmAreaM2.toFixed(3)}m²</value>
      </div>
      <div class="summary-box">
        <label>그룹 수</label>
        <value>${invoice.groupInvoices.length}개</value>
      </div>
    </div>

    <table>
      <thead>
        <tr>
          <th>그룹</th>
          <th>필름</th>
          <th>길이(m)</th>
          <th>면적(m²)</th>
          <th>자재비/m</th>
          <th>자재비</th>
          <th>시공비/m²</th>
          <th>시공비</th>
          <th>소계</th>
        </tr>
      </thead>
      <tbody>
        ${groupRows}
        <tr class="total-row">
          <td colspan="5" style="text-align: right;">합계</td>
          <td style="text-align: right;">${formatNumber(invoice.totalMaterialCost)}원</td>
          <td colspan="2" style="text-align: right;"></td>
          <td style="text-align: right;">${formatNumber(invoice.totalConstructionCost)}원</td>
        </tr>
        ${discountRow}
        <tr class="final-row">
          <td colspan="8" style="text-align: right;">최종 견적</td>
          <td style="text-align: right;">${formatNumber(finalAmount)}원</td>
        </tr>
      </tbody>
    </table>

    <div class="footer">
      <div class="note">
        ※ VAT 별도<br>
        ※ 본 견적서는 참고용이며, 실제 시공 시 현장 조건에 따라 변경될 수 있습니다.
      </div>
      <p style="margin-top: 15px;">필름 재단 계산기 | ${new Date().toLocaleString('ko-KR')}</p>
    </div>
  </div>
</body>
</html>
  `;
}

/**
 * 견적서를 PDF 파일로 생성하고 공유
 */
export async function shareEstimatePDF(
  invoice: Invoice,
  projectName: string,
  constructionPrice: number,
  companyInfo?: { companyName?: string; managerName?: string; phone?: string; email?: string; address?: string; note?: string },
): Promise<void> {
  try {
    // 공유 가능 여부 확인
    const isAvailable = await Sharing.isAvailableAsync();
    if (!isAvailable) {
      throw new Error('이 기기에서는 파일 공유가 지원되지 않습니다.');
    }

    // HTML 생성
    const html = generateEstimateHTML(invoice, projectName, constructionPrice, companyInfo);

    // HTML을 PDF로 변환
    const { uri } = await Print.printToFileAsync({ html });

    // 파일명 생성
    const timestamp = new Date().getTime();
    const fileName = `견적서_${projectName}_${timestamp}.pdf`;
    const pdfPath = `${FileSystem.documentDirectory ?? ''}${fileName}`;

    // 임시 캐시 파일을 문서 디렉토리로 이동 (영구 저장)
    await FileSystem.moveAsync({
      from: uri,
      to: pdfPath,
    });

    // PDF 공유
    await Sharing.shareAsync(pdfPath, {
      mimeType: 'application/pdf',
      dialogTitle: '견적서 공유',
    });
  } catch (error) {
    console.error('견적서 PDF 공유 오류:', error);
    throw error;
  }
}

// ─── 재단 배치도 색상 팔레트 (cutting.tsx와 동일) ─────────────────────────
const SIZE_FILL_COLORS = [
  '#BFDBFE', '#BBF7D0', '#FDE68A', '#FBCFE8', '#DDD6FE',
  '#FED7AA', '#A5F3FC', '#D9F99D', '#FECACA', '#E9D5FF',
  '#CFFAFE', '#FEF08A',
];
const SIZE_STROKE_COLORS = [
  '#2563EB', '#059669', '#D97706', '#DB2777', '#7C3AED',
  '#EA580C', '#0891B2', '#65A30D', '#DC2626', '#9333EA',
  '#0E7490', '#CA8A04',
];

function buildSizeColorMapForPdf(pieces: PlacedPiece[]): Map<string, number> {
  const map = new Map<string, number>();
  let counter = 0;
  for (const p of pieces) {
    const key = `${p.width}x${p.height}`;
    if (!map.has(key)) {
      map.set(key, counter % SIZE_FILL_COLORS.length);
      counter++;
    }
  }
  return map;
}

/**
 * 단일 그룹의 배치도 SVG HTML 문자열 생성
 */
function generatePlacementSvgHtml(
  gr: GroupPlacementResult,
  projectName: string,
  pageIndex: number,
  totalPages: number,
): string {
  const { placement, groupName, brand, filmName, filmLengthM } = gr;
  const pieces = placement.pieces;
  const filmW = placement.filmWidth;   // mm
  const filmH = placement.filmHeight;  // mm

  // A4 가로 기준 SVG 크기 계산 (필름 비율 유지)
  // A4 가로: 297mm, 세로: 210mm → 포인트 기준 842 x 595
  // SVG 뷰포트: 가로 760px 기준으로 스케일 계산
  const svgViewW = 760;
  const scale = svgViewW / filmW;
  const svgViewH = Math.round(filmH * scale);

  const sizeColorMap = buildSizeColorMapForPdf(pieces);

  // 모눈 선 생성 (100mm 간격)
  const gridLines: string[] = [];
  const GRID_STEP = 100;
  for (let x = 0; x <= filmW; x += GRID_STEP) {
    gridLines.push(`<line x1="${x * scale}" y1="0" x2="${x * scale}" y2="${svgViewH}" stroke="#E5E7EB" stroke-width="0.5"/>`);
    if (x > 0 && x < filmW) {
      gridLines.push(`<text x="${x * scale}" y="-4" font-size="8" fill="#9CA3AF" text-anchor="middle">${x}</text>`);
    }
  }
  for (let y = 0; y <= filmH; y += GRID_STEP) {
    gridLines.push(`<line x1="0" y1="${y * scale}" x2="${svgViewW}" y2="${y * scale}" stroke="#E5E7EB" stroke-width="0.5"/>`);
    if (y > 0) {
      gridLines.push(`<text x="-4" y="${y * scale + 3}" font-size="8" fill="#9CA3AF" text-anchor="end">${y}</text>`);
    }
  }

  // 조각 렌더링
  const pieceRects: string[] = [];
  for (const p of pieces) {
    const sk = `${p.width}x${p.height}`;
    const ci = sizeColorMap.get(sk) ?? 0;
    const fill = SIZE_FILL_COLORS[ci % SIZE_FILL_COLORS.length];
    const stroke = SIZE_STROKE_COLORS[ci % SIZE_STROKE_COLORS.length];
    const px = p.x * scale;
    const py = p.y * scale;
    const pw = p.width * scale;
    const ph = p.height * scale;
    // 조각 사각형
    pieceRects.push(`<rect x="${px}" y="${py}" width="${pw}" height="${ph}" fill="${fill}" stroke="${stroke}" stroke-width="1" rx="2"/>`);
    // 라벨 (조각이 충분히 클 때만)
    if (pw > 30 && ph > 18) {
      const cx = px + pw / 2;
      const label = p.instanceIndex > 0 ? `${p.id}-${p.instanceIndex + 1}` : p.id;
      const sizeLabel = `${p.width}×${p.height}`;
      // 실제 폰트 크기 계산 (cutting.tsx와 동일 로직)
      const idFs = Math.min(24, pw / 2.3, ph / 1.5);
      const szFs = Math.min(19, pw / 3.0, ph / 2.0);
      const showSize = ph > 36; // ph는 이미 scale 적용된 px값
      // 두 줄일 때: 중앙 기준 위아래 배치
      const lineGap = showSize ? (idFs / 2 + szFs / 2 + 3) : 0;
      // SVG text는 baseline 기준이므로 폰트 크기의 ~0.35배를 더해 중앙 정렬
      const idY = py + ph / 2 - (showSize ? lineGap / 2 : 0) + idFs * 0.35;
      const szY = py + ph / 2 + (showSize ? lineGap / 2 : 0) + szFs * 0.35;
      pieceRects.push(`<text x="${cx}" y="${idY}" font-size="${idFs}" fill="${stroke}" text-anchor="middle" font-weight="700">${label}</text>`);
      if (showSize) {
        pieceRects.push(`<text x="${cx}" y="${szY}" font-size="${szFs}" fill="${stroke}" text-anchor="middle" opacity="0.8">${sizeLabel}</text>`);
      }
    }
  }

  // 사이즈별 범례 생성
  const legendEntries: { sizeKey: string; ci: number; count: number }[] = [];
  const sizeCount = new Map<string, number>();
  for (const p of pieces) {
    const sk = `${p.width}x${p.height}`;
    sizeCount.set(sk, (sizeCount.get(sk) ?? 0) + 1);
  }
  for (const [sk, cnt] of sizeCount.entries()) {
    const ci = sizeColorMap.get(sk) ?? 0;
    legendEntries.push({ sizeKey: sk, ci, count: cnt });
  }
  const legendHtml = legendEntries.map((le) => {
    const fill = SIZE_FILL_COLORS[le.ci % SIZE_FILL_COLORS.length];
    const stroke = SIZE_STROKE_COLORS[le.ci % SIZE_STROKE_COLORS.length];
    const [w, h] = le.sizeKey.split('x');
    return `<div class="legend-item"><span class="legend-swatch" style="background:${fill};border-color:${stroke}"></span><span class="legend-label">${w}×${h}mm</span><span class="legend-count">${le.count}개</span></div>`;
  }).join('');

  // 조각 목록 테이블 (ID별 그룹화)
  const pieceMap = new Map<string, { id: string; width: number; height: number; count: number }>();
  for (const p of pieces) {
    if (!pieceMap.has(p.id)) {
      pieceMap.set(p.id, { id: p.id, width: p.width, height: p.height, count: 0 });
    }
    pieceMap.get(p.id)!.count++;
  }
  const pieceTableRows = Array.from(pieceMap.values()).map((item, idx) => {
    const sk = `${item.width}x${item.height}`;
    const ci = sizeColorMap.get(sk) ?? 0;
    const fill = SIZE_FILL_COLORS[ci % SIZE_FILL_COLORS.length];
    const stroke = SIZE_STROKE_COLORS[ci % SIZE_STROKE_COLORS.length];
    return `<tr>
      <td>${idx + 1}</td>
      <td><span style="display:inline-block;width:12px;height:12px;background:${fill};border:1.5px solid ${stroke};border-radius:2px;vertical-align:middle;margin-right:4px"></span>${item.id}</td>
      <td style="text-align:right">${item.width}</td>
      <td style="text-align:right">${item.height}</td>
      <td style="text-align:right">${item.count}</td>
    </tr>`;
  }).join('');

  const dateStr = new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' });
  const filmLabel = [brand, filmName].filter(Boolean).join(' · ');

  return `
<div class="page" style="page-break-after: ${pageIndex < totalPages - 1 ? 'always' : 'auto'}">
  <div class="page-header">
    <div class="page-title">
      <span class="group-badge">${groupName}</span>
      <span class="film-label">${filmLabel}</span>
    </div>
    <div class="page-meta">
      <span>${projectName}</span>
      <span>${dateStr}</span>
      <span>${pageIndex + 1} / ${totalPages}</span>
    </div>
  </div>

  <div class="stats-row">
    <div class="stat-box"><div class="stat-label">필름 너비</div><div class="stat-value">${filmW.toLocaleString()}mm</div></div>
    <div class="stat-box"><div class="stat-label">필름 길이</div><div class="stat-value">${filmLengthM.toFixed(2)}m (${filmH.toLocaleString()}mm)</div></div>
    <div class="stat-box"><div class="stat-label">배치 효율</div><div class="stat-value">${placement.efficiency}%</div></div>
    <div class="stat-box"><div class="stat-label">조각 수</div><div class="stat-value">${pieces.length}개</div></div>
  </div>

  <div class="canvas-wrap">
    <svg xmlns="http://www.w3.org/2000/svg" width="${svgViewW}" height="${svgViewH}" viewBox="0 0 ${svgViewW} ${svgViewH}" style="border:1.5px solid #374151;display:block">
      <rect width="${svgViewW}" height="${svgViewH}" fill="#F9FAFB"/>
      <g>${gridLines.join('')}</g>
      <g>${pieceRects.join('')}</g>
      <!-- 필름 경계선 -->
      <rect x="0" y="0" width="${svgViewW}" height="${svgViewH}" fill="none" stroke="#374151" stroke-width="2"/>
      <!-- 상단 치수 표시 -->
      <text x="${svgViewW / 2}" y="-14" font-size="10" fill="#374151" text-anchor="middle" font-weight="600">← ${filmW.toLocaleString()}mm →</text>
      <!-- 좌측 치수 표시 -->
      <text x="-12" y="${svgViewH / 2}" font-size="10" fill="#374151" text-anchor="middle" transform="rotate(-90,-12,${svgViewH / 2})">${filmH.toLocaleString()}mm</text>
    </svg>
  </div>

  <div class="legend-section">
    <div class="legend-title">사이즈별 범례</div>
    <div class="legend-grid">${legendHtml}</div>
  </div>

  <div class="piece-table-section">
    <div class="section-title">조각 목록</div>
    <table class="piece-table">
      <thead><tr><th>#</th><th>ID</th><th>가로(mm)</th><th>세로(mm)</th><th>수량</th></tr></thead>
      <tbody>${pieceTableRows}</tbody>
    </table>
  </div>
</div>
`;
}

/**
 * 전체 그룹의 배치도 HTML 생성 (PDF 변환용)
 */
export function generateCuttingLayoutHTML(
  groupResults: GroupPlacementResult[],
  projectName: string = '배치도',
): string {
  const pages = groupResults.map((gr, idx) =>
    generatePlacementSvgHtml(gr, projectName, idx, groupResults.length)
  ).join('');

  return `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>재단 배치도 - ${projectName}</title>
<style>
  @page { size: A4 landscape; margin: 15mm 12mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; font-family: 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif; }
  body { background: white; color: #111827; font-size: 12px; }
  .page { padding: 0; margin-bottom: 0; }
  .page-header { display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 10px; border-bottom: 2px solid #1D4ED8; padding-bottom: 6px; }
  .page-title { display: flex; align-items: center; gap: 8px; }
  .group-badge { background: #1D4ED8; color: white; padding: 3px 10px; border-radius: 12px; font-size: 14px; font-weight: 700; }
  .film-label { font-size: 13px; color: #374151; font-weight: 600; }
  .page-meta { display: flex; gap: 12px; font-size: 10px; color: #6B7280; }
  .stats-row { display: flex; gap: 8px; margin-bottom: 10px; }
  .stat-box { flex: 1; background: #F3F4F6; border-radius: 6px; padding: 6px 10px; }
  .stat-label { font-size: 9px; color: #6B7280; margin-bottom: 2px; }
  .stat-value { font-size: 12px; font-weight: 700; color: #111827; }
  .canvas-wrap { overflow: visible; margin-bottom: 10px; padding-top: 20px; padding-left: 20px; }
  .legend-section { margin-bottom: 10px; }
  .legend-title, .section-title { font-size: 11px; font-weight: 700; color: #374151; margin-bottom: 6px; }
  .legend-grid { display: flex; flex-wrap: wrap; gap: 6px; }
  .legend-item { display: flex; align-items: center; gap: 4px; font-size: 10px; }
  .legend-swatch { display: inline-block; width: 14px; height: 14px; border-radius: 3px; border-width: 1.5px; border-style: solid; flex-shrink: 0; }
  .legend-label { color: #111827; font-weight: 600; }
  .legend-count { color: #6B7280; }
  .piece-table-section { }
  .piece-table { width: 100%; border-collapse: collapse; font-size: 10px; }
  .piece-table th { background: #F3F4F6; padding: 4px 8px; text-align: left; border: 1px solid #E5E7EB; font-weight: 700; }
  .piece-table td { padding: 3px 8px; border: 1px solid #E5E7EB; }
  .piece-table tr:nth-child(even) td { background: #F9FAFB; }
</style>
</head>
<body>
${pages}
</body>
</html>`;
}

/**
 * 재단 배치도를 PDF로 내보내기 (네이티브: expo-print + expo-sharing, 웹: 새 창 인쇄)
 */
export async function exportCuttingLayoutPDF(
  groupResults: GroupPlacementResult[],
  projectName: string = '배치도',
): Promise<void> {
  const html = generateCuttingLayoutHTML(groupResults, projectName);

  if (Platform.OS === 'web') {
    // 웹: 숨겨진 iframe을 이용해 팝업 차단 없이 인쇄
    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = 'none';
    document.body.appendChild(iframe);
    const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
    if (!iframeDoc) {
      document.body.removeChild(iframe);
      throw new Error('PDF 생성에 실패했습니다.');
    }
    iframeDoc.open();
    iframeDoc.write(html);
    iframeDoc.close();
    // 렌더링 대기 후 인쇄
    setTimeout(() => {
      try {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
      } finally {
        // 인쇄 다이얼로그 닫힌 후 iframe 제거
        setTimeout(() => document.body.removeChild(iframe), 1000);
      }
    }, 800);
    return;
  }

  // 네이티브: expo-print → expo-sharing
  const isAvailable = await Sharing.isAvailableAsync();
  if (!isAvailable) throw new Error('이 기기에서는 파일 공유가 지원되지 않습니다.');

  const { uri } = await Print.printToFileAsync({ html, base64: false });
  const timestamp = new Date().getTime();
  const fileName = `재단배치도_${projectName}_${timestamp}.pdf`;
  const pdfPath = `${FileSystem.documentDirectory ?? ''}${fileName}`;
  await FileSystem.moveAsync({ from: uri, to: pdfPath });
  await Sharing.shareAsync(pdfPath, { mimeType: 'application/pdf', dialogTitle: '재단 배치도 공유' });
}

/**
 * 배치도 정보를 텍스트로 생성
 */
export async function generatePlacementPDF(
  placement: PlacementResult,
  groupName: string,
  projectName: string = '배치도',
): Promise<string> {
  const lines: string[] = [];
  
  // 헤더
  lines.push(`배치도 - ${groupName}`);
  lines.push(`프로젝트: ${projectName}`);
  lines.push(`작성일: ${new Date().toLocaleDateString('ko-KR')}`);
  lines.push('');
  
  // 배치 정보
  lines.push('=== 배치 정보 ===');
  lines.push(`필름 높이: ${placement.filmHeight}mm`);
  lines.push(`필름 너비: 1220mm (고정)`);
  lines.push(`사용 면적: ${placement.usedArea}mm²`);
  lines.push(`총 면적: ${placement.totalArea}mm²`);
  lines.push(`효율: ${((placement.usedArea / placement.totalArea) * 100).toFixed(1)}%`);
  lines.push('');
  
  // 조각 정보
  lines.push('=== 배치된 조각 ===');
  lines.push('ID\t크기(mm)\t위치(mm)\t수량');
  for (const piece of placement.pieces.slice(0, 20)) {
    lines.push(`${piece.id.substring(0, 6)}\t${piece.width}×${piece.height}\t${piece.x},${piece.y}\t${piece.instanceIndex + 1}`);
  }
  if (placement.pieces.length > 20) {
    lines.push(`... 외 ${placement.pieces.length - 20}개`);
  }
  
  const content = lines.join('\n');
  const fileName = `배치도_${groupName}_${new Date().getTime()}.txt`;
  const filePath = `${FileSystem.documentDirectory ?? ''}${fileName}`;

  try {
    await FileSystem.writeAsStringAsync(filePath, content);
    return filePath;
  } catch (error) {
    console.error('배치도 생성 오류:', error);
    throw error;
  }
}
