// ============================================================
// 필름 재단 계산기 - 핵심 타입 정의 및 계산 로직 v3
// 단위: mm (밀리미터), 필름 고정 너비: 1220mm
// 자재비: m(선형미터)당 단가, 시공비: m²당 단가
// ============================================================

export const FILM_WIDTH = 1220; // mm 고정
export const FILM_WIDTH_M = FILM_WIDTH / 1000; // 1.22m

// ─── 브랜드 상수 ─────────────────────────────────────────────

export const FILM_BRANDS = ['영림', 'LX', '현대', '예림'] as const;
export type FilmBrand = typeof FILM_BRANDS[number];

// ─── 타입 정의 ───────────────────────────────────────────────

export interface FilmPiece {
  id: string;       // 예: "A_01"
  width: number;    // mm
  height: number;   // mm
  quantity: number;
}

export interface FilmGroup {
  groupId: string;
  groupName: string;
  brand: FilmBrand;
  filmName: string;
  materialCostPerM?: number;  // 그룹별 자재비 m당 단가 (원/m). 미설정 시 전역 기본값 사용.
  constructionPricePerM2?: number;  // 그룹별 시공비 m²당 단가 (원/m²). 미설정 시 전역 기본값 사용.
  patternFixed?: boolean;  // 무늬 고정 여부. true이면 배치 시 조각 회전 금지.
  pieces: FilmPiece[];
  createdAt: number;
}

export interface PlacedPiece {
  id: string;
  instanceIndex: number; // 같은 조각의 몇 번째 인스턴스인지 (0-based)
  x: number;
  y: number;
  width: number;    // 원본 입력값 그대로 (스냅 없음)
  height: number;   // 원본 입력값 그대로 (스냅 없음)
  colorIndex: number;
  groupId: string;
}

export interface PlacementResult {
  pieces: PlacedPiece[];
  filmHeight: number;   // mm (스냅 적용)
  filmWidth: number;    // mm
  efficiency: number;   // %
  totalArea: number;    // mm² (조각 실제 면적 합계)
  usedArea: number;     // mm² (필름 사용 면적)
}

export interface GroupPlacementResult {
  groupId: string;
  groupName: string;
  brand: FilmBrand;
  filmName: string;
  placement: PlacementResult;
  filmLengthM: number;
  materialCost: number;
  materialCostPerM: number;  // 적용된 그룹별 단가
}

export interface GroupInvoice {
  groupId: string;
  groupName: string;
  brand: FilmBrand;
  filmName: string;
  filmLengthM: number;
  filmAreaM2: number;
  materialCostPerM: number;
  materialCost: number;
  constructionPricePerM2: number;  // 적용된 그룹별 시공비 단가
  constructionCost: number;
  subtotal: number;
}

export interface Invoice {
  groupInvoices: GroupInvoice[];
  totalFilmLengthM: number;
  totalFilmAreaM2: number;
  totalMaterialCost: number;
  totalConstructionCost: number;
  subtotal: number;
  discount: number;
  discountRate: number;
  total: { min: number; max: number };
  constructionPricePerM2: number;
}

// ─── 시공비 상수 (2025년 시세 기반) ─────────────────────────

export const CONSTRUCTION_PRICE_MIN = 8500;
export const CONSTRUCTION_PRICE_MAX = 25000;
export const CONSTRUCTION_PRICE_DEFAULT = 15000;

// ─── 자재비 상수 ─────────────────────────────────────────────

export const DEFAULT_MATERIAL_COST_PER_M = 10000; // 원/m (선형미터)

// ─── 조각 색상 팔레트 ────────────────────────────────────────

export const PIECE_COLORS = [
  '#93C5FD', '#6EE7B7', '#FCD34D', '#F9A8D4', '#A5B4FC',
  '#FCA5A5', '#5EEAD4', '#D8B4FE', '#86EFAC', '#FED7AA',
];

export const PIECE_BORDER_COLORS = [
  '#3B82F6', '#10B981', '#F59E0B', '#EC4899', '#6366F1',
  '#EF4444', '#14B8A6', '#8B5CF6', '#22C55E', '#F97316',
];

