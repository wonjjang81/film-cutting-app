import type { SavedManualMergedLayout, SavedMergedCuttingJob } from '../library/models';
import type { CurrentEstimateSnapshot } from '../estimate/currentGroupEstimate';
import type { GroupedPieceRequest, MergedGroupPlan } from '../remnants/planGroupedPieces';
import type { MergedPlacement, MergedRollResult } from './optimizeMergedRollLayout';
import { boundedNewRollLength } from './rollLengthLimit';

export const CURRENT_MANUAL_LAYOUT_STORAGE_KEY = 'film-cutting-current-manual-layout-v1';

export function manualLayoutScope(snapshot: CurrentEstimateSnapshot): string {
  return JSON.stringify([snapshot.projectId ?? null, snapshot.pieces.map((group) => [group.id, group.pieces.map((piece) => piece.id)])]);
}

export function serializeCurrentManualLayouts(snapshot: CurrentEstimateSnapshot, layouts: readonly SavedManualMergedLayout[]): string {
  return JSON.stringify({ scope: manualLayoutScope(snapshot), layouts });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isManualLayout(value: unknown): value is SavedManualMergedLayout {
  return isRecord(value) && Number.isInteger(value.planIndex) && typeof value.geometrySignature === 'string'
    && Array.isArray(value.rolls) && value.rolls.every((roll: unknown) => isRecord(roll)
      && Array.isArray(roll.placements) && roll.placements.every((placement: unknown) => isRecord(placement)
        && Number.isInteger(placement.id) && Number.isInteger(placement.sourceIndex)
        && Number.isInteger(placement.instanceIndex) && typeof placement.x === 'number'
        && typeof placement.y === 'number' && typeof placement.width === 'number'
        && typeof placement.height === 'number' && typeof placement.rotated === 'boolean'));
}

export function parseCurrentManualLayouts(raw: string | null, snapshot: CurrentEstimateSnapshot): SavedManualMergedLayout[] {
  if (!raw) return [];
  try {
    const value = JSON.parse(raw) as { scope?: unknown; layouts?: unknown };
    return value.scope === manualLayoutScope(snapshot) && Array.isArray(value.layouts)
      ? value.layouts.filter(isManualLayout) : [];
  } catch { return []; }
}

function sourceId(request: GroupedPieceRequest): string { return `${request.groupId}-${request.pieceId}`; }

export type PlacementIdRecord = { id: number; sourceIndex: number; instanceIndex: number };

export function placementIdRecordsFromPlan(plan: MergedGroupPlan): PlacementIdRecord[] {
  return plan.result.placements.map((placement) => ({
    id: placement.id,
    sourceIndex: plan.sourceIds.indexOf(placement.sourceId),
    instanceIndex: placement.instanceIndex,
  }));
}

export function placementIdRecordsFromManualLayout(layout: SavedManualMergedLayout): PlacementIdRecord[] {
  return layout.rolls.flatMap((roll) => roll.placements.map(({ id, sourceIndex, instanceIndex }) => ({ id, sourceIndex, instanceIndex })));
}

export function placementIdRecordsFromMergedJob(job: SavedMergedCuttingJob): PlacementIdRecord[] {
  const sourceIds = job.sourceIds?.length ? job.sourceIds : [...new Set(job.placements.map((placement) => placement.sourceId))];
  return job.placements.map((placement) => ({
    id: placement.id,
    sourceIndex: sourceIds.indexOf(placement.sourceId),
    instanceIndex: placement.instanceIndex,
  }));
}

/** Reuses persisted IDs by source order and instance while leaving optimized geometry untouched. */
export function applyPlacementIdRecords(plan: MergedGroupPlan, records: readonly PlacementIdRecord[]): MergedGroupPlan | null {
  if (records.length !== plan.result.placements.length) return null;
  const key = (sourceIndex: number, instanceIndex: number) => `${sourceIndex}:${instanceIndex}`;
  const idByIdentity = new Map(records.map((record) => [key(record.sourceIndex, record.instanceIndex), record.id]));
  const ids = [...idByIdentity.values()];
  if (idByIdentity.size !== records.length || new Set(ids).size !== ids.length || ids.some((id) => !Number.isInteger(id) || id <= 0)) return null;
  const remap = (placement: MergedPlacement): MergedPlacement | null => {
    const id = idByIdentity.get(key(plan.sourceIds.indexOf(placement.sourceId), placement.instanceIndex));
    return id === undefined ? null : { ...placement, id };
  };
  const rollResults = (plan.rollResults?.length ? plan.rollResults : [plan.result]).map((roll) => {
    const placements = roll.placements.map(remap);
    return placements.some((placement) => placement === null) ? null : { ...roll, placements: placements as MergedPlacement[] };
  });
  if (rollResults.some((roll) => roll === null)) return null;
  const combined = plan.result.placements.map(remap);
  if (combined.some((placement) => placement === null)) return null;
  return { ...plan, rollResults: rollResults as MergedRollResult[], result: { ...plan.result, placements: combined as MergedPlacement[] } };
}

/** Ignores generated group IDs and coordinates, but detects changes to pieces and cutting constraints. */
export function mergedLayoutGeometrySignature(plan: MergedGroupPlan, requests: readonly GroupedPieceRequest[]): string {
  const requestBySource = new Map(requests.map((request) => [sourceId(request), request]));
  return JSON.stringify(plan.result.placements.map((placement) => {
    const request = requestBySource.get(placement.sourceId)?.request;
    return [plan.sourceIds.indexOf(placement.sourceId), placement.instanceIndex,
      request?.pieceWidthMm, request?.pieceLengthMm, request?.rollWidthMm, request?.gapMm,
      request?.sideMarginMm, request?.startEndMarginMm, request?.allowRotation, request?.maxLengthMm ?? null];
  }).sort((left, right) => Number(left[0]) - Number(right[0]) || Number(left[1]) - Number(right[1])));
}

export function captureManualMergedLayout(plan: MergedGroupPlan, planIndex: number, requests: readonly GroupedPieceRequest[]): SavedManualMergedLayout {
  return {
    planIndex,
    geometrySignature: mergedLayoutGeometrySignature(plan, requests),
    rolls: (plan.rollResults?.length ? plan.rollResults : [plan.result]).map((roll) => ({
      placements: roll.placements.map(({ id, sourceId: placementSourceId, instanceIndex, x, y, width, height, rotated }) => ({
        id, sourceIndex: plan.sourceIds.indexOf(placementSourceId), instanceIndex, x, y, width, height, rotated,
      })),
    })),
  };
}

function overlaps(left: MergedPlacement, right: MergedPlacement, gapMm: number): boolean {
  return left.x < right.x + right.width + gapMm && left.x + left.width + gapMm > right.x
    && left.y < right.y + right.height + gapMm && left.y + left.height + gapMm > right.y;
}

function rollMetrics(placements: MergedPlacement[], rollWidthMm: number, endMarginMm: number): MergedRollResult {
  const usedLengthMm = Math.max(...placements.map((item) => item.y + item.height)) + endMarginMm;
  const area = placements.reduce((sum, item) => sum + item.width * item.height, 0);
  const utilizationPercent = Math.round(area / (rollWidthMm * usedLengthMm) * 1_000) / 10;
  return { placements, usedLengthMm, producedQuantity: placements.length, utilizationPercent, wastePercent: Math.round((100 - utilizationPercent) * 10) / 10 };
}

/** A saved layout is applied only when every source piece and roll still passes current constraints. */
export function restoreManualMergedLayout(
  plan: MergedGroupPlan,
  planIndex: number,
  requests: readonly GroupedPieceRequest[],
  saved: SavedManualMergedLayout,
): MergedGroupPlan | null {
  if (saved.planIndex !== planIndex || saved.geometrySignature !== mergedLayoutGeometrySignature(plan, requests)
    || !saved.rolls.length) return null;
  const identity = (sourceIndex: number, instanceIndex: number) => `${sourceIndex}:${instanceIndex}`;
  const basePlacements = new Map(plan.result.placements.map((placement) => [identity(plan.sourceIds.indexOf(placement.sourceId), placement.instanceIndex), placement]));
  const requestBySource = new Map(requests.map((request) => [sourceId(request), request.request]));
  const seen = new Set<string>();
  const seenIds = new Set<number>();
  const rollResults: MergedRollResult[] = [];
  for (const roll of saved.rolls) {
    if (!roll.placements.length) return null;
    const placements: MergedPlacement[] = [];
    let rollWidthMm = 0;
    let endMarginMm = 0;
    for (const position of roll.placements) {
      const placementIdentity = identity(position.sourceIndex, position.instanceIndex);
      const base = basePlacements.get(placementIdentity);
      const request = base && requestBySource.get(base.sourceId);
      if (!base || !request || seen.has(placementIdentity) || seenIds.has(position.id) || position.id <= 0) return null;
      seen.add(placementIdentity);
      seenIds.add(position.id);
      const width = position.rotated ? request.pieceLengthMm : request.pieceWidthMm;
      const height = position.rotated ? request.pieceWidthMm : request.pieceLengthMm;
      if ((position.rotated && !request.allowRotation) || position.width !== width || position.height !== height
        || !Number.isFinite(position.x) || !Number.isFinite(position.y)
        || position.x < request.sideMarginMm || position.y < request.startEndMarginMm
        || position.x + width > request.rollWidthMm - request.sideMarginMm
        || position.y + height + request.startEndMarginMm > boundedNewRollLength(request.maxLengthMm)) return null;
      const candidate = { ...base, id: position.id, x: position.x, y: position.y, width, height, rotated: position.rotated };
      if (placements.some((item) => overlaps(candidate, item, Math.max(request.gapMm, requestBySource.get(item.sourceId)?.gapMm ?? 0)))) return null;
      placements.push(candidate);
      rollWidthMm = request.rollWidthMm;
      endMarginMm = Math.max(endMarginMm, request.startEndMarginMm);
    }
    rollResults.push(rollMetrics(placements, rollWidthMm, endMarginMm));
  }
  if (seen.size !== basePlacements.size) return null;
  let offset = 0;
  const combinedPlacements = rollResults.flatMap((roll) => {
    const shifted = roll.placements.map((placement) => ({ ...placement, y: placement.y + offset }));
    offset += roll.usedLengthMm;
    return shifted;
  });
  const usedLengthMm = rollResults.reduce((sum, roll) => sum + roll.usedLengthMm, 0);
  const widthMm = requests.find((request) => plan.sourceIds.includes(sourceId(request)))?.request.rollWidthMm ?? 1_220;
  const area = combinedPlacements.reduce((sum, placement) => sum + placement.width * placement.height, 0);
  const utilizationPercent = usedLengthMm > 0 ? Math.round(area / (widthMm * usedLengthMm) * 1_000) / 10 : 0;
  return { ...plan, rollResults, newRollQuantity: combinedPlacements.length,
    result: { placements: combinedPlacements, usedLengthMm, producedQuantity: combinedPlacements.length,
      utilizationPercent, wastePercent: Math.round((100 - utilizationPercent) * 10) / 10 } };
}
