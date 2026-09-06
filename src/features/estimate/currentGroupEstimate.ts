import { buildSavedCuttingJob } from '../library/uiWorkflowHelpers';
import type { SavedCuttingJob, SavedMergedCuttingJob } from '../library/models';
import { AUTO_MERGE_GROUP_ID, planGroupedPieces, planMergedGroups, type GroupedPiecePlan, type GroupedPieceRequest, type MergedGroupPlan } from '../remnants/planGroupedPieces';
import type { CuttingFormState } from '../library/uiWorkflowHelpers';
import { subgroupPieceDisplayName } from '../library/subgroupCards';
import { normalizeDifficulty, type ConstructionDifficulty } from './difficultyPricing';

export const CURRENT_GROUP_ESTIMATE_STORAGE_KEY = 'film-cutting-current-group-estimate';

export type CurrentEstimateGroupSource = {
  id: string;
  name: string;
  mergeGroupId?: string;
  filmName?: string;
  materialCostPerM?: string;
  constructionCostPerM2?: string;
  subgroups?: { id: string; name: string; pieceIds: string[]; expanded?: boolean; difficulty?: ConstructionDifficulty }[];
  pieces: { id: string; name: string; form: CuttingFormState }[];
};

export type CurrentEstimateSnapshot = { pieces: CurrentEstimateGroupSource[] };
export type CurrentEstimatePlan = {
  groupedPlans: GroupedPiecePlan[];
  mergedPlans: MergedGroupPlan[];
  pieceNamesBySourceId: Record<string, string>;
  subgroupNamesBySourceId: Record<string, string>;
};

export function createCurrentEstimateSnapshot(groups: readonly CurrentEstimateGroupSource[]): CurrentEstimateSnapshot {
  return { pieces: groups.map((group) => ({ ...group, pieces: group.pieces.map((piece) => ({ ...piece, form: { ...piece.form } })) })) };
}

export function parseCurrentEstimateSnapshot(raw: string | null): CurrentEstimateSnapshot | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<CurrentEstimateSnapshot>;
    if (!Array.isArray(parsed.pieces) || parsed.pieces.length === 0) return null;
    const validGroups = parsed.pieces.filter((group): group is CurrentEstimateGroupSource => Boolean(group && typeof group.id === 'string' && typeof group.name === 'string' && Array.isArray(group.pieces)));
    return validGroups.length > 0 ? { pieces: validGroups } : null;
  } catch {
    return null;
  }
}

