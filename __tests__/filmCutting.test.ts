import { describe, it, expect } from "vitest";
import {
  placeFilmPieces,
  calculateFromGroups,
  getDiscountRate,
  generateGroupName,
  generateNextPieceId,
  generatePieceId,
  filmHeightToLinearM,
  calcMaterialCost,
  FILM_WIDTH,
  FILM_WIDTH_M,
  CONSTRUCTION_PRICE_MIN,
  CONSTRUCTION_PRICE_MAX,
  FilmGroup,
  FilmPiece,
  DEFAULT_MATERIAL_COST_PER_M,
  CONSTRUCTION_PRICE_DEFAULT,
} from "../lib/filmCutting";

const makeGroup = (overrides: Partial<FilmGroup> = {}): FilmGroup => ({
  groupId: 'g1',
  groupName: 'A',
  brand: '영림',
  filmName: '우드 오크',
  pieces: [],
  createdAt: Date.now(),
  ...overrides,
});

// ─── 배치 알고리즘 테스트 ─────────────────────────────────────

describe("placeFilmPieces", () => {
  it("빈 조각 목록에 대해 빈 결과 반환", () => {
    const result = placeFilmPieces([]);
    expect(result.pieces).toHaveLength(0);
    expect(result.filmHeight).toBe(0);
    expect(result.efficiency).toBe(0);
  });

  it("단일 조각 배치 - 좌상단(0,0)에 배치", () => {
    const pieces: FilmPiece[] = [{ id: "A_01", width: 500, height: 300, quantity: 1 }];
    const result = placeFilmPieces(pieces);
    expect(result.pieces).toHaveLength(1);
    expect(result.pieces[0].x).toBe(0);
    expect(result.pieces[0].y).toBe(0);
    // 원본 크기 유지 검증
    expect(result.pieces[0].width).toBe(500);
    expect(result.pieces[0].height).toBe(300);
  });

  it("조각 원본 크기가 배치 결과에 그대로 반영됨", () => {
    const pieces: FilmPiece[] = [{ id: "A_01", width: 347, height: 213, quantity: 1 }];
    const result = placeFilmPieces(pieces);
    expect(result.pieces[0].width).toBe(347);
    expect(result.pieces[0].height).toBe(213);
  });

  it("필름 너비(1220mm) 초과 조각은 회전 허용 시 회전하여 배치", () => {
    const pieces: FilmPiece[] = [{ id: "A_01", width: 1300, height: 300, quantity: 1 }];
    // allowRotation=true(기본): height(300) <= filmWidth(1220)이므로 90도 회전하여 배치
    const resultRotation = placeFilmPieces(pieces, FILM_WIDTH, '', true);
    expect(resultRotation.pieces).toHaveLength(1);
    expect(resultRotation.pieces[0].width).toBe(300);   // 회전 후 width = 원본 height
    expect(resultRotation.pieces[0].height).toBe(1300); // 회전 후 height = 원본 width
    // allowRotation=false(무늬 고정): width(1300) > filmWidth(1220)이므로 스킵
    const resultFixed = placeFilmPieces(pieces, FILM_WIDTH, '', false);
    expect(resultFixed.pieces).toHaveLength(0);
  });

  it("수량 2인 조각은 2개 인스턴스로 배치됨", () => {
    const pieces: FilmPiece[] = [{ id: "A_01", width: 400, height: 200, quantity: 2 }];
    const result = placeFilmPieces(pieces);
    expect(result.pieces).toHaveLength(2);
    // 두 인스턴스의 instanceIndex가 다름
    expect(result.pieces[0].instanceIndex).toBe(0);
    expect(result.pieces[1].instanceIndex).toBe(1);
  });

  it("수량 3인 조각은 3개 인스턴스로 배치됨", () => {
    const pieces: FilmPiece[] = [{ id: "A_01", width: 300, height: 200, quantity: 3 }];
    const result = placeFilmPieces(pieces);
    expect(result.pieces).toHaveLength(3);
  });

  it("여러 조각이 겹치지 않고 배치됨", () => {
    const pieces: FilmPiece[] = [
      { id: "A_01", width: 500, height: 300, quantity: 1 },
      { id: "A_02", width: 400, height: 200, quantity: 1 },
      { id: "B_01", width: 300, height: 150, quantity: 1 },
    ];
    const result = placeFilmPieces(pieces);
    for (let i = 0; i < result.pieces.length; i++) {
      for (let j = i + 1; j < result.pieces.length; j++) {
        const a = result.pieces[i];
        const b = result.pieces[j];
        const overlaps =
          a.x < b.x + b.width && a.x + a.width > b.x &&
          a.y < b.y + b.height && a.y + a.height > b.y;
        expect(overlaps).toBe(false);
      }
    }
  });

  it("모든 조각이 필름 너비(1220mm) 내에 배치됨", () => {
    const pieces: FilmPiece[] = [
      { id: "A_01", width: 600, height: 400, quantity: 2 },
      { id: "A_02", width: 300, height: 200, quantity: 3 },
    ];
    const result = placeFilmPieces(pieces);
    for (const p of result.pieces) {
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.x + p.width).toBeLessThanOrEqual(FILM_WIDTH);
    }
  });

  it("배치 효율성이 0~100 사이", () => {
    const pieces: FilmPiece[] = [{ id: "A_01", width: 500, height: 300, quantity: 1 }];
    const result = placeFilmPieces(pieces);
    expect(result.efficiency).toBeGreaterThanOrEqual(0);
    expect(result.efficiency).toBeLessThanOrEqual(100);
  });

  it("동일 크기 조각은 같은 colorIndex를 가짐", () => {
    const pieces: FilmPiece[] = [{ id: "A_01", width: 400, height: 200, quantity: 3 }];
    const result = placeFilmPieces(pieces);
    const colorIndices = result.pieces.map((p) => p.colorIndex);
    expect(new Set(colorIndices).size).toBe(1);
  });

  it("groupId가 PlacedPiece에 전달됨", () => {
    const pieces: FilmPiece[] = [{ id: "A_01", width: 400, height: 200, quantity: 1 }];
    const result = placeFilmPieces(pieces, FILM_WIDTH, 'group-123');
    expect(result.pieces[0].groupId).toBe('group-123');
  });

  it("totalArea = 조각 면적 × 수량 합계", () => {
    const pieces: FilmPiece[] = [
      { id: "A_01", width: 500, height: 300, quantity: 2 },
      { id: "A_02", width: 400, height: 200, quantity: 1 },
    ];
    const result = placeFilmPieces(pieces);
    const expected = 500 * 300 * 2 + 400 * 200 * 1;
    expect(result.totalArea).toBe(expected);
  });
});

