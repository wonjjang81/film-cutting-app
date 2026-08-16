import { describe, expect, it } from 'vitest';

import type { SavedCuttingJob } from '../library/models';
import { createCsv } from './createCsv';
import { createWorkOrderHtml } from './createWorkOrderHtml';

function job(overrides: Partial<SavedCuttingJob> = {}): SavedCuttingJob {
  return {
    id: 'job-1',
    name: '정밀 재단',
    brand: 'FilmCo',
    productNumber: 'FC-100',
    createdAt: '2026-08-16T00:00:00.000Z',
    updatedAt: '2026-08-16T00:00:00.000Z',
    input: {
      rollWidthMm: 1_000,
      pieceWidthMm: 100,
      pieceLengthMm: 200,
      quantity: 12,
      gapMm: 2.5,
      sideMarginMm: 5,
      startEndMarginMm: 10,
      allowRotation: true,
      maxLengthMm: 2_000,
    },
    remnantIds: ['remnant-a', 'remnant-b'],
    remnantSummary: [
      { id: 'remnant-a', widthMm: 500, lengthMm: 800, quantity: 1 },
      { id: 'remnant-b', widthMm: 300, lengthMm: 400, quantity: 2 },
    ],
    result: {
      newRollLengthMm: 123.45,
      producedQuantity: 13,
      overproduction: 1,
      utilizationPercent: 87.5,
      wastePercent: 12.5,
      optimizationStatus: 'exact',
    },
    ...overrides,
  };
}

describe('createCsv', () => {
  it('emits a BOM-prefixed, CRLF two-column work-order schema with a final newline', () => {
    const csv = createCsv(job());

    expect(csv).toBe(
      '\uFEFF항목,값\r\n'
      + '작업 ID,job-1\r\n'
      + '작업명,정밀 재단\r\n'
      + '생성 시각,2026-08-16T00:00:00.000Z\r\n'
      + '브랜드,FilmCo\r\n'
      + '제품 번호,FC-100\r\n'
      + '원단 폭 (mm),1000\r\n'
      + '제품 폭 (mm),100\r\n'
      + '제품 길이 (mm),200\r\n'
      + '요청 수량,12\r\n'
      + '간격 (mm),2.5\r\n'
      + '좌우 여백 (mm),5\r\n'
      + '시작/끝 여백 (mm),10\r\n'
      + '회전 허용,예\r\n'
      + '최대 길이 (mm),2000\r\n'
      + '사용 자투리 ID,"remnant-a, remnant-b"\r\n'
      + '사용 자투리 요약,remnant-a: 500×800mm × 1; remnant-b: 300×400mm × 2\r\n'
      + '새 원단 길이 (mm),123.45\r\n'
      + '생산 수량,13\r\n'
      + '초과 생산,1\r\n'
      + '수율 (%),87.5\r\n'
      + '손실률 (%),12.5\r\n'
      + '최적화 상태,정확한 최적해\r\n'
      + '물리 하한 길이 (mm),저장되지 않음\r\n'
      + '최적성 격차 (mm),저장되지 않음\r\n',
    );
    expect(csv.replace(/\r\n/g, '')).not.toContain('\n');
  });

  it('quotes RFC-special cells and neutralizes spreadsheet formulas in job text', () => {
    const csv = createCsv(job({
      name: '  =SUM(1,1)\n"quoted"',
      brand: '+brand',
      productNumber: '@item',
      remnantIds: ['-remnant'],
      remnantSummary: [{ id: '=summary', widthMm: 1, lengthMm: 2, quantity: 1 }],
    }));

    expect(csv).toContain('작업명,"\'  =SUM(1,1)\n""quoted"""\r\n');
    expect(csv).toContain("브랜드,'+brand\r\n");
    expect(csv).toContain("제품 번호,'@item\r\n");
    expect(csv).toContain("사용 자투리 ID,'-remnant\r\n");
    expect(csv).toContain("사용 자투리 요약,'=summary: 1×2mm × 1\r\n");
  });

  it('keeps generated negative numbers numeric and handles non-finite numbers defensively', () => {
    const csv = createCsv(job({
      input: { ...job().input, gapMm: -1 },
      result: { ...job().result, newRollLengthMm: Number.NaN },
    }));

    expect(csv).toContain('간격 (mm),-1\r\n');
    expect(csv).toContain('새 원단 길이 (mm),—\r\n');
  });

  it.each([
    ['exact', '정확한 최적해'],
    ['certified', '하한 인증 해'],
    ['approximate', '근사해 (최적 보장 없음)'],
  ] as const)('uses an honest status label for %s results', (optimizationStatus, label) => {
    expect(createCsv(job({ result: { ...job().result, optimizationStatus } }))).toContain(`최적화 상태,${label}\r\n`);
  });
});

describe('createWorkOrderHtml', () => {
  it('renders all work-order content deterministically with Korean semantic print markup', () => {
    const layoutSvg = '<svg role="img" aria-label="배치"><rect width="10" height="20" /></svg>';
    const first = createWorkOrderHtml(job(), layoutSvg);

    expect(first).toBe(createWorkOrderHtml(job(), layoutSvg));
    expect(first).toContain('<html lang="ko">');
    expect(first).toContain('<meta charset="utf-8">');
    expect(first).toContain('@media print');
    expect(first).toContain('<title>필름 재단 작업지시서</title>');
    expect(first).toContain('정밀 재단');
    expect(first).toContain('2026-08-16T00:00:00.000Z');
    expect(first).toContain('1000 mm');
    expect(first).toContain('요청 수량');
    expect(first).toContain('생산 수량');
    expect(first).toContain('remnant-a');
    expect(first).toContain('123.45 mm');
    expect(first).toContain('정확한 최적해');
    expect(first).toContain('물리 하한 길이');
    expect(first).toContain('저장되지 않음');
    expect(first).toContain('<figcaption id="layout-caption">배치 도면</figcaption>');
    expect(first).toContain('범례');
    expect(first).toContain(layoutSvg);
    expect(first).not.toMatch(/<script|https?:\/\/|<link\b/i);
  });

  it('escapes every job-originated HTML string while retaining the trusted SVG seam', () => {
    const html = createWorkOrderHtml(job({
      name: '"name" & \'name\' <name>',
      brand: '<script>alert("x")</script>',
      productNumber: 'A&B',
      remnantIds: ['<id>'],
      remnantSummary: [{ id: '"summary"', widthMm: 1, lengthMm: 2, quantity: 1 }],
    }), '<svg><text>trusted & raw</text></svg>');

    expect(html).toContain('&quot;name&quot; &amp; &#39;name&#39; &lt;name&gt;');
    expect(html).toContain('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;');
    expect(html).toContain('A&amp;B');
    expect(html).toContain('&lt;id&gt;');
    expect(html).toContain('&quot;summary&quot;');
    expect(html).not.toContain('<script>alert');
    expect(html).toContain('<svg><text>trusted & raw</text></svg>');
  });

  it('uses a safe diagram fallback when no SVG is supplied', () => {
    const html = createWorkOrderHtml(job(), '');

    expect(html).toContain('배치 도면이 없습니다.');
    expect(html).not.toContain('<svg');
  });
});