function optionalCost(value: string | undefined): number | undefined {
  if (value === undefined || value.trim() === '') return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

export function requestsFromSnapshot(snapshot: CurrentEstimateSnapshot): GroupedPieceRequest[] {
  return snapshot.pieces.flatMap((group) => group.pieces.map((piece) => {
    const subgroup = group.subgroups?.find((candidate) => candidate.pieceIds.includes(piece.id));
    return ({
    groupId: group.id,
    groupName: group.name,
    pieceId: piece.id,
    pieceName: displayPieceName(group, piece),
    mergeGroupId: group.mergeGroupId ?? AUTO_MERGE_GROUP_ID,
    filmName: group.filmName,
    subgroupName: subgroup?.name,
    difficulty: subgroup ? normalizeDifficulty(subgroup.difficulty) : undefined,
    materialCostPerM: optionalCost(group.materialCostPerM),
    constructionCostPerM2: optionalCost(group.constructionCostPerM2),
    request: {
      brand: piece.form.brand,
      productNumber: piece.form.productNumber,
      rollWidthMm: 1_220,
      pieceWidthMm: Number(piece.form.pieceWidth),
      pieceLengthMm: Number(piece.form.pieceLength),
      quantity: Number(piece.form.quantity),
      gapMm: Number(piece.form.gap),
      sideMarginMm: Number(piece.form.sideMargin),
      startEndMarginMm: Number(piece.form.startEndMargin),
      allowRotation: piece.form.allowRotation,
      remnants: [],
    },
    });
  }));
}

function displayPieceName(group: CurrentEstimateGroupSource, piece: CurrentEstimateGroupSource['pieces'][number]): string {
  const subgroup = group.subgroups?.find((candidate) => candidate.pieceIds.includes(piece.id));
  return subgroup ? subgroupPieceDisplayName(group.name, subgroup.name, piece.id) : piece.name;
}

/** Calculates the current input layout details without writing project history. */
export function calculateCurrentGroupPlan(snapshot: CurrentEstimateSnapshot): CurrentEstimatePlan {
  const requests = requestsFromSnapshot(snapshot).filter(({ request }) => Number.isFinite(request.pieceWidthMm) && request.pieceWidthMm > 0
    && Number.isFinite(request.pieceLengthMm) && request.pieceLengthMm > 0
    && Number.isInteger(request.quantity) && request.quantity > 0);
  const pieceNamesBySourceId = Object.fromEntries(requests.map((request) => [`${request.groupId}-${request.pieceId}`, request.pieceName]));
  const subgroupNamesBySourceId = Object.fromEntries(snapshot.pieces.flatMap((group) => (group.subgroups ?? []).flatMap((subgroup) => subgroup.pieceIds.map((pieceId) => [`${group.id}-${pieceId}`, subgroup.name] as const))));
  if (requests.length === 0) return { groupedPlans: [], mergedPlans: [], pieceNamesBySourceId: {}, subgroupNamesBySourceId: {} };
  return { groupedPlans: planGroupedPieces(requests, []), mergedPlans: planMergedGroups(requests, 1_220, [], false), pieceNamesBySourceId, subgroupNamesBySourceId };
}

/** Calculates the current input groups in memory; it never writes project history. */
export function calculateCurrentGroupEstimate(snapshot: CurrentEstimateSnapshot): { jobs: SavedCuttingJob[]; mergedJobs: SavedMergedCuttingJob[] } {
  const { groupedPlans: planned, mergedPlans: merged } = calculateCurrentGroupPlan(snapshot);
  if (planned.length === 0) return { jobs: [], mergedJobs: [] };
  const jobs = planned.map((entry, index) => buildSavedCuttingJob({
    id: `current-estimate-${entry.groupId}-${entry.pieceId}-${index}`,
    name: `${entry.groupName} · ${entry.pieceName}`,
    createdAt: new Date(0).toISOString(),
    request: entry.request,
    plan: entry.plan,
    inventory: [],
    filmName: entry.filmName,
    subgroupName: entry.subgroupName,
    difficulty: entry.difficulty,
    materialCostPerM: entry.materialCostPerM,
    constructionCostPerM2: entry.constructionCostPerM2,
  }));
  const jobBySourceId = new Map(planned.map((entry, index) => [`${entry.groupId}-${entry.pieceId}`, jobs[index]!]));
  const mergedJobs = merged.map((entry, index) => ({
    id: `current-estimate-merged-${entry.mergeGroupId}-${index}`,
    name: `병합 ${entry.mergeGroupId} · ${entry.groupNames.join(' + ')}`,
    mergeGroupId: entry.mergeGroupId,
    groupNames: [...entry.groupNames],
    sourceJobIds: entry.sourceIds.map((sourceId) => jobBySourceId.get(sourceId)?.id).filter((id): id is string => Boolean(id)),
    sourceIds: [...entry.sourceIds],
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
    rollWidthMm: 1_220,
    usedLengthMm: entry.result.usedLengthMm,
    producedQuantity: entry.producedQuantity,
    utilizationPercent: entry.result.utilizationPercent,
    wastePercent: entry.result.wastePercent,
    placements: entry.result.placements.map((placement) => ({ ...placement })),
  } satisfies SavedMergedCuttingJob));
  return { jobs, mergedJobs };
}
