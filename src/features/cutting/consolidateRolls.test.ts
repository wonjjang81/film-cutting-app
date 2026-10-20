import { describe, expect, it } from "vitest";
import { consolidateRolls } from "./consolidateRolls";
import type { MergedRollResult } from "./optimizeMergedRollLayout";
const roll = (
  sourceId: string,
  width: number,
  height: number,
): MergedRollResult => ({
  placements: [
    {
      id: 1,
      sourceId,
      instanceIndex: 0,
      x: 5,
      y: 5,
      width,
      height,
      rotated: false,
    },
  ],
  producedQuantity: 1,
  usedLengthMm: height + 10,
  utilizationPercent: 50,
  wastePercent: 50,
});
describe("cross-roll gap filling", () => {
  it("moves later-roll pieces into earlier free space before opening another roll", () => {
    const result = consolidateRolls(
      [roll("a", 600, 24000), roll("b", 500, 1000)],
      {
        rollWidthMm: 1220,
        maxLengthMm: 25000,
        gapMm: 5,
        sideMarginMm: 5,
        startEndMarginMm: 5,
      },
      new Map([
        ["a", false],
        ["b", false],
      ]),
    );
    expect(result).toHaveLength(1);
    expect(result[0]!.placements.map((p) => p.sourceId)).toEqual(["a", "b"]);
    expect(result[0]!.usedLengthMm).toBe(24010);
  });
  it("keeps a second roll when width and length cannot fit safely", () => {
    expect(
      consolidateRolls(
        [roll("a", 1200, 24000), roll("b", 1200, 2000)],
        {
          rollWidthMm: 1220,
          maxLengthMm: 25000,
          gapMm: 5,
          sideMarginMm: 5,
          startEndMarginMm: 5,
        },
        new Map(),
      ),
    ).toHaveLength(2);
  });
});
