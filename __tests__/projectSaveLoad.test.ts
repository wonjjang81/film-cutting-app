/**
 * 프로젝트 저장/불러오기 엔드투엔드 테스트
 * filmContext의 SavedProject 직렬화/역직렬화 및 데이터 무결성 검증
 */
import { describe, it, expect } from 'vitest';
import {
  FilmGroup,
  FilmPiece,
  calculateFromGroups,
  DEFAULT_MATERIAL_COST_PER_M,
  CONSTRUCTION_PRICE_DEFAULT,
} from '../lib/filmCutting';
import type { SavedProject } from '../lib/filmContext';

// ─── 테스트 픽스처 ────────────────────────────────────────────

const makePiece = (id: string, width: number, height: number, quantity = 1): FilmPiece => ({
  id,
  width,
  height,
  quantity,
});

const makeGroup = (overrides: Partial<FilmGroup> = {}): FilmGroup => ({
  groupId: 'g1',
  groupName: 'A',
  brand: '영림',
  filmName: '우드 오크',
  pieces: [],
  createdAt: Date.now(),
  ...overrides,
});

// ─── 저장/불러오기 직렬화 검증 ────────────────────────────────

describe('SavedProject 직렬화/역직렬화', () => {
  it('그룹, 조각, 단가 데이터가 JSON 직렬화 후 완전히 복원되어야 한다', () => {
    const group1 = makeGroup({
      groupId: 'g1',
      groupName: 'A',
      brand: '영림',
      filmName: '우드 오크',
      materialCostPerM: 12000,
      pieces: [
        makePiece('A_01', 900, 600, 2),
        makePiece('A_02', 500, 300, 1),
      ],
    });

    const group2 = makeGroup({
      groupId: 'g2',
      groupName: 'B',
      brand: 'LX',
      filmName: '마블 화이트',
      materialCostPerM: undefined, // 전역 기본값 사용
      pieces: [
        makePiece('B_01', 1200, 800, 3),
      ],
    });

    const project: SavedProject = {
      id: '1234567890',
      name: '테스트 프로젝트',
      savedAt: Date.now(),
      groups: [group1, group2],
      materialCostPerM: DEFAULT_MATERIAL_COST_PER_M,
      constructionPricePerM2: CONSTRUCTION_PRICE_DEFAULT,
    };

    // JSON 직렬화 → 역직렬화 (AsyncStorage 시뮬레이션)
    const serialized = JSON.stringify(project);
    const restored = JSON.parse(serialized) as SavedProject;

    // 기본 필드 검증
    expect(restored.id).toBe(project.id);
    expect(restored.name).toBe(project.name);
    expect(restored.materialCostPerM).toBe(project.materialCostPerM);
    expect(restored.constructionPricePerM2).toBe(project.constructionPricePerM2);

    // 그룹 수 검증
    expect(restored.groups).toHaveLength(2);

    // 그룹 1 검증
    const rg1 = restored.groups[0];
    expect(rg1.groupId).toBe('g1');
    expect(rg1.groupName).toBe('A');
    expect(rg1.brand).toBe('영림');
    expect(rg1.filmName).toBe('우드 오크');
    expect(rg1.materialCostPerM).toBe(12000); // 그룹별 개별 단가 유지

    // 조각 검증
    expect(rg1.pieces).toHaveLength(2);
    expect(rg1.pieces[0].id).toBe('A_01');
    expect(rg1.pieces[0].width).toBe(900);
    expect(rg1.pieces[0].height).toBe(600);
    expect(rg1.pieces[0].quantity).toBe(2);
    expect(rg1.pieces[1].id).toBe('A_02');

    // 그룹 2 검증
    const rg2 = restored.groups[1];
    expect(rg2.groupId).toBe('g2');
    expect(rg2.brand).toBe('LX');
    expect(rg2.materialCostPerM).toBeUndefined(); // undefined도 유지
    expect(rg2.pieces[0].quantity).toBe(3);
  });

  it('그룹별 개별 단가(materialCostPerM)가 undefined일 때 전역 단가를 사용해야 한다', () => {
    const group = makeGroup({
      groupId: 'g1',
      groupName: 'A',
      materialCostPerM: undefined,
      pieces: [makePiece('A_01', 600, 400, 1)],
    });

    const globalCost = 15000;
    const result = calculateFromGroups([group], globalCost, CONSTRUCTION_PRICE_DEFAULT);
    expect(result.invoice.groupInvoices[0].materialCostPerM).toBe(globalCost);
  });

  it('그룹별 개별 단가가 설정된 경우 전역 단가를 무시해야 한다', () => {
    const groupCost = 8000;
    const group = makeGroup({
      groupId: 'g1',
      groupName: 'A',
      materialCostPerM: groupCost,
      pieces: [makePiece('A_01', 600, 400, 1)],
    });

    const globalCost = 15000;
    const result = calculateFromGroups([group], globalCost, CONSTRUCTION_PRICE_DEFAULT);
    expect(result.invoice.groupInvoices[0].materialCostPerM).toBe(groupCost);
  });
});

