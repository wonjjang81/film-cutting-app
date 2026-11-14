import type { ProjectEstimate } from './calculateProjectEstimate';
import { buildEstimateGroupBreakdown, majorGroupEstimateLabel } from './estimateBreakdownModel';

export type ExtraKind = 'auxiliary' | 'preparation' | 'misc' | 'expense';
export type ExtraEstimateItem = { id: string; kind: ExtraKind; name: string; unit: string; quantity: string; rate: string; included: boolean };
export const extraKindLabel = { auxiliary: '부자재비', preparation: '기초작업', misc: '기타잡비', expense: '경비' } as const;
export const EXPENSE_RATES = [9, 10, 11, 12, 13, 14] as const;
export type ExpenseRate = typeof EXPENSE_RATES[number];
export const DEFAULT_EXPENSE_RATE: ExpenseRate = 9;
export const extraEstimateHint = '기존 견적에 포함된 항목은 추가 청구하지 않습니다. 할인은 기존 견적에만 적용하고, 경비는 할인 반영 후 계산합니다.';
export const expenseLabel = '회사 마진·운송비 등';
const number = (value: number) => value.toLocaleString('ko-KR', { maximumFractionDigits: 4 });
export const estimateWon = (value: number) => `${number(value)}원`;

export function parseExtraEstimateItems(raw: string | null): ExtraEstimateItem[] {
  if (!raw) return [];
  const rows: unknown = JSON.parse(raw);
  if (!Array.isArray(rows) || !rows.every(row => row && Object.hasOwn(extraKindLabel, row.kind) && typeof row.included === 'boolean'
    && ['id', 'name', 'unit', 'quantity', 'rate'].every(field => typeof row[field] === 'string'))
    || new Set(rows.map(row => row.id)).size !== rows.length) throw new Error('견적 추가 항목을 읽을 수 없습니다.');
  return rows.map((row: ExtraEstimateItem) => row.kind === 'auxiliary' && ['퍼티', '프라이머'].includes(row.name.trim()) ? { ...row, kind: 'misc' } : row);
}

export function parseDetailedEstimateDraft(raw: string | null): { items: ExtraEstimateItem[]; expenseRate: ExpenseRate } {
  const value = raw ? JSON.parse(raw) : null;
  if (value === null || Array.isArray(value)) return { items: parseExtraEstimateItems(raw), expenseRate: DEFAULT_EXPENSE_RATE };
  if (!Array.isArray(value.items) || !EXPENSE_RATES.includes(value.expenseRate)) throw new Error('견적 추가 항목을 읽을 수 없습니다.');
  return { items: parseExtraEstimateItems(JSON.stringify(value.items)), expenseRate: value.expenseRate };
}

/** Percentage of the final amount, not a markup percentage on the preceding subtotal. */
export function expenseForNet(net: number, rate: ExpenseRate): number {
  return Math.round(net * (rate / (100 - rate)));
}

function decimal(text: string): number | null {
  if (!/^\d+(?:\.\d+)?$/.test(text.trim())) return null;
  const amount = Number(text);
  return Number.isFinite(amount) ? amount : null;
}

export function priceExtraEstimateItem(item: ExtraEstimateItem) {
  const quantity = decimal(item.quantity);
  const rate = decimal(item.rate);
  const amount = quantity !== null && rate !== null ? Math.round(quantity * rate) : NaN;
  const valid = Boolean(item.name.trim()) && (item.included || Number.isSafeInteger(amount));
  return { ...item, valid, amount: valid && !item.included ? amount : 0,
    basis: item.included ? '기존 견적에 포함' : valid ? `${number(quantity!)}${item.unit.trim() || '식'} × ${estimateWon(rate!)}` : '항목명·수량·단가 확인' };
}