export const GROUP_COLORS = [
  '#DBEAFE', '#D1FAE5', '#FEF3C7', '#FCE7F3', '#EDE9FE',
  '#FEE2E2', '#CCFBF1', '#F3E8FF', '#DCFCE7', '#FFEDD5',
];
export const GROUP_BORDER_COLORS = [
  '#3B82F6', '#10B981', '#F59E0B', '#EC4899', '#8B5CF6',
  '#EF4444', '#14B8A6', '#7C3AED', '#16A34A', '#EA580C',
];

// ─── 배치 알고리즘 ────────────────────────────────────────────

// 배치 시 내부 패딩(스냅 단위)으로 사용 - 조각 원본 크기는 유지
const SNAP = 5; // 5mm 그리드

/**
 * 값을 SNAP 단위로 올림 (배치 위치 계산용)
 */
function snapUp(value: number): number {
  if (value === 0) return 0;
  return Math.ceil(value / SNAP) * SNAP;
}

/**
 * 두 사각형 충돌 여부 (1mm 여유 포함)
 */
function isOverlapping(
  ax: number, ay: number, aw: number, ah: number,
  bx: number, by: number, bw: number, bh: number,
): boolean {
  // 엄격한 겹침 검사: 경계가 딱 맞닿는 경우는 겹침 아님
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
}

/**
 * 고효율 배치 알고리즘 (다중 휴리스틱 + Best-Fit Decreasing)
 *
 * 핵심 개선 사항 (v4):
 * 1. 조각 width/height 원본값 유지 (스냅은 배치 위치에만 적용)
 * 2. 수량(quantity)만큼 개별 인스턴스로 전개
 * 3. 같은 ID 조각이 여러 개일 때 instanceIndex로 구분
 * 4. allowRotation=true: 원본/회전 모두 시도 (무늬 고정 false)
 * 5. 다중 정렬 전략(4가지)을 모두 시도하여 최소 filmHeight 선택
 * 6. Best-Fit 점수: y 가중치 + 좌측/상단 접촉 보너스로 타이트한 배치 유도
 */