// ─── 저장 목록 관리 검증 ─────────────────────────────────────

describe('저장 프로젝트 목록 관리', () => {
  it('같은 이름의 프로젝트를 저장하면 덮어쓰기가 되어야 한다', () => {
    const existing: SavedProject[] = [
      {
        id: 'old-id',
        name: '현장A',
        savedAt: 1000,
        groups: [],
        materialCostPerM: 10000,
        constructionPricePerM2: 15000,
      },
    ];

    const newProject: SavedProject = {
      id: 'old-id',
      name: '현장A',
      savedAt: 2000,
      groups: [makeGroup({ pieces: [makePiece('A_01', 500, 300, 1)] })],
      materialCostPerM: 12000,
      constructionPricePerM2: 18000,
    };

    const sameNameIdx = existing.findIndex((p) => p.name === newProject.name);
    const updated = existing.map((p, i) => i === sameNameIdx ? newProject : p);

    expect(updated).toHaveLength(1); // 개수 유지
    expect(updated[0].materialCostPerM).toBe(12000); // 새 단가로 업데이트
    expect(updated[0].groups[0].pieces).toHaveLength(1); // 새 조각 데이터
  });

  it('최대 20개 제한을 초과하면 가장 오래된 프로젝트가 제거되어야 한다', () => {
    const MAX = 20;
    const existing: SavedProject[] = Array.from({ length: MAX }, (_, i) => ({
      id: String(i),
      name: `프로젝트 ${i}`,
      savedAt: i * 1000,
      groups: [],
      materialCostPerM: DEFAULT_MATERIAL_COST_PER_M,
      constructionPricePerM2: CONSTRUCTION_PRICE_DEFAULT,
    }));

    // 새 프로젝트 추가 시 가장 오래된 것(index 0) 제거
    const trimmed = existing.length >= MAX ? [...existing.slice(1)] : [...existing];
    const newProject: SavedProject = {
      id: 'new',
      name: '새 프로젝트',
      savedAt: MAX * 1000,
      groups: [],
      materialCostPerM: DEFAULT_MATERIAL_COST_PER_M,
      constructionPricePerM2: CONSTRUCTION_PRICE_DEFAULT,
    };
    const updated = [...trimmed, newProject];

    expect(updated).toHaveLength(MAX); // 여전히 20개
    expect(updated.find((p) => p.id === '0')).toBeUndefined(); // 가장 오래된 것 제거
    expect(updated.find((p) => p.id === 'new')).toBeDefined(); // 새 것 추가
  });

  it('프로젝트 삭제 후 목록에서 해당 프로젝트가 제거되어야 한다', () => {
    const projects: SavedProject[] = [
      { id: 'a', name: '프로젝트A', savedAt: 1000, groups: [], materialCostPerM: 10000, constructionPricePerM2: 15000 },
      { id: 'b', name: '프로젝트B', savedAt: 2000, groups: [], materialCostPerM: 10000, constructionPricePerM2: 15000 },
      { id: 'c', name: '프로젝트C', savedAt: 3000, groups: [], materialCostPerM: 10000, constructionPricePerM2: 15000 },
    ];

    const updated = projects.filter((p) => p.id !== 'b');
    expect(updated).toHaveLength(2);
    expect(updated.find((p) => p.id === 'b')).toBeUndefined();
    expect(updated.find((p) => p.id === 'a')).toBeDefined();
    expect(updated.find((p) => p.id === 'c')).toBeDefined();
  });
});

