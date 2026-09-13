import { describe, expect, it } from 'vitest';

import { createPlanningPreviewHtml } from './createPlanningPreviewHtml';

describe('createPlanningPreviewHtml', () => {
  it('creates a self-contained printable document with summary and trusted layouts', () => {
    const html = createPlanningPreviewHtml({
      title: '배치 미리보기 PDF', generatedAt: '2026-09-13 19:30', pieceCount: 3, producedQuantity: 7, newRollLengthMm: 2750,
      sections: [{ title: '대그룹 1', detail: '1,220×2,750mm · 7개', layoutSvg: '<svg><rect /></svg>' }],
    });
    expect(html).toContain('@page { size: A4 portrait');
    expect(html).toContain('계산 조각');
    expect(html).toContain('2,750mm');
    expect(html).toContain('<svg><rect /></svg>');
    expect(html).not.toMatch(/<script|https?:\/\//i);
  });

  it('escapes document text and retains a safe empty-layout fallback', () => {
    const html = createPlanningPreviewHtml({ title: '<제목>', generatedAt: 'now', pieceCount: 0, producedQuantity: 0, newRollLengthMm: 0, sections: [{ title: 'A&B', detail: '"상세"', layoutSvg: '' }] });
    expect(html).toContain('&lt;제목&gt;');
    expect(html).toContain('A&amp;B');
    expect(html).toContain('&quot;상세&quot;');
    expect(html).toContain('배치 도면이 없습니다.');
  });
});
