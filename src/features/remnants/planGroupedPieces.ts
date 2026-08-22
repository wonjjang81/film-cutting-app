import type { FilmRemnant } from '../library/models';
import { planWithRemnants, type RemnantPlan, type RemnantPlanRequest } from './planWithRemnants';

export type GroupedPieceRequest = {
  groupId: string;
  groupName: string;
  pieceId: string;
  pieceName: string;
  request: RemnantPlanRequest;
};

export type GroupedPiecePlan = GroupedPieceRequest & {
  plan: RemnantPlan;
  inventoryBefore: FilmRemnant[];
  inventoryAfter: FilmRemnant[];
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