// ─── 자재비 계산 테스트 ──────────────────────────────────────

describe("filmHeightToLinearM", () => {
  it("1000mm → 1m", () => expect(filmHeightToLinearM(1000)).toBe(1));
  it("2500mm → 2.5m", () => expect(filmHeightToLinearM(2500)).toBe(2.5));
});

describe("calcMaterialCost", () => {
  it("1000mm 높이, 10000원/m → 10000원", () => expect(calcMaterialCost(1000, 10000)).toBe(10000));
  it("2500mm 높이, 10000원/m → 25000원", () => expect(calcMaterialCost(2500, 10000)).toBe(25000));
});

// ─── 할인율 테스트 ────────────────────────────────────────────

describe("getDiscountRate", () => {
  it("1m² 미만: 할인 없음", () => expect(getDiscountRate(0.5)).toBe(0));
  it("1m² 이상 5m² 미만: 5% 할인", () => expect(getDiscountRate(2)).toBe(0.05));
  it("5m² 이상 10m² 미만: 10% 할인", () => expect(getDiscountRate(7)).toBe(0.10));
  it("10m² 이상: 15% 할인", () => expect(getDiscountRate(12)).toBe(0.15));
});

// ─── 그룹별 통합 계산 테스트 ─────────────────────────────────

describe("calculateFromGroups", () => {
  it("빈 그룹 목록에 대해 빈 결과 반환", () => {
    const { groupResults, invoice } = calculateFromGroups([]);
    expect(groupResults).toHaveLength(0);
    expect(invoice.totalMaterialCost).toBe(0);
    expect(invoice.subtotal).toBe(0);
  });

  it("유효한 조각이 없는 그룹은 결과에서 제외", () => {
    const groups: FilmGroup[] = [
      makeGroup({ pieces: [{ id: 'A_01', width: 0, height: 0, quantity: 1 }] }),
    ];
    const { groupResults } = calculateFromGroups(groups);
    expect(groupResults).toHaveLength(0);
  });

  it("subtotal = 그룹별 자재비 + 시공비 합산과 정확히 일치", () => {
    const groups: FilmGroup[] = [
      makeGroup({
        groupId: 'g1', groupName: 'A',
        pieces: [{ id: 'A_01', width: 500, height: 300, quantity: 1 }],
      }),
      makeGroup({
        groupId: 'g2', groupName: 'B', brand: 'LX',
        pieces: [{ id: 'B_01', width: 400, height: 200, quantity: 2 }],
      }),
    ];
    const { invoice } = calculateFromGroups(groups, 10000, 15000);

    // subtotal = 모든 그룹 subtotal 합산
    const sumFromGroups = invoice.groupInvoices.reduce((s, gi) => s + gi.subtotal, 0);
    expect(invoice.subtotal).toBe(sumFromGroups);

    // totalMaterialCost = 그룹별 materialCost 합산
    const sumMaterial = invoice.groupInvoices.reduce((s, gi) => s + gi.materialCost, 0);
    expect(invoice.totalMaterialCost).toBe(sumMaterial);

    // totalConstructionCost = 그룹별 constructionCost 합산
    const sumConstruction = invoice.groupInvoices.reduce((s, gi) => s + gi.constructionCost, 0);
    expect(invoice.totalConstructionCost).toBe(sumConstruction);
  });

  it("최종 금액 범위: min은 최저 시공비, max는 최고 시공비 기준", () => {
    const groups: FilmGroup[] = [
      makeGroup({
        groupId: 'g1',
        pieces: [{ id: 'A_01', width: 500, height: 300, quantity: 1 }],
      }),
    ];
    const { invoice } = calculateFromGroups(groups, 10000, CONSTRUCTION_PRICE_DEFAULT);
    const discountFactor = 1 - invoice.discountRate;
    const expectedMin = Math.round((invoice.totalMaterialCost + invoice.totalFilmAreaM2 * CONSTRUCTION_PRICE_MIN) * discountFactor);
    const expectedMax = Math.round((invoice.totalMaterialCost + invoice.totalFilmAreaM2 * CONSTRUCTION_PRICE_MAX) * discountFactor);
    expect(invoice.total.min).toBe(expectedMin);
    expect(invoice.total.max).toBe(expectedMax);
  });

  it("그룹별 결과에 브랜드와 필름명이 포함됨", () => {
    const groups: FilmGroup[] = [
      makeGroup({
        groupId: 'g1', brand: 'LX', filmName: '우드 오크',
        pieces: [{ id: 'A_01', width: 500, height: 300, quantity: 1 }],
      }),
    ];
    const { groupResults } = calculateFromGroups(groups);
    expect(groupResults[0].brand).toBe('LX');
    expect(groupResults[0].filmName).toBe('우드 오크');
  });

  it("filmAreaM2 = FILM_WIDTH_M × filmLengthM", () => {
    const groups: FilmGroup[] = [
      makeGroup({
        groupId: 'g1',
        pieces: [{ id: 'A_01', width: 500, height: 1000, quantity: 1 }],
      }),
    ];
    const { invoice } = calculateFromGroups(groups);
    const gi = invoice.groupInvoices[0];
    expect(gi.filmAreaM2).toBeCloseTo(FILM_WIDTH_M * gi.filmLengthM, 5);
  });
});

