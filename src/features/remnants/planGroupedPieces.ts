import type { FilmRemnant } from '../library/models';
import { optimizeMergedRollLayout, type MergedPlacement, type MergedRollResult } from '../cutting/optimizeMergedRollLayout';
import { planWithRemnants, type InventoryDelta, type RemnantPlan, type RemnantPlanRequest } from './planWithRemnants';
import type { ConstructionDifficulty } from '../estimate/difficultyPricing';

export type GroupedPieceRequest = {
  groupId: string;
  groupName: string;
  pieceId: string;
  pieceName: string;
  mergeGroupId?: string;
  filmName?: string;
  subgroupName?: string;
  difficulty?: ConstructionDifficulty;
  materialCostPerM?: number;
  constructionCostPerM2?: number;
  request: RemnantPlanRequest;
};

export type GroupedPiecePlan = GroupedPieceRequest & {
  plan: RemnantPlan;
  inventoryBefore: FilmRemnant[];
  inventoryAfter: FilmRemnant[];
  savedJobId?: string;
};

export type MergedGroupPlan = {
  mergeGroupId: string;
  sourceIds: string[];
  groupNames: string[];
  pieceCount: number;
  /** New-roll layout. Remnant layouts are kept separately because each is a physical rectangle. */
  result: MergedRollResult;
  newRollQuantity: number;
  producedQuantity: number;
  remnantUses: MergedRemnantUse[];
  inventoryDelta: InventoryDelta;
  inventoryAfter: FilmRemnant[];
};

export type MergedRemnantUse = {
  remnantId: string;
  widthMm: number;
  lengthMm: number;
  placements: MergedPlacement[];
  producedQuantity: number;
  sourceQuantities: Record<string, number>;
  savedNewRollLengthMm: number;
  result: MergedRollResult;
};

/** Group IDs used by the input screen. Unassigned pieces share the automatic bucket. */
export const AUTO_MERGE_GROUP_ID = 'auto';
export const DISABLED_MERGE_GROUP_ID = 'none';

function validateGroupedRequest(entry: GroupedPieceRequest): void {
  const { request } = entry;
  const label = `${entry.groupName} · ${entry.pieceName}`;
  if (!Number.isFinite(request.pieceWidthMm) || request.pieceWidthMm <= 0) throw new Error(`${label}: 재단 폭은 0보다 커야 합니다.`);
  if (!Number.isFinite(request.pieceLengthMm) || request.pieceLengthMm <= 0) throw new Error(`${label}: 재단 길이는 0보다 커야 합니다.`);
  if (!Number.isInteger(request.quantity) || request.quantity <= 0) throw new Error(`${label}: 필요 수량은 1개 이상의 정수여야 합니다.`);
  if (!Number.isFinite(request.gapMm) || request.gapMm < 0) throw new Error(`${label}: 재단 간격을 확인해 주세요.`);
  if (!Number.isFinite(request.sideMarginMm) || request.sideMarginMm < 0) throw new Error(`${label}: 좌우 여백을 확인해 주세요.`);
  if (!Number.isFinite(request.startEndMarginMm) || request.startEndMarginMm < 0) throw new Error(`${label}: 시작·끝 여백을 확인해 주세요.`);
}

function applyDelta(inventory: readonly FilmRemnant[], plan: RemnantPlan): FilmRemnant[] {
  const removed = new Set(plan.inventoryDelta.removeIds);
  return [...inventory.filter((item) => !removed.has(item.id)), ...plan.inventoryDelta.add.map((item) => ({ ...item }))];
}

/** Plans every piece in group order, carrying remnant inventory forward between pieces. */
export function planGroupedPieces(requests: readonly GroupedPieceRequest[], inventory: readonly FilmRemnant[]): GroupedPiecePlan[] {
  requests.forEach(validateGroupedRequest);
  let working = inventory.map((item) => ({ ...item }));
  return requests.map((entry) => {
    const before = working.map((item) => ({ ...item }));
    const plan = planWithRemnants({ ...entry.request, remnants: before });
    working = applyDelta(before, plan);
    return { ...entry, plan, inventoryBefore: before, inventoryAfter: working.map((item) => ({ ...item })) };
  });
}

/** Calculates a mixed-size new-roll layout for each explicitly merged group. */
export function planMergedGroups(
  requests: readonly GroupedPieceRequest[],
  rollWidthMm = 1220,
  inventory: readonly FilmRemnant[] = [],
  useRemnants = false,
): MergedGroupPlan[] {
  requests.forEach(validateGroupedRequest);
  const buckets = new Map<string, GroupedPieceRequest[]>();
  for (const request of requests) {
    const mergeGroupId = request.mergeGroupId ?? AUTO_MERGE_GROUP_ID;
    if (mergeGroupId === DISABLED_MERGE_GROUP_ID) continue;
    const bucket = buckets.get(mergeGroupId) ?? [];
    bucket.push(request);
    buckets.set(mergeGroupId, bucket);
  }
  let working = inventory.map((item) => ({ ...item }));
  return [...buckets.entries()].filter(([, entries]) => entries.length > 1).map(([mergeGroupId, entries]) => {
    const planned = planMergedGroup(entries, mergeGroupId, rollWidthMm, useRemnants ? working : []);
    working = applyInventoryDelta(working, planned.inventoryDelta);
    return { ...planned, inventoryAfter: working.map((item) => ({ ...item })) };
  });
}

