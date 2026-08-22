import type { FilmRemnant } from '../library/models';
import { optimizeMergedRollLayout, type MergedRollResult } from '../cutting/optimizeMergedRollLayout';
import { planWithRemnants, type RemnantPlan, type RemnantPlanRequest } from './planWithRemnants';

export type GroupedPieceRequest = {
  groupId: string;
  groupName: string;
  pieceId: string;
  pieceName: string;
  mergeGroupId?: string;
  filmName?: string;
  materialCostPerM?: number;
  constructionCostPerM2?: number;
  request: RemnantPlanRequest;
};

export type GroupedPiecePlan = GroupedPieceRequest & {
  plan: RemnantPlan;
  inventoryBefore: FilmRemnant[];
  inventoryAfter: FilmRemnant[];
};

export type MergedGroupPlan = {
  mergeGroupId: string;
  groupNames: string[];
  pieceCount: number;
  result: MergedRollResult;
};

function applyDelta(inventory: readonly FilmRemnant[], plan: RemnantPlan): FilmRemnant[] {
  const removed = new Set(plan.inventoryDelta.removeIds);
  return [...inventory.filter((item) => !removed.has(item.id)), ...plan.inventoryDelta.add.map((item) => ({ ...item }))];
}

/** Plans every piece in group order, carrying remnant inventory forward between pieces. */
export function planGroupedPieces(requests: readonly GroupedPieceRequest[], inventory: readonly FilmRemnant[]): GroupedPiecePlan[] {
  let working = inventory.map((item) => ({ ...item }));
  return requests.map((entry) => {
    const before = working.map((item) => ({ ...item }));
    const plan = planWithRemnants({ ...entry.request, remnants: before });
    working = applyDelta(before, plan);
    return { ...entry, plan, inventoryBefore: before, inventoryAfter: working.map((item) => ({ ...item })) };
  });
}

/** Calculates a mixed-size new-roll layout for each explicitly merged group. */
export function planMergedGroups(requests: readonly GroupedPieceRequest[], rollWidthMm = 1220): MergedGroupPlan[] {
  const buckets = new Map<string, GroupedPieceRequest[]>();
  for (const request of requests) {
    if (!request.mergeGroupId) continue;
    const bucket = buckets.get(request.mergeGroupId) ?? [];
    bucket.push(request);
    buckets.set(request.mergeGroupId, bucket);
  }
  return [...buckets.entries()].filter(([, entries]) => entries.length > 1).map(([mergeGroupId, entries]) => ({
    mergeGroupId,
    groupNames: [...new Set(entries.map((entry) => entry.groupName))],
    pieceCount: entries.reduce((sum, entry) => sum + entry.request.quantity, 0),
    result: optimizeMergedRollLayout({
      rollWidthMm,
      gapMm: entries[0]?.request.gapMm ?? 0,
      sideMarginMm: entries[0]?.request.sideMarginMm ?? 5,
      startEndMarginMm: entries[0]?.request.startEndMarginMm ?? 5,
      pieces: entries.map((entry) => ({ sourceId: `${entry.groupId}-${entry.pieceId}`, widthMm: entry.request.pieceWidthMm, lengthMm: entry.request.pieceLengthMm, quantity: entry.request.quantity, allowRotation: entry.request.allowRotation })),
    }),
  }));
}
