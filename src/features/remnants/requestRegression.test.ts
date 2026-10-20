import { describe, it, expect } from "vitest";
import {
  planMergedGroups,
  planGroupedPieces,
  type GroupedPieceRequest,
} from "./planGroupedPieces";
import { composeSubgroupPieceId, validatePieceId } from "../library/pieceIds";
import { nextDiagramSubgroupName } from "../diagrams/diagramInput";
const entry = (
  id: string,
  productNumber: string,
  deferred = false,
): GroupedPieceRequest => ({
  groupId: "g",
  groupName: "그룹 1",
  pieceId: id,
  pieceName: id,
  request: {
    brand: "영림",
    productNumber,
    rollWidthMm: 1220,
    pieceWidthMm: 900,
    pieceLengthMm: 2630,
    quantity: 1,
    gapMm: 0,
    sideMarginMm: 0,
    startEndMarginMm: 0,
    allowRotation: true,
    remnants: [],
    placementDeferred: deferred,
  },
});
describe("requested input regressions", () => {
  it("numbers additional installation locations independently", () => {
    expect(nextDiagramSubgroupName("싱크대 상부장", [])).toBe("상부장1");
    expect(
      nextDiagramSubgroupName("싱크대 상부장", ["상부장1", "상부장2"]),
    ).toBe("상부장3");
  });
  it("names identical pieces independently across subgroups", () => {
    expect(composeSubgroupPieceId("그룹 1", "상부장1", "몰딩")).toBe(
      "그룹 1_상부장1_몰딩",
    );
    expect(composeSubgroupPieceId("그룹 1", "상부장2", "몰딩")).toBe(
      "그룹 1_상부장2_몰딩",
    );
    const pieces = [{ id: "그룹 1_상부장1_몰딩" }, { id: "그룹 1_상부장2_01" }];
    expect(
      validatePieceId(
        pieces,
        pieces[1]!.id,
        composeSubgroupPieceId("그룹 1", "상부장2", "몰딩"),
      ),
    ).toBeNull();
  });
  it("fills missing product codes only within one unambiguous material group", () => {
    const plans = planMergedGroups([
      entry("island", "PSM210"),
      entry("lower", ""),
    ]);
    expect(plans).toHaveLength(1);
    expect(plans[0]!.sourceIds).toHaveLength(2);
    expect(plans[0]!.rollResults).toHaveLength(1);
  });
  it("replays the reported 23-specification / 24-piece project on one roll", () => {
    const dimensions = [
      [1250, 170, 1],
      [170, 170, 1],
      [430, 200, 1],
      [120, 2280, 1],
      [150, 1070, 1],
      [120, 1170, 1],
      [120, 620, 1],
      [800, 190, 1],
      [900, 2630, 1],
      [200, 550, 1],
      [170, 2430, 1],
      [190, 720, 1],
      [620, 710, 1],
      [570, 710, 2],
      [620, 710, 1],
      [650, 550, 1],
      [800, 220, 1],
      [300, 710, 1],
      [190, 720, 1],
      [540, 710, 1],
      [650, 360, 1],
      [650, 360, 1],
      [200, 870, 1],
    ];
    const requests = dimensions.map(([w, h, q], index) => ({
      ...entry(String(index), index === 8 ? "PSM210" : ""),
      request: {
        ...entry(String(index), index === 8 ? "PSM210" : "").request,
        pieceWidthMm: w!,
        pieceLengthMm: h!,
        quantity: q!,
      },
    }));
    const plans = planMergedGroups(requests);
    expect(plans).toHaveLength(1);
    expect(plans[0]!.sourceIds).toHaveLength(23);
    expect(plans[0]!.producedQuantity).toBe(24);
    expect(plans[0]!.rollResults).toHaveLength(1);
    expect(plans[0]!.result.usedLengthMm).toBeLessThan(25000);
  });
  it("does not guess a product across groups or conflicting explicit codes", () => {
    expect(
      planMergedGroups([entry("a", "A"), entry("b", "B"), entry("c", "")]),
    ).toHaveLength(0);
    expect(
      planMergedGroups([
        entry("a", "A"),
        { ...entry("b", ""), groupId: "other" },
      ]),
    ).toHaveLength(0);
  });
  it("retains deferred input without producing or consuming any placements", () => {
    const deferred = entry("hold", "PSM210", true);
    const [plan] = planGroupedPieces([deferred], []);
    expect(plan!.request.quantity).toBe(1);
    expect(plan!.plan.newRollQuantity).toBe(0);
    expect(plan!.plan.newRollResult).toBeNull();
    expect(
      planMergedGroups([entry("one", "PSM210"), deferred]).flatMap(
        (p) => p.sourceIds,
      ),
    ).not.toContain("g-hold");
    expect(
      planMergedGroups([
        entry("one", "PSM210"),
        {
          ...deferred,
          request: { ...deferred.request, placementDeferred: false },
        },
      ])[0]!.producedQuantity,
    ).toBe(2);
  });
});
