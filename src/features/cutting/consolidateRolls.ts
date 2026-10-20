import type {
  MergedPlacement,
  MergedRollResult,
} from "./optimizeMergedRollLayout";

type Conditions = {
  rollWidthMm: number;
  maxLengthMm: number;
  gapMm: number;
  sideMarginMm: number;
  startEndMarginMm: number;
};
function metrics(
  placements: MergedPlacement[],
  c: Conditions,
): MergedRollResult {
  const usedLengthMm = placements.length
    ? Math.max(...placements.map((p) => p.y + p.height)) + c.startEndMarginMm
    : 0;
  const area = placements.reduce((sum, p) => sum + p.width * p.height, 0);
  const utilizationPercent = usedLengthMm
    ? Math.round((area / (c.rollWidthMm * usedLengthMm)) * 1000) / 10
    : 0;
  return {
    placements,
    usedLengthMm,
    producedQuantity: placements.length,
    utilizationPercent,
    wastePercent: Math.round((100 - utilizationPercent) * 10) / 10,
  };
}

/** Same-material pool only. Preserve earlier placements; fit later pieces into
 * available edge intersections or append within the physical length limit.
 * Source/instance identity is preserved; global placement IDs are assigned later. */
export function consolidateRolls(
  input: readonly MergedRollResult[],
  c: Conditions,
  rotation: ReadonlyMap<string, boolean>,
): MergedRollResult[] {
  const rolls = input.map((r) => ({
    ...r,
    placements: r.placements.map((p) => ({ ...p })),
  }));
  let comparisons = 0;
  for (let from = 1; from < rolls.length; from++) {
    for (const original of [...rolls[from]!.placements]) {
      let moved = false;
      for (let to = 0; to < from && !moved; to++) {
        const target = rolls[to]!;
        const xs = [
          ...new Set([
            c.sideMarginMm,
            ...target.placements.map((p) => p.x + p.width + c.gapMm),
          ]),
        ].sort((a, b) => a - b);
        const ys = [
          ...new Set([
            c.startEndMarginMm,
            ...target.placements.map((p) => p.y + p.height + c.gapMm),
          ]),
        ].sort((a, b) => a - b);
        const variants = [
          {
            width: original.width,
            height: original.height,
            rotated: original.rotated,
          },
        ];
        if (
          rotation.get(original.sourceId) &&
          original.width !== original.height
        )
          variants.push({
            width: original.height,
            height: original.width,
            rotated: !original.rotated,
          });
        let best: MergedPlacement | undefined;
        let bestEnd = Infinity;
        // Appending is always a safe fallback if bounded gap search runs out
        // of budget. Keep this work bounded for large multi-roll projects.
        const appendY = target.placements.length
          ? Math.max(...target.placements.map((p) => p.y + p.height)) + c.gapMm
          : c.startEndMarginMm;
        if (
          c.sideMarginMm + original.width <= c.rollWidthMm - c.sideMarginMm &&
          appendY + original.height <= c.maxLengthMm - c.startEndMarginMm
        ) {
          best = { ...original, x: c.sideMarginMm, y: appendY };
          bestEnd = appendY + original.height + c.startEndMarginMm;
        }
        search: for (const v of variants)
          for (const y of ys)
            for (const x of xs) {
              if (comparisons > 2_000_000) break search;
              if (
                x + v.width > c.rollWidthMm - c.sideMarginMm ||
                y + v.height > c.maxLengthMm - c.startEndMarginMm
              )
                continue;
              if (
                target.placements.some((p) => {
                  comparisons++;
                  return (
                    x < p.x + p.width + c.gapMm &&
                    x + v.width + c.gapMm > p.x &&
                    y < p.y + p.height + c.gapMm &&
                    y + v.height + c.gapMm > p.y
                  );
                })
              )
                continue;
              const end = Math.max(
                target.usedLengthMm,
                y + v.height + c.startEndMarginMm,
              );
              if (
                end < bestEnd ||
                (end === bestEnd &&
                  (y < (best?.y ?? Infinity) || (y === best?.y && x < best.x)))
              ) {
                best = { ...original, ...v, x, y };
                bestEnd = end;
              }
            }
        if (!best) continue;
        rolls[to] = metrics([...target.placements, best], c);
        rolls[from] = metrics(
          rolls[from]!.placements.filter(
            (p) =>
              p !== original &&
              !(
                p.sourceId === original.sourceId &&
                p.instanceIndex === original.instanceIndex &&
                p.id === original.id
              ),
          ),
          c,
        );
        moved = true;
      }
    }
  }
  return rolls.filter((r) => r.placements.length);
}