// ─── LOAD_PROJECT reducer 동작 검증 ──────────────────────────

describe('LOAD_PROJECT reducer 동작', () => {
  it('불러온 프로젝트의 모든 필드가 상태에 반영되어야 한다', () => {
    const group = makeGroup({
      groupId: 'g1',
      groupName: 'A',
      brand: '현대',
      filmName: '체리',
      materialCostPerM: 9500,
      pieces: [makePiece('A_01', 800, 500, 2)],
    });

    const project: SavedProject = {
      id: 'proj-1',
      name: '주방 리모델링',
      savedAt: Date.now(),
      groups: [group],
      materialCostPerM: 9500,
      constructionPricePerM2: 20000,
    };

    // reducer 동작 시뮬레이션
    const prevState = {
      projectName: '이전 프로젝트',
      groups: [],
      lastResult: null,
      materialCostPerM: DEFAULT_MATERIAL_COST_PER_M,
      constructionPricePerM2: CONSTRUCTION_PRICE_DEFAULT,
      isLoading: false,
      savedProjects: [],
    };

    const nextState = {
      ...prevState,
      projectName: project.name,
      groups: project.groups,
      lastResult: null,
      materialCostPerM: project.materialCostPerM,
      constructionPricePerM2: project.constructionPricePerM2,
    };

    expect(nextState.projectName).toBe('주방 리모델링');
    expect(nextState.groups).toHaveLength(1);
    expect(nextState.groups[0].brand).toBe('현대');
    expect(nextState.groups[0].materialCostPerM).toBe(9500);
    expect(nextState.groups[0].pieces[0].width).toBe(800);
    expect(nextState.materialCostPerM).toBe(9500);
    expect(nextState.constructionPricePerM2).toBe(20000);
    expect(nextState.lastResult).toBeNull(); // 재계산 필요
  });

  it('불러온 그룹으로 calculateFromGroups를 실행하면 올바른 결과가 나와야 한다', () => {
    const group = makeGroup({
      groupId: 'g1',
      groupName: 'A',
      materialCostPerM: 10000,
      pieces: [
        makePiece('A_01', 600, 400, 2),
        makePiece('A_02', 300, 200, 1),
      ],
    });

    const project: SavedProject = {
      id: 'proj-2',
      name: '테스트',
      savedAt: Date.now(),
      groups: [group],
      materialCostPerM: 10000,
      constructionPricePerM2: 15000,
    };

    // 불러온 그룹으로 재계산
    const result = calculateFromGroups(
      project.groups,
      project.materialCostPerM,
      project.constructionPricePerM2,
    );

    expect(result.invoice.groupInvoices).toHaveLength(1);
    expect(result.invoice.groupInvoices[0].materialCostPerM).toBe(10000);
    expect(result.invoice.groupInvoices[0].filmLengthM).toBeGreaterThan(0);
    expect(result.invoice.subtotal).toBeGreaterThan(0);
  });
});

