import {
  type ContinuousRollInput,
  type ContinuousRollResult,
  type Placement,
  optimizeContinuousRollLayout,
} from '../cutting/optimizeContinuousRollLayout';

export type FilmRemnant = {
  id: string;
  brand: string;
  productNumber: string;
  widthMm: number;
  lengthMm: number;
  quantity: number;
  createdAt: string;
  updatedAt: string;
  note?: string;
};

export type RemnantPlanRequest = ContinuousRollInput & {
  brand: string;
  productNumber: string;
  remnants: FilmRemnant[];
};

export type RemnantUse = {
  remnantId: string;
  placements: Placement[];
  producedQuantity: number;
  /** The new-roll length for this use's produced quantity alone, never negative. */
  savedNewRollLengthMm: number;
  /** Preserves the finite-remnant optimizer's practical-status metadata. */
  result: ContinuousRollResult;
};

export type InventoryDelta = {
  removeIds: string[];
  add: FilmRemnant[];
  basedOnUpdatedAt: Record<string, string>;
};

export type RemnantPlan = {
  remnantUses: RemnantUse[];
  newRollQuantity: number;
  newRollResult: ContinuousRollResult | null;
  inventoryDelta: InventoryDelta;
};

type Candidate = {
  source: FilmRemnant;
  sourceIndex: number;
  unitIndex: number;
  result: ContinuousRollResult;
  savedNewRollLengthMm: number;
};

type ConsumedSource = {
  source: FilmRemnant;
  sourceIndex: number;
  unitsConsumed: number;
  residuals: FilmRemnant[];
};

function sameProduct(left: string, right: string): boolean {
  return left.trim() === right.trim();
}

function usableRemnant(remnant: FilmRemnant): boolean {
  return remnant.id.trim().length > 0
    && Number.isFinite(remnant.widthMm)
    && remnant.widthMm > 0
    && Number.isFinite(remnant.lengthMm)
    && remnant.lengthMm > 0
    && Number.isInteger(remnant.quantity)
    && remnant.quantity > 0;
}

function rollInput(request: RemnantPlanRequest, quantity: number, remnant?: FilmRemnant): ContinuousRollInput {
  const { brand: _brand, productNumber: _productNumber, remnants: _remnants, maxLengthMm: _maxLengthMm, ...input } = request;
  return {
    ...input,
    quantity,
    ...(remnant === undefined ? {} : { rollWidthMm: remnant.widthMm, maxLengthMm: remnant.lengthMm }),
  };
}

function canFitOne(request: RemnantPlanRequest, widthMm: number, lengthMm: number): boolean {
  const usableWidthMm = widthMm - request.sideMarginMm * 2;
  const usableLengthMm = lengthMm - request.startEndMarginMm * 2;
  if (usableWidthMm <= 0 || usableLengthMm <= 0) return false;
  const normalFits = request.pieceWidthMm <= usableWidthMm && request.pieceLengthMm <= usableLengthMm;
  const rotatedFits = request.allowRotation
    && request.pieceLengthMm <= usableWidthMm
    && request.pieceWidthMm <= usableLengthMm;
  return normalFits || rotatedFits;
}

function candidateFor(
  request: RemnantPlanRequest,
  source: FilmRemnant,
  sourceIndex: number,
  unitIndex: number,
  remainingQuantity: number,
): Candidate | undefined {
  if (!canFitOne(request, source.widthMm, source.lengthMm)) return undefined;
  try {
    const result = optimizeContinuousRollLayout(rollInput(request, remainingQuantity, source));
    if (result.producedQuantity <= 0) return undefined;
    // Baseline is a fresh, unrestricted roll used only for the pieces this
    // individual physical rectangle produces; it never depends on sort order.
    const baseline = optimizeContinuousRollLayout(rollInput(request, result.producedQuantity));
    return {
      source,
      sourceIndex,
      unitIndex,
      result,
      savedNewRollLengthMm: Math.max(0, baseline.usedLengthMm),
    };
  } catch {
    return undefined;
  }
}

function compareCandidates(left: Candidate, right: Candidate): number {
  if (left.savedNewRollLengthMm !== right.savedNewRollLengthMm) {
    return right.savedNewRollLengthMm - left.savedNewRollLengthMm;
  }
  const leftArea = left.source.widthMm * left.source.lengthMm;
  const rightArea = right.source.widthMm * right.source.lengthMm;
  if (leftArea !== rightArea) return leftArea - rightArea;
  const idOrder = left.source.id.localeCompare(right.source.id);
  if (idOrder !== 0) return idOrder;
  if (left.unitIndex !== right.unitIndex) return left.unitIndex - right.unitIndex;
  return left.sourceIndex - right.sourceIndex;
}