export function buildDetailedFilmEstimate(estimate: ProjectEstimate, items: readonly ExtraEstimateItem[], expenseRate: ExpenseRate = DEFAULT_EXPENSE_RATE) {
  const sources = [...estimate.jobs, ...estimate.mergedJobs.flatMap(line => line.sourceDetails ?? [])];
  const films = new Map<string, { name: string; length: number; rate: number; amount: number }>();
  for (const { job, estimate: amount, rates } of sources) {
    const name = [job.groupId && majorGroupEstimateLabel(job.groupId), job.brand, job.productNumber, job.filmName].filter(Boolean).join(' · ') || '필름 원단';
    const key = JSON.stringify([name, rates.materialCostPerM]);
    const row = films.get(key) ?? { name, length: 0, rate: rates.materialCostPerM, amount: 0 };
    row.length += amount.materialLengthM;
    row.amount += amount.materialCost;
    films.set(key, row);
  }
  const supplements = new Map<string, Map<string, number>>();
  for (const line of estimate.installationLaborLines ?? []) {
    if (!line.minimumSupplement) continue;
    const group = supplements.get(line.groupId) ?? new Map<string, number>();
    group.set(line.subgroupName, (group.get(line.subgroupName) ?? 0) + line.minimumSupplement);
    supplements.set(line.groupId, group);
  }
  const labor = buildEstimateGroupBreakdown(estimate).flatMap(group => group.subgroups.map(sub => {
    const line = estimate.installationLaborLines?.find(line => line.groupId === group.id && line.subgroupName === sub.name);
    const calculation = line?.calculation;
    return {
      name: `${group.label} · ${sub.name}`,
      basis: [
        line?.workloadMinutes !== undefined ? `부착 ${number(line.workloadMinutes)}인분`
          : calculation ? `시공품수 ${number(calculation.allocatedUnits)}품`
          : sub.installationAreaM2 !== undefined ? `부착 면적 ${number(sub.installationAreaM2)}m²`
          : `원단 ${number(sub.amounts.materialLengthM)}m · 사용 면적 ${number(sub.amounts.materialAreaM2)}m²`,
        sub.laborDescription || '기존 시공 단가',
      ].join(' · '),
      amount: sub.amounts.constructionCost - (supplements.get(group.id)?.get(sub.name) ?? 0),
    };
  }));
  const minimum = (estimate.installationLaborLines ?? []).reduce((sum,line) => sum + (line.minimumSupplement ?? 0), 0);
  if (minimum > 0) labor.push({ name: '단독시공 최소 품수 보정', basis: '전체 합산 인건비에 한 번 적용', amount: minimum });
  // Preserve old manual expense inputs for reference, but do not charge them in addition to the percentage.
  const extras = items.filter(row => row.kind !== 'expense').map(priceExtraEstimateItem);
  const legacyExpenses = items.filter(row => row.kind === 'expense').map(priceExtraEstimateItem);
  const auxiliary = extras.filter(row => row.kind === 'auxiliary').reduce((sum,row) => sum + row.amount, 0);
  const preparation = extras.filter(row => row.kind === 'preparation').reduce((sum,row) => sum + row.amount, 0);
  const misc = extras.filter(row => row.kind === 'misc').reduce((sum,row) => sum + row.amount, 0);
  const directExtras = auxiliary + preparation + misc;
  const netBeforeExpense = estimate.total + directExtras;
  const expense = expenseForNet(netBeforeExpense, expenseRate);
  const additionalCost = directExtras + expense;
  const withExpense = (net: number) => net + directExtras + expenseForNet(net + directExtras, expenseRate);
  const totalRange = { min: withExpense(estimate.totalRange.min), max: withExpense(estimate.totalRange.max) };
  const valid = extras.every(row => row.valid) && Number.isSafeInteger(estimate.subtotal + additionalCost);
  return { films: [...films.values()], labor, extras, legacyExpenses, auxiliary, preparation, misc, expense, expenseRate, netBeforeExpense, totalRange, valid,
    materialCost: estimate.materialCost + auxiliary, constructionCost: estimate.constructionCost + preparation,
    subtotal: estimate.subtotal + additionalCost, total: estimate.total + additionalCost };
}

export type DetailedFilmEstimate = ReturnType<typeof buildDetailedFilmEstimate>;
export function filmEstimateCategories(detail: DetailedFilmEstimate) {
  return [
    { id: 'labor', name: '인건비', amount: detail.constructionCost },
    { id: 'material', name: '자재비', amount: detail.materialCost },
    { id: 'misc', name: '기타잡비', amount: detail.misc },
    { id: 'expense', name: '경비', amount: detail.expense },
  ] as const;
}

export function detailedFilmEstimateText(detail: DetailedFilmEstimate): string {
  const extras = (kind: ExtraKind) => detail.extras.filter(row => row.kind === kind).map(row =>
    `${row.name} · ${row.basis} · ${row.included ? '추가 청구 없음' : estimateWon(row.amount)}`);
  return [
    `[인건비] ${estimateWon(detail.constructionCost)}`,
    `기초작업 소계 ${estimateWon(detail.preparation)}`, ...extras('preparation'),
    `필름부착 소계 ${estimateWon(detail.constructionCost - detail.preparation)}`, ...detail.labor.map(row => `${row.name} · ${row.basis} · ${estimateWon(row.amount)}`),
    `[자재비] ${estimateWon(detail.materialCost)}`,
    `주자재비 소계 ${estimateWon(detail.materialCost - detail.auxiliary)}`, ...detail.films.map(row => `${row.name} · ${number(row.length)}m × ${estimateWon(row.rate)}/m · ${estimateWon(row.amount)}`),
    `부자재비 소계 ${estimateWon(detail.auxiliary)}`, ...extras('auxiliary'),
    `[기타잡비] ${estimateWon(detail.misc)}`, ...extras('misc'),
    `[경비] ${estimateWon(detail.expense)} · ${expenseLabel} · 최종 견적액의 ${detail.expenseRate}%`,
    extraEstimateHint,
  ].join('\n');
}
