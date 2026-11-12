export const CONSTRUCTION_MANAGER_CONTEXT_KEY = 'film-construction-manager-context-v1';

export type ConstructionManagerContext = { canonicalProjectId: string; projectName: string; externalEntityId?: string };

export function parseConstructionManagerContext(value: Partial<ConstructionManagerContext>): ConstructionManagerContext | null {
  const canonicalProjectId = value.canonicalProjectId?.trim() ?? '';
  if (!canonicalProjectId) return null;
  return { canonicalProjectId, projectName: value.projectName?.trim() ?? '', ...(value.externalEntityId?.trim() ? { externalEntityId: value.externalEntityId.trim() } : {}) };
}

/** 건설매니저 자동 견적서용 수량 (원단 사용 m, 시공 면적 ㎡) */
export type FilmEstimateQuantities = { materialLengthM: number; materialAreaM2: number };

const roundOne = (value: number) => Math.round(value * 10) / 10;

export function buildFilmBreakdown(input: { materialCost: number; constructionCost: number; discount: number; quantities?: FilmEstimateQuantities }) {
  if (!input.quantities) return [{ name: '필름 원단', amount: input.materialCost }, { name: '필름 시공', amount: input.constructionCost }];
  const { materialLengthM, materialAreaM2 } = input.quantities;
  const rows: { name: string; amount: number; kind: string; spec?: string; unit?: string; quantity?: number }[] = [];
  if (input.constructionCost > 0) rows.push({ name: '필름 시공', amount: input.constructionCost, kind: 'labor', spec: '필름 시공', ...(materialAreaM2 > 0 ? { unit: '㎡', quantity: roundOne(materialAreaM2) } : {}) });
  if (input.materialCost > 0) rows.push({ name: '필름 원단', amount: input.materialCost, kind: 'mainMaterial', spec: '인테리어 필름', ...(materialLengthM > 0 ? { unit: 'm', quantity: roundOne(materialLengthM) } : {}) });
  if (input.discount > 0) rows.push({ name: '할인', amount: -input.discount, kind: 'discount' });
  return rows;
}

export function buildFilmEstimateSubmission(input: { context: ConstructionManagerContext; externalEntityId: string; sourceUpdatedAt: string; materialCost: number; constructionCost: number; discount: number; total: number; quantities?: FilmEstimateQuantities }) {
  const externalEntityId = (input.context.externalEntityId ?? input.externalEntityId).trim();
  if (!externalEntityId) throw new Error('건설매니저에 연결할 필름 프로젝트 ID가 없습니다.');
  const timestamp = Date.parse(input.sourceUpdatedAt);
  const revision = Number.isFinite(timestamp) && timestamp > 0 ? Math.floor(timestamp) : Date.now();
  if (Math.abs(input.materialCost + input.constructionCost - input.discount - input.total) > 1) throw new Error('필름 견적 합계가 일치하지 않습니다.');
  return {
    schema: 'film-estimate/v1' as const, canonicalProjectId: input.context.canonicalProjectId, externalEntityId, revision,
    idempotencyKey: `film-${revision}`, sourceUpdatedAt: new Date(revision).toISOString(), currency: 'KRW' as const,
    summary: { materialCost: input.materialCost, laborCost: input.constructionCost, otherCost: 0, discount: input.discount, tax: 0, total: input.total },
    breakdown: buildFilmBreakdown(input),
  };
}
