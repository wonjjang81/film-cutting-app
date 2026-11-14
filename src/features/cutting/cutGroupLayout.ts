import type { GroupedPieceRequest, MergedGroupPlan } from '../remnants/planGroupedPieces';
import { optimizeMergedRollLayout, type MergedPlacement, type MergedRollResult } from './optimizeMergedRollLayout';
import { boundedNewRollLength } from './rollLengthLimit';

export const hasCutGroups = (plan: MergedGroupPlan) => plan.result.placements.some(piece => piece.cutGroup !== undefined);

export function cutGroupId(order: number): string {
  let label = '';
  for (let value = order; value > 0; value = Math.floor((value - 1) / 26)) {
    label = String.fromCharCode(65 + (value - 1) % 26) + label;
  }
  return label;
}

export function cutGroupEndLines(roll: MergedRollResult, laterRolls: readonly MergedRollResult[] = []) {
  const continues = new Set(laterRolls.flatMap(next => next.placements.map(piece => piece.cutGroup)));
  const ends = new Map<number, number>();
  for (const piece of roll.placements) {
    if (piece.cutGroup === undefined || continues.has(piece.cutGroup)) continue;
    ends.set(piece.cutGroup, Math.max(ends.get(piece.cutGroup) ?? 0, piece.y + piece.height));
  }
  return [...ends].sort((a, b) => a[1] - b[1]).map(([group, endY]) => ({ group, endY, label: `그룹 ${cutGroupId(group)} 끝 · ${endY.toLocaleString('ko-KR')}mm` }));
}

/** Repack only this compatible new-roll pool. Identity, quantity and remnant usage are unchanged. */
export function packCutGroups(plan: MergedGroupPlan, requests: readonly GroupedPieceRequest[], groups: readonly (readonly number[])[], orders?: readonly number[]): MergedGroupPlan {
  const original = plan.result.placements;
  const pieces = new Map(original.map(piece => [piece.id, piece]));
  const specs = new Map(requests.map(entry => [`${entry.groupId}-${entry.pieceId}`, entry.request]));
  const conditions = original.map(piece => specs.get(piece.sourceId));
  if (!groups.length || groups.some(group => !group.length) || !original.length
    || conditions.some(spec => !spec || spec.rollWidthMm !== conditions[0]?.rollWidthMm)) throw new Error('같은 원단의 새 롤 조각을 선택해 주세요.');
  const assigned = new Set<number>();
  const batches = groups.map(group => group.map(id => {
    const piece = pieces.get(id);
    if (!piece || assigned.has(id)) throw new Error('조각 선택이 바뀌었습니다. 그룹을 다시 만들어 주세요.');
    assigned.add(id);
    return piece;
  }));
  batches.push(original.filter(piece => !assigned.has(piece.id)));
  const width = conditions[0]!.rollWidthMm;
  const gap = Math.max(...conditions.map(spec => spec!.gapMm));
  const side = Math.max(...conditions.map(spec => spec!.sideMarginMm));
  const margin = Math.max(...conditions.map(spec => spec!.startEndMarginMm));
  const limit = Math.min(...conditions.map(spec => boundedNewRollLength(spec!.maxLengthMm)));
  const rolls: MergedRollResult[] = [];
  const metrics = (placements: MergedPlacement[], usedLengthMm: number): MergedRollResult => {
    const area = placements.reduce((sum, piece) => sum + piece.width * piece.height, 0);
    const utilizationPercent = usedLengthMm ? Math.round(area / (width * usedLengthMm) * 1000) / 10 : 0;
    return { placements, usedLengthMm, utilizationPercent, wastePercent: Math.round((100 - utilizationPercent) * 10) / 10, producedQuantity: placements.length };
  };
  let onRoll: MergedPlacement[] = [];
  let end = margin;
  const finish = () => {
    if (onRoll.length) rolls.push(metrics(onRoll, end + margin));
    onRoll = [];
    end = margin;
  };
  for (const [index, batch] of batches.entries()) {
    const queues = new Map<string, { pieces: MergedPlacement[]; used: number }>();
    for (const piece of batch) {
      const queue = queues.get(piece.sourceId) ?? { pieces: [], used: 0 };
      queue.pieces.push(piece);
      queues.set(piece.sourceId, queue);
    }
    let remaining = batch.length;
    while (remaining > 0) {
      const start = onRoll.length ? end + gap : margin;
      const capacity = limit - margin - start;
      // Inflate each rectangle by the gap. An equal right/end extension removes
      // padding beyond the last piece without letting cuts violate the actual margins.
      const packed = capacity > 0 ? optimizeMergedRollLayout({
        rollWidthMm: width - 2 * side + gap, maxLengthMm: capacity + gap,
        gapMm: 0, sideMarginMm: 0, startEndMarginMm: 0,
        pieces: [...queues].filter(([, queue]) => queue.used < queue.pieces.length).map(([sourceId, queue]) => {
          const spec = specs.get(sourceId)!;
          return { sourceId, quantity: queue.pieces.length - queue.used, widthMm: spec.pieceWidthMm + gap, lengthMm: spec.pieceLengthMm + gap, allowRotation: spec.allowRotation };
        }),
      }).placements : [];
      if (packed.length === 0) {
        if (!onRoll.length) throw new Error('롤 최대 길이 또는 폭을 넘는 조각이 있습니다.');
        finish();
        continue;
      }
      for (const position of packed) {
        const queue = queues.get(position.sourceId)!;
        const original = queue.pieces[queue.used++]!;
        const spec = specs.get(position.sourceId)!;
        const piece = { ...original, x: side + position.x, y: start + position.y, width: position.rotated ? spec.pieceLengthMm : spec.pieceWidthMm, height: position.rotated ? spec.pieceWidthMm : spec.pieceLengthMm, rotated: position.rotated, cutGroup: index < groups.length ? (orders?.[index] ?? index + 1) : undefined };
        onRoll.push(piece);
        end = Math.max(end, piece.y + piece.height);
      }
      remaining -= packed.length;
      if (remaining > 0) finish();
    }
  }
  finish();
  let offset = 0;
  const placements = rolls.flatMap(roll => {
    const combined = roll.placements.map(piece => ({ ...piece, y: piece.y + offset }));
    offset += roll.usedLengthMm;
    return combined;
  });
  return { ...plan, rollResults: rolls, result: metrics(placements, offset) };
}