export function placeFilmPieces(
  pieces: FilmPiece[],
  filmWidth: number = FILM_WIDTH,
  groupId: string = '',
  allowRotation: boolean = true,
): PlacementResult {
  // 수량 전개
  interface ExpandedPiece {
    piece: FilmPiece;
    instanceIndex: number;
  }
  const expanded: ExpandedPiece[] = [];
  for (const p of pieces) {
    const qty = Math.max(1, Math.floor(p.quantity));
    for (let i = 0; i < qty; i++) {
      expanded.push({ piece: p, instanceIndex: i });
    }
  }

  if (expanded.length === 0) {
    return { pieces: [], filmHeight: 0, filmWidth, efficiency: 0, totalArea: 0, usedArea: 0 };
  }

  // 같은 크기 그룹에 colorIndex 부여 (정렬 무관 고정)
  const sizeKey = (p: FilmPiece) => `${p.width}x${p.height}`;
  const sizeColorMap = new Map<string, number>();
  let colorCounter = 0;
  // colorIndex는 원본 조각 면적 내림차순 기준으로 부여 (일관성 유지)
  const colorOrder = [...new Set(
    [...expanded]
      .sort((a, b) => b.piece.width * b.piece.height - a.piece.width * a.piece.height)
      .map((e) => sizeKey(e.piece)),
  )];
  for (const k of colorOrder) {
    sizeColorMap.set(k, colorCounter % PIECE_COLORS.length);
    colorCounter++;
  }

  // 조각 실제 면적 합계 (quantity 포함)
  const totalArea = expanded.reduce(
    (sum, { piece }) => sum + piece.width * piece.height,
    0,
  );

  // ─── 내부 함수: 한 가지 정렬 전략으로 배치 시도 ───
  function tryStrategy(sortedPieces: ExpandedPiece[]): PlacedPiece[] {
    const placed: PlacedPiece[] = [];
    let maxY = 0;

    for (const { piece, instanceIndex } of sortedPieces) {
      const pw = piece.width;
      const ph = piece.height;

      if (pw <= 0 || ph <= 0) continue;

      // 회전 후보 목록
      type Candidate = { w: number; h: number };
      const candidates: Candidate[] = [];
      if (pw <= filmWidth) candidates.push({ w: pw, h: ph });
      if (allowRotation && ph !== pw && ph <= filmWidth) {
        candidates.push({ w: ph, h: pw });
      }
      if (candidates.length === 0) continue;

      let bestX = -1;
      let bestY = Number.MAX_SAFE_INTEGER;
      let bestScore = Number.MAX_SAFE_INTEGER;
      let bestW = pw;
      let bestH = ph;

      // 후보 위치 생성 (모서리 포인트 기반)
      // - (0, 0) 기본 시작점
      // - 이미 배치된 조각들의 우측 상단 모서리 (x+w, y)
      // - 이미 배치된 조각들의 좌측 하단 모서리 (x, y+h)
      const candidatePoints: Array<{ x: number; y: number }> = [{ x: 0, y: 0 }];
      for (const pp of placed) {
        candidatePoints.push({ x: pp.x + pp.width, y: pp.y });
        candidatePoints.push({ x: pp.x, y: pp.y + pp.height });
      }

      // 각 회전 후보 × 각 후보 위치에 대해 점수 계산 (Best-Fit)
      for (const cand of candidates) {
        const cw = cand.w;
        const ch = cand.h;

        for (const pt of candidatePoints) {
          // SNAP 정렬
          const x = Math.ceil(pt.x / SNAP) * SNAP;
          const y = Math.ceil(pt.y / SNAP) * SNAP;

          // 경계 체크
          if (x < 0 || y < 0) continue;
          if (x + cw > filmWidth) continue;

          // 충돌 체크
          let collision = false;
          for (const pp of placed) {
            if (isOverlapping(x, y, cw, ch, pp.x, pp.y, pp.width, pp.height)) {
              collision = true;
              break;
            }
          }
          if (collision) continue;

          // 점수: y가 작을수록 좋음 (1순위)
          // y 동점일 때 좌측이 작을수록 좋음 (2순위)
          // 접촉면이 길수록(이웃 조각이나 경계와 맞닿을수록) 보너스
          const touchScore = computeTouchScore(x, y, cw, ch, placed, filmWidth);
          const score = y * 10000 + x * 10 - touchScore;

          if (score < bestScore) {
            bestScore = score;
            bestX = x;
            bestY = y;
            bestW = cw;
            bestH = ch;
          }
        }
      }

      // 배치 위치를 찾지 못한 경우 현재 maxY 아래에 강제 배치
      if (bestX === -1) {
        // 원본 방향과 회전 방향 중 하나라도 배치 가능한 것 선택
        const fallback = candidates[0];
        bestX = 0;
        bestY = snapUp(maxY);
        bestW = fallback.w;
        bestH = fallback.h;
      }

      placed.push({
        id: piece.id,
        instanceIndex,
        x: bestX,
        y: bestY,
        width: bestW,
        height: bestH,
        colorIndex: sizeColorMap.get(sizeKey(piece)) ?? 0,
        groupId,
      });

      maxY = Math.max(maxY, bestY + bestH);
    }

    return placed;
  }

  // ─── 다중 정렬 전략 ───
  const strategies: Array<(a: ExpandedPiece, b: ExpandedPiece) => number> = [
    // 1. 면적 내림차순 (고전적)
    (a, b) => b.piece.width * b.piece.height - a.piece.width * a.piece.height,
    // 2. 높이 내림차순 (긴 조각 먼저)
    (a, b) => b.piece.height - a.piece.height,
    // 3. 너비 내림차순 (넓은 조각 먼저)
    (a, b) => b.piece.width - a.piece.width,
    // 4. 긴 변 내림차순
    (a, b) => Math.max(b.piece.width, b.piece.height) - Math.max(a.piece.width, a.piece.height),
  ];

  let bestPlaced: PlacedPiece[] = [];
  let bestFilmHeight = Number.MAX_SAFE_INTEGER;

  for (const sortFn of strategies) {
    const sorted = [...expanded].sort(sortFn);
    const result = tryStrategy(sorted);
    if (result.length === 0) continue;
    const fh = result.reduce((m, p) => Math.max(m, p.y + p.height), 0);
    if (fh < bestFilmHeight) {
      bestFilmHeight = fh;
      bestPlaced = result;
    }
  }

  // 전체 실패 시 빈 결과
  if (bestPlaced.length === 0) {
    return { pieces: [], filmHeight: 0, filmWidth, efficiency: 0, totalArea, usedArea: 0 };
  }

  const filmHeight = snapUp(bestFilmHeight);
  const usedArea = filmWidth * filmHeight;
  const efficiency = usedArea > 0
    ? Math.min(100, (totalArea / usedArea) * 100)
    : 0;

  return {
    pieces: bestPlaced,
    filmHeight,
    filmWidth,
    efficiency: Math.round(efficiency * 10) / 10,
    totalArea,
    usedArea,
  };
}