function applyInventoryDelta(inventory: readonly FilmRemnant[], delta: InventoryDelta): FilmRemnant[] {
  const removed = new Set(delta.removeIds);
  return [...inventory.filter((item) => !removed.has(item.id)), ...delta.add.map((item) => ({ ...item }))];
}

function sourceId(entry: GroupedPieceRequest): string { return `${entry.groupId}-${entry.pieceId}`; }

function sameProduct(left: string, right: string): boolean { return left.trim() === right.trim(); }

function matchesRemnant(entry: GroupedPieceRequest, source: FilmRemnant): boolean {
  return sameProduct(entry.request.brand, source.brand)
    && (entry.request.productNumber.trim().length === 0 || sameProduct(entry.request.productNumber, source.productNumber));
}

function canFitOne(entry: GroupedPieceRequest, widthMm: number, lengthMm: number): boolean {
  const usableWidth = widthMm - entry.request.sideMarginMm * 2;
  const usableLength = lengthMm - entry.request.startEndMarginMm * 2;
  if (usableWidth <= 0 || usableLength <= 0) return false;
  const normal = entry.request.pieceWidthMm <= usableWidth && entry.request.pieceLengthMm <= usableLength;
  const rotated = entry.request.allowRotation
    && entry.request.pieceLengthMm <= usableWidth
    && entry.request.pieceWidthMm <= usableLength;
  return normal || rotated;
}

function piecesFor(entries: readonly GroupedPieceRequest[], remaining: ReadonlyMap<string, number>): GroupedPieceRequest[] {
  return entries.filter((entry) => (remaining.get(sourceId(entry)) ?? 0) > 0);
}

function mergedPieces(entries: readonly GroupedPieceRequest[], remaining: ReadonlyMap<string, number>): { sourceId: string; widthMm: number; lengthMm: number; quantity: number; allowRotation: boolean }[] {
  return piecesFor(entries, remaining).map((entry) => ({
    sourceId: sourceId(entry),
    widthMm: entry.request.pieceWidthMm,
    lengthMm: entry.request.pieceLengthMm,
    quantity: remaining.get(sourceId(entry)) ?? 0,
    allowRotation: entry.request.allowRotation,
  }));
}

function countPlacements(placements: readonly MergedPlacement[]): Record<string, number> {
  return placements.reduce<Record<string, number>>((counts, placement) => {
    counts[placement.sourceId] = (counts[placement.sourceId] ?? 0) + 1;
    return counts;
  }, {});
}

function residualsForMerged(
  entrySet: readonly GroupedPieceRequest[],
  source: FilmRemnant,
  sourceIndex: number,
  unitIndex: number,
  result: MergedRollResult,
): FilmRemnant[] {
  if (result.placements.length === 0) return [];
  const usedWidth = Math.max(...result.placements.map((placement) => placement.x + placement.width));
  const usedLength = result.usedLengthMm;
  const dimensions = [
    { suffix: 'right', widthMm: source.widthMm - usedWidth, lengthMm: usedLength },
    { suffix: 'bottom', widthMm: source.widthMm, lengthMm: source.lengthMm - usedLength },
  ];
  return dimensions.flatMap(({ suffix, widthMm, lengthMm }) => {
    if (widthMm <= 0 || lengthMm <= 0 || !entrySet.some((entry) => matchesRemnant(entry, source) && canFitOne(entry, widthMm, lengthMm))) return [];
    return [{
      id: `${source.id}--merged-residual-${sourceIndex + 1}-${unitIndex}-${suffix}`,
      brand: source.brand,
      productNumber: source.productNumber,
      widthMm,
      lengthMm,
      quantity: 1,
      createdAt: source.createdAt,
      updatedAt: source.updatedAt,
      ...(source.note === undefined ? {} : { note: source.note }),
    }];
  });
}

type ConsumedMergedSource = { source: FilmRemnant; sourceIndex: number; unitsConsumed: number; residuals: FilmRemnant[] };

function makeMergedInventoryDelta(consumed: readonly ConsumedMergedSource[], inventoryIds: readonly string[]): InventoryDelta {
  const removeIds: string[] = [];
  const add: FilmRemnant[] = [];
  const basedOnUpdatedAt: Record<string, string> = {};
  const reservedIds = new Set(inventoryIds);
  const addedIds = new Set<string>();
  const addCarryForward = (item: FilmRemnant) => { if (addedIds.has(item.id)) throw new Error(`Duplicate inventory addition: ${item.id}`); addedIds.add(item.id); add.push({ ...item }); };
  const addResidual = (item: FilmRemnant) => {
    let id = item.id;
    let suffix = 2;
    while (reservedIds.has(id) || addedIds.has(id)) { id = `${item.id}--${suffix}`; suffix += 1; }
    reservedIds.add(id); addedIds.add(id); add.push(id === item.id ? { ...item } : { ...item, id });
  };
  for (const item of consumed) {
    removeIds.push(item.source.id);
    basedOnUpdatedAt[item.source.id] = item.source.updatedAt;
    const carryForward = item.source.quantity - item.unitsConsumed;
    if (carryForward > 0) addCarryForward({ ...item.source, quantity: carryForward });
    item.residuals.forEach(addResidual);
  }
  return { removeIds, add, basedOnUpdatedAt };
}