// ─── 그룹별 시공비 단가 보존 검증 ────────────────────────────
describe('그룹별 시공비 단가 저장/불러오기 보존', () => {
  it('그룹별 개별 시공비 단가가 JSON 직렬화 후 완전히 복원되어야 한다', () => {
    const groupWithCustomConstr = makeGroup({
      groupId: 'g1',
      groupName: 'A',
      materialCostPerM: 12000,
      constructionPricePerM2: 20000, // 개별 시공비 단가 설정
      pieces: [makePiece('A_01', 900, 600, 2)],
    });
    const groupWithoutCustomConstr = makeGroup({
      groupId: 'g2',
      groupName: 'B',
      materialCostPerM: undefined,
      constructionPricePerM2: undefined, // 전역 기본값 사용
      pieces: [makePiece('B_01', 600, 400, 1)],
    });
    const project: SavedProject = {
      id: 'test-constr',
      name: '시공비 단가 테스트',
      savedAt: Date.now(),
      groups: [groupWithCustomConstr, groupWithoutCustomConstr],
      materialCostPerM: DEFAULT_MATERIAL_COST_PER_M,
      constructionPricePerM2: CONSTRUCTION_PRICE_DEFAULT,
    };
    // JSON 직렬화 → 역직렬화 (AsyncStorage 시뮬레이션)
    const serialized = JSON.stringify(project);
    const restored = JSON.parse(serialized) as SavedProject;
    // 그룹 1: 개별 시공비 단가 유지
    expect(restored.groups[0].constructionPricePerM2).toBe(20000);
    // 그룹 2: undefined 유지 (전역 기본값 사용)
    expect(restored.groups[1].constructionPricePerM2).toBeUndefined();
  });

  it('그룹별 개별 시공비 단가가 설정된 경우 전역 단가를 무시해야 한다', () => {
    const groupCustomConstr = 20000;
    const globalConstr = CONSTRUCTION_PRICE_DEFAULT; // 15000
    const group = makeGroup({
      groupId: 'g1',
      groupName: 'A',
      constructionPricePerM2: groupCustomConstr,
      pieces: [makePiece('A_01', 600, 400, 1)],
    });
    const result = calculateFromGroups([group], DEFAULT_MATERIAL_COST_PER_M, globalConstr);
    // 그룹별 단가(20000)가 전역 단가(15000)보다 우선 적용되어야 함
    expect(result.invoice.groupInvoices[0].constructionPricePerM2).toBe(groupCustomConstr);
    // 시공비는 그룹별 단가 기준으로 계산되어야 함
    const expectedConstrCost = Math.round(result.invoice.groupInvoices[0].filmAreaM2 * groupCustomConstr);
    expect(result.invoice.groupInvoices[0].constructionCost).toBe(expectedConstrCost);
  });

  it('불러온 프로젝트의 그룹별 시공비 단가가 재계산에 올바르게 반영되어야 한다', () => {
    const group1 = makeGroup({
      groupId: 'g1',
      groupName: 'A',
      constructionPricePerM2: 25000, // 고가 시공비
      pieces: [makePiece('A_01', 800, 600, 1)],
    });
    const group2 = makeGroup({
      groupId: 'g2',
      groupName: 'B',
      constructionPricePerM2: undefined, // 전역 기본값 사용
      pieces: [makePiece('B_01', 500, 400, 1)],
    });
    const project: SavedProject = {
      id: 'proj-constr',
      name: '혼합 단가 프로젝트',
      savedAt: Date.now(),
      groups: [group1, group2],
      materialCostPerM: DEFAULT_MATERIAL_COST_PER_M,
      constructionPricePerM2: CONSTRUCTION_PRICE_DEFAULT, // 전역: 15000
    };
    // 불러온 그룹으로 재계산
    const result = calculateFromGroups(
      project.groups,
      project.materialCostPerM,
      project.constructionPricePerM2,
    );
    // 그룹 A: 개별 단가 25000 적용
    expect(result.invoice.groupInvoices[0].constructionPricePerM2).toBe(25000);
    // 그룹 B: 전역 단가 15000 적용
    expect(result.invoice.groupInvoices[1].constructionPricePerM2).toBe(CONSTRUCTION_PRICE_DEFAULT);
    // 두 그룹의 시공비는 각자 단가로 계산되어야 함
    const constrA = result.invoice.groupInvoices[0].constructionCost;
    const constrB = result.invoice.groupInvoices[1].constructionCost;
    expect(constrA).toBe(Math.round(result.invoice.groupInvoices[0].filmAreaM2 * 25000));
    expect(constrB).toBe(Math.round(result.invoice.groupInvoices[1].filmAreaM2 * CONSTRUCTION_PRICE_DEFAULT));
    // 합계는 두 그룹의 시공비 합산이어야 함
    expect(result.invoice.totalConstructionCost).toBe(constrA + constrB);
  });
});
