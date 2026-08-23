import { buildSavedCuttingJob } from '../library/uiWorkflowHelpers';
import type { SavedCuttingJob, SavedMergedCuttingJob } from '../library/models';
import { AUTO_MERGE_GROUP_ID, planGroupedPieces, planMergedGroups, type GroupedPieceRequest } from '../remnants/planGroupedPieces';
import type { CuttingFormState } from '../library/uiWorkflowHelpers';

export const CURRENT_GROUP_ESTIMATE_STORAGE_KEY = 'film-cutting-current-group-estimate';

export type CurrentEstimateGroupSource = {
  id: string;
  name: string;
  mergeGroupId?: string;
  filmName?: string;
  materialCostPerM?: string;
  constructionCostPerM2?: string;
  pieces: { id: string; name: string; form: CuttingFormState }[];
};

export type CurrentEstimateSnapshot = { pieces: CurrentEstimateGroupSource[] };

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

function requestsFromSnapshot(snapshot: CurrentEstimateSnapshot): GroupedPieceRequest[] {
  return snapshot.pieces.flatMap((group) => group.pieces.map((piece) => ({
    groupId: group.id,
    groupName: group.name,
    pieceId: piece.id,
    pieceName: piece.name,
    mergeGroupId: group.mergeGroupId ?? AUTO_MERGE_GROUP_ID,
    filmName: group.filmName,
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
  })));
}

/** Calculates the current input groups in memory; it never writes project history. */
export function calculateCurrentGroupEstimate(snapshot: CurrentEstimateSnapshot): { jobs: SavedCuttingJob[]; mergedJobs: SavedMergedCuttingJob[] } {
  const requests = requestsFromSnapshot(snapshot).filter(({ request }) => Number.isFinite(request.pieceWidthMm) && request.pieceWidthMm > 0
    && Number.isFinite(request.pieceLengthMm) && request.pieceLengthMm > 0
    && Number.isInteger(request.quantity) && request.quantity > 0);
  if (requests.length === 0) return { jobs: [], mergedJobs: [] };
  const merged = planMergedGroups(requests, 1_220, [], false);
  const planned = planGroupedPieces(requests, []);
  const jobs = planned.map((entry, index) => buildSavedCuttingJob({
    id: `current-estimate-${entry.groupId}-${entry.pieceId}-${index}`,
    name: `${entry.groupName} · ${entry.pieceName}`,
    createdAt: new Date(0).toISOString(),
    request: entry.request,
    plan: entry.plan,
    inventory: [],
    filmName: entry.filmName,
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
