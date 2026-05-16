import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as Print from 'expo-print';
import { Invoice, PlacementResult } from '@/lib/filmCutting';
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