// ─── 유틸리티 테스트 ─────────────────────────────────────────

describe("generatePieceId", () => {
  it("올바른 형식의 ID 생성", () => {
    expect(generatePieceId("A", 0)).toBe("A_01");
    expect(generatePieceId("B", 9)).toBe("B_10");
  });
});

describe("generateGroupName", () => {
  it("빈 그룹 목록에서 A 반환", () => expect(generateGroupName([])).toBe("A"));
  it("A가 이미 있으면 B 반환", () => {
    const groups: FilmGroup[] = [makeGroup({ groupName: 'A' })];
    expect(generateGroupName(groups)).toBe("B");
  });
});


// ─── 그룹별 자재비 단가 테스트 ────────────────────────────────

describe("calculateFromGroups - 그룹별 단가", () => {
  it("그룹별 materialCostPerM이 설정되면 해당 단가가 사용됨", () => {
    const groups: FilmGroup[] = [
      makeGroup({
        groupId: 'g1', groupName: 'A',
        materialCostPerM: 15000,
        pieces: [{ id: 'A_01', width: 500, height: 1000, quantity: 1 }],
      }),
    ];
    const { invoice } = calculateFromGroups(groups, 10000, 15000);
    const gi = invoice.groupInvoices[0];
    expect(gi.materialCostPerM).toBe(15000);
    // 자재비 = 길이(m) × 단가
    expect(gi.materialCost).toBe(Math.round(gi.filmLengthM * 15000));
  });

  it("그룹별 단가가 없으면 전역 기본값 사용", () => {
    const groups: FilmGroup[] = [
      makeGroup({
        groupId: 'g1', groupName: 'A',
        pieces: [{ id: 'A_01', width: 500, height: 1000, quantity: 1 }],
      }),
    ];
    const { invoice } = calculateFromGroups(groups, 8000, 15000);
    const gi = invoice.groupInvoices[0];
    expect(gi.materialCostPerM).toBe(8000);
    expect(gi.materialCost).toBe(Math.round(gi.filmLengthM * 8000));
  });

  it("그룹별로 다른 단가 적용 가능", () => {
    const groups: FilmGroup[] = [
      makeGroup({
        groupId: 'g1', groupName: 'A',
        materialCostPerM: 12000,
        pieces: [{ id: 'A_01', width: 500, height: 1000, quantity: 1 }],
      }),
      makeGroup({
        groupId: 'g2', groupName: 'B',
        materialCostPerM: 18000,
        pieces: [{ id: 'B_01', width: 600, height: 800, quantity: 1 }],
      }),
    ];
    const { invoice } = calculateFromGroups(groups, 10000, 15000);
    expect(invoice.groupInvoices[0].materialCostPerM).toBe(12000);
    expect(invoice.groupInvoices[1].materialCostPerM).toBe(18000);
  });
});