function residualsFor(
  request: RemnantPlanRequest,
  source: FilmRemnant,
  sourceIndex: number,
  unitIndex: number,
  result: ContinuousRollResult,
): FilmRemnant[] {
  const usedWidthMm = Math.max(...result.placements.map((placement) => placement.x + placement.width));
  const usedLengthMm = result.usedLengthMm;
  const dimensions = [
    { suffix: 'right', widthMm: source.widthMm - usedWidthMm, lengthMm: usedLengthMm },
    { suffix: 'bottom', widthMm: source.widthMm, lengthMm: source.lengthMm - usedLengthMm },
  ];
  return dimensions.flatMap(({ suffix, widthMm, lengthMm }) => {
    if (widthMm <= 0 || lengthMm <= 0 || !canFitOne(request, widthMm, lengthMm)) return [];
    return [{
      id: `${source.id}--residual-${sourceIndex + 1}-${unitIndex}-${suffix}`,
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

function makeInventoryDelta(consumed: ConsumedSource[], inventoryIds: readonly string[]): InventoryDelta {
  const removeIds: string[] = [];
  const add: FilmRemnant[] = [];
  const basedOnUpdatedAt: Record<string, string> = {};
  // Every persisted ID is reserved, including mismatched remnants that this
  // request leaves untouched. A residual can therefore never steal an ID
  // which currently belongs to another inventory record.
  const reservedIds = new Set(inventoryIds);
  const addedIds = new Set<string>();
  const addCarryForward = (remnant: FilmRemnant): void => {
    // This is the one intentional add/remove intersection: replacing a
    // partially consumed source with its unconsumed identical units.
    if (addedIds.has(remnant.id)) throw new Error(`Duplicate inventory addition: ${remnant.id}`);
    addedIds.add(remnant.id);
    add.push(remnant);
  };
  const addResidual = (remnant: FilmRemnant): void => {
    let id = remnant.id;
    let suffix = 2;
    while (reservedIds.has(id) || addedIds.has(id)) {
      id = `${remnant.id}--${suffix}`;
      suffix += 1;
    }
    reservedIds.add(id);
    addedIds.add(id);
    add.push(id === remnant.id ? remnant : { ...remnant, id });
  };
  for (const item of consumed) {
    removeIds.push(item.source.id);
    basedOnUpdatedAt[item.source.id] = item.source.updatedAt;
    const unconsumedQuantity = item.source.quantity - item.unitsConsumed;
    if (unconsumedQuantity > 0) {
      addCarryForward({ ...item.source, quantity: unconsumedQuantity });
    }
    item.residuals.forEach(addResidual);
  }
  return { removeIds, add, basedOnUpdatedAt };
}

/**
 * Plans against matching finite rectangles before an unrestricted new roll.
 * The returned inventory delta is descriptive only; this function never
 * applies it or mutates the request or supplied remnant records.
 */
export function planWithRemnants(request: RemnantPlanRequest, remnantOverride?: FilmRemnant[]): RemnantPlan {
  const remnants = remnantOverride ?? request.remnants;
  const seenIds = new Set<string>();
  const matching = remnants
    .map((source, sourceIndex) => ({ source, sourceIndex }))
    .filter(({ source }) => {
      if (!usableRemnant(source)
        || !sameProduct(source.brand, request.brand)
        || !sameProduct(source.productNumber, request.productNumber)
        || seenIds.has(source.id)) return false;
      seenIds.add(source.id);
      return true;
    });
  const remainingUnits = matching.map(({ source }) => source.quantity);
  const consumed = new Map<number, ConsumedSource>();
  const remnantUses: RemnantUse[] = [];
  let remainingQuantity = request.quantity;

  while (remainingQuantity > 0) {
    const candidates = matching.flatMap(({ source, sourceIndex }, matchingIndex) => {
      if (remainingUnits[matchingIndex] === 0) return [];
      const used = consumed.get(sourceIndex)?.unitsConsumed ?? 0;
      const candidate = candidateFor(request, source, sourceIndex, used + 1, remainingQuantity);
      return candidate === undefined ? [] : [candidate];
    });
    const selected = candidates.sort(compareCandidates)[0];
    if (selected === undefined) break;

    const matchingIndex = matching.findIndex(({ sourceIndex }) => sourceIndex === selected.sourceIndex);
    remainingUnits[matchingIndex]! -= 1;
    remainingQuantity -= selected.result.producedQuantity;
    remnantUses.push({
      remnantId: selected.source.id,
      placements: selected.result.placements.map((placement) => ({ ...placement })),
      producedQuantity: selected.result.producedQuantity,
      savedNewRollLengthMm: selected.savedNewRollLengthMm,
      result: selected.result,
    });
    const prior = consumed.get(selected.sourceIndex);
    const unitIndex = (prior?.unitsConsumed ?? 0) + 1;
    const next: ConsumedSource = prior ?? {
      source: selected.source,
      sourceIndex: selected.sourceIndex,
      unitsConsumed: 0,
      residuals: [],
    };
    next.unitsConsumed += 1;
    next.residuals.push(...residualsFor(request, selected.source, selected.sourceIndex, unitIndex, selected.result));
    consumed.set(selected.sourceIndex, next);
  }

  const newRollResult = remainingQuantity > 0
    ? optimizeContinuousRollLayout(rollInput(request, remainingQuantity))
    : null;
  return {
    remnantUses,
    newRollQuantity: remainingQuantity,
    newRollResult,
    inventoryDelta: makeInventoryDelta(
      [...consumed.values()].sort((left, right) => left.sourceIndex - right.sourceIndex),
      remnants.map((remnant) => remnant.id),
    ),
  };
}