/**
 * Best-Fit 점수 - 접촉되는 둘레 길이 계산
 * 조각이 경계나 이웃 조각과 접촉할수록 높은 점수 반환
 */
function computeTouchScore(
  x: number, y: number, w: number, h: number,
  placed: PlacedPiece[], filmWidth: number,
): number {
  let score = 0;
  // 좌측 경계 접촉
  if (x === 0) score += h;
  // 우측 경계 접촉
  if (x + w === filmWidth) score += h;
  // 상단 경계 접촉
  if (y === 0) score += w;

  // 다른 배치된 조각과의 접촉
  for (const p of placed) {
    // 좌·우쪽 접촉 (수직 변)
    if (x === p.x + p.width || x + w === p.x) {
      const overlapY = Math.max(0, Math.min(y + h, p.y + p.height) - Math.max(y, p.y));
      score += overlapY;
    }
    // 상·하단 접촉 (수평 변)
    if (y === p.y + p.height || y + h === p.y) {
      const overlapX = Math.max(0, Math.min(x + w, p.x + p.width) - Math.max(x, p.x));
      score += overlapX;
    }
  }

  return score;
}

// ─── 자재비 계산 ─────────────────────────────────────────────

export function filmHeightToLinearM(filmHeightMm: number): number {
  return filmHeightMm / 1000;
}

export function calcMaterialCost(filmHeightMm: number, costPerM: number): number {
  return filmHeightToLinearM(filmHeightMm) * costPerM;
}

// ─── 할인율 계산 ─────────────────────────────────────────────

export function getDiscountRate(totalAreaM2: number): number {
  if (totalAreaM2 >= 10) return 0.15;
  if (totalAreaM2 >= 5)  return 0.10;
  if (totalAreaM2 >= 1)  return 0.05;
  return 0;
}

// ─── 그룹별 배치 + 견적 통합 계산 ───────────────────────────

export interface CalculationResult {
  groupResults: GroupPlacementResult[];
  invoice: Invoice;
}

/**
 * 모든 그룹을 개별 배치하고 견적을 집계한다.
 *
 * 수정 사항:
 * - combinedPlacement 제거 (그룹별 배치만 사용)
 * - 최종 금액(total.min/max)을 그룹별 합산 기준으로 정확히 계산
 *   → total.min = (자재비합계 + 시공비합계_최저가) × (1 - 할인율)
 *   → total.max = (자재비합계 + 시공비합계_최고가) × (1 - 할인율)
 *   → 현재 선택된 단가의 total = (자재비합계 + 시공비합계) × (1 - 할인율) = subtotal - discount
 */
