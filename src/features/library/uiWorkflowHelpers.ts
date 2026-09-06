import type { RemnantPlan, RemnantPlanRequest } from '../remnants/planWithRemnants';
import type { FilmRemnant, SavedCuttingJob } from './models';
import type { ConstructionDifficulty } from '../estimate/difficultyPricing';

export const MAX_ROLL_LENGTH_MM = 25_000;

export type CuttingFormState = {
  brand: string;
  productNumber: string;
  rollWidth: string;
  pieceWidth: string;
  pieceLength: string;
  quantity: string;
  gap: string;
  sideMargin: string;
  startEndMargin: string;
  allowRotation: boolean;
};

function requiredIdentifier(value: string, label: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) throw new Error(`${label}을(를) 입력해 주세요.`);
  return trimmed;
}

/** Maps UI text fields without duplicating the optimizer's numeric validation. */
export function toRemnantPlanRequest(
  form: CuttingFormState,
  remnants: readonly FilmRemnant[],
): RemnantPlanRequest {
  return {
    brand: requiredIdentifier(form.brand, '브랜드'),
    productNumber: form.productNumber.trim(),
    rollWidthMm: Number(form.rollWidth),
    pieceWidthMm: Number(form.pieceWidth),
    pieceLengthMm: Number(form.pieceLength),
    quantity: Number(form.quantity),
    gapMm: Number(form.gap),
    sideMarginMm: Number(form.sideMargin),
    startEndMarginMm: Number(form.startEndMargin),
    allowRotation: form.allowRotation,
    maxLengthMm: MAX_ROLL_LENGTH_MM,
    remnants: remnants.map((remnant) => ({ ...remnant })),
  };
}

export function createUniqueUiId(prefix: string, timestampMs: number, existingIds: readonly string[]): string {
  const base = `${prefix}-${Math.trunc(timestampMs)}`;
  const occupied = new Set(existingIds);
  if (!occupied.has(base)) return base;
  let suffix = 2;
  while (occupied.has(`${base}-${suffix}`)) suffix += 1;
  return `${base}-${suffix}`;
}

function roundPercent(value: number): number {
  return Math.round(value * 100) / 100;
}

function overallStatus(plan: RemnantPlan): SavedCuttingJob['result']['optimizationStatus'] {
  const statuses = [
    ...plan.remnantUses.map((use) => use.result.optimizationStatus),
    ...(plan.newRollResult === null ? [] : [plan.newRollResult.optimizationStatus]),
  ];
  if (statuses.includes('approximate')) return 'approximate';
  if (statuses.includes('certified')) return 'certified';
  return 'exact';
}

export type BuildSavedCuttingJobOptions = {
  id: string;
  name: string;
  groupId?: string;
  createdAt: string;
  request: RemnantPlanRequest;
  plan: RemnantPlan;
  inventory: readonly FilmRemnant[];
  filmName?: string;
  materialCostPerM?: number;
  constructionCostPerM2?: number;
  subgroupName?: string;
  difficulty?: ConstructionDifficulty;
};

/** Builds the storage/export view of a tentative plan without mutating it. */
export function buildSavedCuttingJob({
  id,
  name,
  groupId,
  createdAt,
  request,
  plan,
  inventory,
  filmName,
  materialCostPerM,
  constructionCostPerM2,
  subgroupName,
  difficulty,
}: BuildSavedCuttingJobOptions): SavedCuttingJob {
  const inventoryById = new Map(inventory.map((remnant) => [remnant.id, remnant]));
  const usageCounts = new Map<string, number>();
  const orderedIds: string[] = [];
  let materialAreaMm2 = 0;
  let productAreaMm2 = 0;
  let producedQuantity = 0;

  for (const use of plan.remnantUses) {
    const source = inventoryById.get(use.remnantId);
    if (source === undefined) throw new Error(`사용한 자투리 "${use.remnantId}"의 원본 규격을 찾을 수 없습니다.`);
    if (!usageCounts.has(use.remnantId)) orderedIds.push(use.remnantId);
    usageCounts.set(use.remnantId, (usageCounts.get(use.remnantId) ?? 0) + 1);
    materialAreaMm2 += source.widthMm * use.result.usedLengthMm;
    productAreaMm2 += use.placements.reduce((sum, placement) => sum + placement.width * placement.height, 0);
    producedQuantity += use.producedQuantity;
  }

  if (plan.newRollResult !== null) {
    materialAreaMm2 += request.rollWidthMm * plan.newRollResult.usedLengthMm;
    productAreaMm2 += plan.newRollResult.placements.reduce(
      (sum, placement) => sum + placement.width * placement.height,
      0,
    );
    producedQuantity += plan.newRollResult.producedQuantity;
  }

  const utilizationPercent = materialAreaMm2 > 0
    ? roundPercent((productAreaMm2 / materialAreaMm2) * 100)
    : 0;
  const brand = request.brand.trim();
  const productNumber = request.productNumber.trim();

  return {
    id,
    name: name.trim() || (productNumber ? `${brand} ${productNumber} 작업` : `${brand} 작업`),
    ...(groupId?.trim() ? { groupId: groupId.trim() } : {}),
    brand,
    productNumber,
    ...(filmName?.trim() ? { filmName: filmName.trim() } : {}),
    ...(materialCostPerM === undefined ? {} : { materialCostPerM }),
    ...(constructionCostPerM2 === undefined ? {} : { constructionCostPerM2 }),
    ...(subgroupName?.trim() ? { subgroupName: subgroupName.trim() } : {}),
    ...(difficulty === undefined ? {} : { difficulty }),
    createdAt,
    updatedAt: createdAt,
    input: {
      rollWidthMm: request.rollWidthMm,
      pieceWidthMm: request.pieceWidthMm,
      pieceLengthMm: request.pieceLengthMm,
      quantity: request.quantity,
      gapMm: request.gapMm,
      sideMarginMm: request.sideMarginMm,
      startEndMarginMm: request.startEndMarginMm,
      allowRotation: request.allowRotation,
      maxLengthMm: request.maxLengthMm ?? MAX_ROLL_LENGTH_MM,
    },
    remnantIds: [...orderedIds],
    remnantSummary: orderedIds.map((remnantId) => {
      const source = inventoryById.get(remnantId)!;
      return {
        id: remnantId,
        widthMm: source.widthMm,
        lengthMm: source.lengthMm,
        quantity: usageCounts.get(remnantId)!,
      };
    }),
    result: {
      newRollLengthMm: plan.newRollResult?.usedLengthMm ?? 0,
      producedQuantity,
      overproduction: Math.max(0, producedQuantity - request.quantity),
      utilizationPercent,
      wastePercent: roundPercent(Math.max(0, 100 - utilizationPercent)),
      optimizationStatus: overallStatus(plan),
    },
  };
}