// ─── 자동 ID 생성 테스트 ──────────────────────────────────────
describe("generateNextPieceId", () => {
  it("빈 조각 목록에서 기본 ID 생성 (그룹명-01)", () => {
    const pieces: FilmPiece[] = [];
    const nextId = generateNextPieceId(pieces, "상부장");
    expect(nextId).toBe("상부장-01");
  });

  it("마지막 ID가 '그룹명-01' 형식이면 번호 증가 (상부장-01 → 상부장-02)", () => {
    const pieces: FilmPiece[] = [
      { id: "상부장-01", width: 500, height: 1000, quantity: 1 },
    ];
    const nextId = generateNextPieceId(pieces, "상부장");
    expect(nextId).toBe("상부장-02");
  });

  it("마지막 ID가 '그룹명-05' 형식이면 번호 증가 (상부장-05 → 상부장-06)", () => {
    const pieces: FilmPiece[] = [
      { id: "상부장-01", width: 500, height: 1000, quantity: 1 },
      { id: "상부장-02", width: 600, height: 1000, quantity: 1 },
      { id: "상부장-05", width: 700, height: 1000, quantity: 1 },
    ];
    const nextId = generateNextPieceId(pieces, "상부장");
    expect(nextId).toBe("상부장-06");
  });

  it("마지막 ID가 '그룹명' 형식이면 -01 추가 (상부장 → 상부장-01)", () => {
    const pieces: FilmPiece[] = [
      { id: "상부장", width: 500, height: 1000, quantity: 1 },
    ];
    const nextId = generateNextPieceId(pieces, "상부장");
    expect(nextId).toBe("상부장-01");
  });

  it("마지막 ID가 언더스코어 형식이면 대시로 변환하여 번호 증가 (A_01 → A-02)", () => {
    const pieces: FilmPiece[] = [
      { id: "A_01", width: 500, height: 1000, quantity: 1 },
    ];
    const nextId = generateNextPieceId(pieces, "A");
    expect(nextId).toBe("A-02");
  });

  it("여러 조각이 있을 때 마지막 조각 기반으로 ID 생성", () => {
    const pieces: FilmPiece[] = [
      { id: "창틀-01", width: 500, height: 1000, quantity: 1 },
      { id: "창틀-02", width: 600, height: 1000, quantity: 1 },
      { id: "창틀-03", width: 700, height: 1000, quantity: 1 },
    ];
    const nextId = generateNextPieceId(pieces, "창틀");
    expect(nextId).toBe("창틀-04");
  });
});