export function calculateFromGroups(
  groups: FilmGroup[],
  materialCostPerM: number = DEFAULT_MATERIAL_COST_PER_M,
  constructionPricePerM2: number = CONSTRUCTION_PRICE_DEFAULT,
): CalculationResult {
  const groupResults: GroupPlacementResult[] = [];
  const groupInvoices: GroupInvoice[] = [];

  let totalFilmLengthM = 0;
  let totalFilmAreaM2 = 0;
  let totalMaterialCost = 0;
  let totalConstructionCost = 0;

  for (const group of groups) {
    const validPieces = group.pieces.filter(
      (p) => p.width > 0 && p.height > 0 && p.quantity > 0,
    );
    if (validPieces.length === 0) continue;

    // 그룹별 단가가 설정되어 있으면 사용, 아니면 전역 기본값
    const groupMaterialCostPerM = group.materialCostPerM ?? materialCostPerM;
    const groupConstructionPricePerM2 = group.constructionPricePerM2 ?? constructionPricePerM2;

    const placement = placeFilmPieces(validPieces, FILM_WIDTH, group.groupId, !group.patternFixed);
    const filmLengthM = filmHeightToLinearM(placement.filmHeight);
    const filmAreaM2 = FILM_WIDTH_M * filmLengthM;
    const materialCost = Math.round(filmLengthM * groupMaterialCostPerM);
    const constructionCost = Math.round(filmAreaM2 * groupConstructionPricePerM2);

    groupResults.push({
      groupId: group.groupId,
      groupName: group.groupName,
      brand: group.brand,
      filmName: group.filmName,
      placement,
      filmLengthM,
      materialCost,
      materialCostPerM: groupMaterialCostPerM,
    });

    groupInvoices.push({
      groupId: group.groupId,
      groupName: group.groupName,
      brand: group.brand,
      filmName: group.filmName,
      filmLengthM,
      filmAreaM2,
      materialCostPerM: groupMaterialCostPerM,
      materialCost,
      constructionPricePerM2: groupConstructionPricePerM2,
      constructionCost,
      subtotal: materialCost + constructionCost,
    });

    totalFilmLengthM += filmLengthM;
    totalFilmAreaM2 += filmAreaM2;
    totalMaterialCost += materialCost;
    totalConstructionCost += constructionCost;
  }

  // subtotal = 그룹별 (자재비 + 시공비) 합산 — 정확히 일치
  const subtotal = totalMaterialCost + totalConstructionCost;
  const discountRate = getDiscountRate(totalFilmAreaM2);
  const discount = Math.round(subtotal * discountRate);

  // 최저/최고 시공비 기준 범위 계산
  // 시공비 최저 = totalFilmAreaM2 × CONSTRUCTION_PRICE_MIN
  // 시공비 최고 = totalFilmAreaM2 × CONSTRUCTION_PRICE_MAX
  const constructionCostMin = Math.round(totalFilmAreaM2 * CONSTRUCTION_PRICE_MIN);
  const constructionCostMax = Math.round(totalFilmAreaM2 * CONSTRUCTION_PRICE_MAX);
  const totalMin = Math.round((totalMaterialCost + constructionCostMin) * (1 - discountRate));
  const totalMax = Math.round((totalMaterialCost + constructionCostMax) * (1 - discountRate));

  return {
    groupResults,
    invoice: {
      groupInvoices,
      totalFilmLengthM,
      totalFilmAreaM2,
      totalMaterialCost,
      totalConstructionCost,
      subtotal,
      discount,
      discountRate,
      total: { min: totalMin, max: totalMax },
      constructionPricePerM2,
    },
  };
}

// ─── 유틸리티 ─────────────────────────────────────────────────

export function formatNumber(n: number): string {
  return Math.round(n).toLocaleString('ko-KR');
}

export function formatM(m: number): string {
  return m.toFixed(2);
}

export function generatePieceId(groupName: string, index: number): string {
  return `${groupName}_${String(index + 1).padStart(2, '0')}`;
}

export function generateNextPieceId(pieces: FilmPiece[], groupName: string): string {
  if (pieces.length === 0) {
    return `${groupName}-01`;
  }
  
  const lastPiece = pieces[pieces.length - 1];
  const lastId = lastPiece.id;
  
  const dashMatch = lastId.match(/^(.+?)[-_](\d+)$/);
  
  if (dashMatch) {
    const baseName = dashMatch[1];
    const currentNum = parseInt(dashMatch[2], 10);
    const nextNum = currentNum + 1;
    return `${baseName}-${String(nextNum).padStart(2, '0')}`;
  } else {
    return `${lastId}-01`;
  }
}

export function generateGroupName(existingGroups: FilmGroup[]): string {
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  for (let i = 0; i < letters.length; i++) {
    const name = letters[i];
    if (!existingGroups.find((g) => g.groupName === name)) return name;
  }
  return `그룹${existingGroups.length + 1}`;
}