function planMergedGroup(entries: readonly GroupedPieceRequest[], mergeGroupId: string, rollWidthMm: number, inventory: readonly FilmRemnant[]): MergedGroupPlan {
  const first = entries[0]!;
  const remaining = new Map(entries.map((entry) => [sourceId(entry), entry.request.quantity]));
  const consumed = new Map<number, ConsumedMergedSource>();
  const remnantUses: MergedRemnantUse[] = [];
  const candidates = inventory
    .map((source, sourceIndex) => ({ source, sourceIndex }))
    .filter(({ source }) => source.id.trim().length > 0 && source.widthMm > 0 && source.lengthMm > 0 && source.quantity > 0 && entries.some((entry) => matchesRemnant(entry, source)));
  const condition = { gapMm: first.request.gapMm, sideMarginMm: first.request.sideMarginMm, startEndMarginMm: first.request.startEndMarginMm };
  let remainingUnits = candidates.map(({ source }) => source.quantity);
  while ([...remaining.values()].some((quantity) => quantity > 0)) {
    const options = candidates.flatMap(({ source, sourceIndex }, candidateIndex) => {
      if (remainingUnits[candidateIndex] === 0) return [];
      const eligible = piecesFor(entries, remaining).filter((entry) => matchesRemnant(entry, source));
      if (eligible.length === 0) return [];
      const result = optimizeMergedRollLayout({ rollWidthMm: source.widthMm, maxLengthMm: source.lengthMm, ...condition, pieces: mergedPieces(eligible, remaining) });
      if (result.placements.length === 0) return [];
      const sourceQuantities = countPlacements(result.placements);
      const selectedPieces = eligible.map((entry) => ({ ...entry, request: { ...entry.request, quantity: sourceQuantities[sourceId(entry)] ?? 0 } }));
      const baseline = optimizeMergedRollLayout({ rollWidthMm, ...condition, pieces: selectedPieces.map((entry) => ({ sourceId: sourceId(entry), widthMm: entry.request.pieceWidthMm, lengthMm: entry.request.pieceLengthMm, quantity: entry.request.quantity, allowRotation: entry.request.allowRotation })) });
      return [{ source, sourceIndex, candidateIndex, result, sourceQuantities, savedNewRollLengthMm: baseline.usedLengthMm }];
    });
    const selected = options.sort((left, right) => right.savedNewRollLengthMm - left.savedNewRollLengthMm || right.result.placements.length - left.result.placements.length || (left.source.widthMm * left.source.lengthMm) - (right.source.widthMm * right.source.lengthMm) || left.source.id.localeCompare(right.source.id))[0];
    if (selected === undefined) break;
    remainingUnits[selected.candidateIndex]! -= 1;
    for (const [id, quantity] of Object.entries(selected.sourceQuantities)) remaining.set(id, Math.max(0, (remaining.get(id) ?? 0) - quantity));
    const prior = consumed.get(selected.sourceIndex);
    const unitIndex = (prior?.unitsConsumed ?? 0) + 1;
    const next: ConsumedMergedSource = prior ?? { source: selected.source, sourceIndex: selected.sourceIndex, unitsConsumed: 0, residuals: [] };
    next.unitsConsumed += 1;
    next.residuals.push(...residualsForMerged(entries, selected.source, selected.sourceIndex, unitIndex, selected.result));
    consumed.set(selected.sourceIndex, next);
    remnantUses.push({ remnantId: selected.source.id, widthMm: selected.source.widthMm, lengthMm: selected.source.lengthMm, placements: selected.result.placements.map((placement) => ({ ...placement })), producedQuantity: selected.result.placements.length, sourceQuantities: selected.sourceQuantities, savedNewRollLengthMm: selected.savedNewRollLengthMm, result: selected.result });
  }
  const result = optimizeMergedRollLayout({ rollWidthMm, ...condition, pieces: mergedPieces(entries, remaining) });
  const inventoryDelta = makeMergedInventoryDelta([...consumed.values()].sort((left, right) => left.sourceIndex - right.sourceIndex), inventory.map((item) => item.id));
  return {
    mergeGroupId,
    sourceIds: entries.map(sourceId),
    groupNames: [...new Set(entries.map((entry) => entry.groupName))],
    pieceCount: entries.reduce((sum, entry) => sum + entry.request.quantity, 0),
    result,
    newRollQuantity: result.placements.length,
    producedQuantity: remnantUses.reduce((sum, use) => sum + use.producedQuantity, 0) + result.producedQuantity,
    remnantUses,
    inventoryDelta,
    inventoryAfter: applyInventoryDelta(inventory, inventoryDelta),
  };
}
