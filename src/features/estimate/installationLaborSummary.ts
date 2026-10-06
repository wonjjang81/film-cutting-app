import type { ProjectEstimate } from './calculateProjectEstimate';

export function installationLaborSummary(estimate: ProjectEstimate): string {
  const lines = estimate.installationLaborLines;
  if (!lines) return '';
  const fmt = (value: number) => value.toLocaleString('ko-KR', { maximumFractionDigits: 6 });
  const selected = lines.flatMap((line) => line.calculation ? [line.calculation] : []);
  const allocated = selected.reduce((sum, line) => sum + line.allocatedUnits, 0);
  const length = selected.reduce((sum, line) => sum + line.lengthM, 0);
  return [
    `[부위별 품수 · ${estimate.installationMode === 'standalone' ? '단독시공' : '전체시공'}]`,
    '할당품수 = 적용 길이(m) × 평균 기준 품수 ÷ 기준 물량(m); 인건비 = 품수 × 250,000원',
    '단독시공: 전체 합산 인건비에 최소 0.5품(125,000원)을 한 번만 적용 (할인 전)',
    `선택 부위 할당 ${fmt(allocated)}품 · ${fmt(length > 0 ? allocated / length : 0)}품/m · 전체 청구 ${fmt(estimate.constructionCost / 250000)}품`,
    ...lines.map((line) => `${line.subgroupName} · ${line.part ?? '미선택'}: ${line.calculation?.formula ?? '기존 단가 적용'} = ${line.constructionCost.toLocaleString('ko-KR')}원${line.calculation?.unavailable ? ' (단독불가)' : ''}`),
    '샷시 실리콘 재코킹 및 현장 예비 0.5~1품은 별도이며 자동 가산하지 않습니다.',
  ].join('\n');
}
