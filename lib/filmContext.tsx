import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useReducer } from 'react';
import {
  CalculationResult,
  CONSTRUCTION_PRICE_DEFAULT,
  DEFAULT_MATERIAL_COST_PER_M,
  FilmBrand,
  FilmGroup,
  generateGroupName,
  generateNextPieceId,
  generatePieceId,
} from '@/lib/filmCutting';

// ─── 저장 프로젝트 타입 ──────────────────────────────────────

export interface SavedProject {
  id: string;           // UUID
  name: string;         // 프로젝트명
  savedAt: number;      // 저장 시각 (timestamp)
  groups: FilmGroup[];
  materialCostPerM: number;
  constructionPricePerM2: number;
}

// ─── 상태 타입 ────────────────────────────────────────────────

interface FilmState {
  projectName: string;          // 현재 프로젝트명
  groups: FilmGroup[];
  lastResult: CalculationResult | null;
  materialCostPerM: number;
  constructionPricePerM2: number;
  isLoading: boolean;
  savedProjects: SavedProject[]; // 저장된 프로젝트 목록
}

// ─── 액션 타입 ────────────────────────────────────────────────

type FilmAction =
  | { type: 'LOAD_STATE'; payload: Partial<FilmState> }
  | { type: 'SET_PROJECT_NAME'; payload: string }
  | { type: 'NEW_PROJECT' }
  | { type: 'LOAD_PROJECT'; payload: SavedProject }
  | { type: 'SAVE_PROJECT_DONE'; payload: SavedProject[] }
  | { type: 'DELETE_PROJECT_DONE'; payload: SavedProject[] }
  | { type: 'ADD_GROUP' }
  | { type: 'UPDATE_GROUP'; payload: { groupId: string; groupName: string } }
  | { type: 'UPDATE_GROUP_BRAND'; payload: { groupId: string; brand: FilmBrand } }
  | { type: 'UPDATE_GROUP_FILM_NAME'; payload: { groupId: string; filmName: string } }
  | { type: 'UPDATE_GROUP_MATERIAL_COST'; payload: { groupId: string; materialCostPerM: number | undefined } }
  | { type: 'UPDATE_GROUP_CONSTRUCTION_PRICE'; payload: { groupId: string; constructionPricePerM2: number | undefined } }
  | { type: 'DELETE_GROUP'; payload: string }
  | { type: 'ADD_PIECE'; payload: { groupId: string } }
  | { type: 'UPDATE_PIECE'; payload: { groupId: string; pieceId: string; field: 'width' | 'height' | 'quantity'; value: number } }
  | { type: 'RENAME_PIECE'; payload: { groupId: string; pieceId: string; newId: string } }
  | { type: 'DELETE_PIECE'; payload: { groupId: string; pieceId: string } }
  | { type: 'SET_RESULT'; payload: CalculationResult }
  | { type: 'CLEAR_RESULTS' }
  | { type: 'RESET_GROUPS' }
  | { type: 'SET_MATERIAL_COST_PER_M'; payload: number }
  | { type: 'SET_CONSTRUCTION_PRICE'; payload: number }
  | { type: 'SET_LOADING'; payload: boolean };

// ─── 초기 상태 ────────────────────────────────────────────────

const initialState: FilmState = {
  projectName: '새 프로젝트',
  groups: [],
  lastResult: null,
  materialCostPerM: DEFAULT_MATERIAL_COST_PER_M,
  constructionPricePerM2: CONSTRUCTION_PRICE_DEFAULT,
  isLoading: true,
  savedProjects: [],
};

// ─── 리듀서 ──────────────────────────────────────────────────

function filmReducer(state: FilmState, action: FilmAction): FilmState {
  switch (action.type) {
    case 'LOAD_STATE':
      return { ...state, ...action.payload, isLoading: false };

    case 'SET_LOADING':
      return { ...state, isLoading: action.payload };

    case 'SET_PROJECT_NAME':
      return { ...state, projectName: action.payload };

    case 'NEW_PROJECT':
      return {
        ...state,
        projectName: '새 프로젝트',
        groups: [],
        lastResult: null,
        materialCostPerM: DEFAULT_MATERIAL_COST_PER_M,
        constructionPricePerM2: CONSTRUCTION_PRICE_DEFAULT,
      };

    case 'LOAD_PROJECT':
      return {
        ...state,
        projectName: action.payload.name,
        groups: action.payload.groups,
        lastResult: null,
        materialCostPerM: action.payload.materialCostPerM,
        constructionPricePerM2: action.payload.constructionPricePerM2,
      };

    case 'SAVE_PROJECT_DONE':
      return { ...state, savedProjects: action.payload };

    case 'DELETE_PROJECT_DONE':
      return { ...state, savedProjects: action.payload };

    case 'ADD_GROUP': {
      const newName = generateGroupName(state.groups);
      const newGroup: FilmGroup = {
        groupId: Date.now().toString(),
        groupName: newName,
        brand: '영림',
        filmName: '',
        pieces: [0, 1, 2].map((i) => ({
          id: generatePieceId(newName, i),
          width: 0,
          height: 0,
          quantity: 1,
        })),
        createdAt: Date.now(),
      };
      return { ...state, groups: [...state.groups, newGroup] };
    }

    case 'UPDATE_GROUP': {
      const { groupId, groupName } = action.payload;
      return {
        ...state,
        groups: state.groups.map((g) => {
          if (g.groupId !== groupId) return g;
          return {
            ...g,
            groupName,
            pieces: g.pieces.map((p, i) => ({ ...p, id: generatePieceId(groupName, i) })),
          };
        }),
      };
    }

    case 'UPDATE_GROUP_BRAND':
      return {
        ...state,
        groups: state.groups.map((g) =>
          g.groupId === action.payload.groupId ? { ...g, brand: action.payload.brand } : g,
        ),
      };

    case 'UPDATE_GROUP_FILM_NAME':
      return {
        ...state,
        groups: state.groups.map((g) =>
          g.groupId === action.payload.groupId ? { ...g, filmName: action.payload.filmName } : g,
        ),
      };

    case 'UPDATE_GROUP_MATERIAL_COST':
      return {
        ...state,
        groups: state.groups.map((g) =>
          g.groupId === action.payload.groupId
            ? { ...g, materialCostPerM: action.payload.materialCostPerM }
            : g,
        ),
      };

    case 'UPDATE_GROUP_CONSTRUCTION_PRICE':
      return {
        ...state,
        groups: state.groups.map((g) =>
          g.groupId === action.payload.groupId
            ? { ...g, constructionPricePerM2: action.payload.constructionPricePerM2 }
            : g,
        ),
      };

    case 'DELETE_GROUP':
      return { ...state, groups: state.groups.filter((g) => g.groupId !== action.payload) };

    case 'RESET_GROUPS':
      return { ...state, groups: [], lastResult: null };

    case 'ADD_PIECE': {
      return {
        ...state,
        groups: state.groups.map((g) => {
          if (g.groupId !== action.payload.groupId) return g;
          const newId = generateNextPieceId(g.pieces, g.groupName);
          return {
            ...g,
            pieces: [
              ...g.pieces,
              { id: newId, width: 0, height: 0, quantity: 1 },
            ],
          };
        }),
      };
    }

    case 'UPDATE_PIECE': {
      const { groupId, pieceId, field, value } = action.payload;
      return {
        ...state,
        groups: state.groups.map((g) => {
          if (g.groupId !== groupId) return g;
          return { ...g, pieces: g.pieces.map((p) => p.id === pieceId ? { ...p, [field]: value } : p) };
        }),
      };
    }

    case 'RENAME_PIECE': {
      const { groupId, pieceId, newId } = action.payload;
      const trimmed = newId.trim();
      if (!trimmed) return state;
      return {
        ...state,
        groups: state.groups.map((g) => {
          if (g.groupId !== groupId) return g;
          // 중복 ID 체크
          if (g.pieces.some((p) => p.id === trimmed && p.id !== pieceId)) return g;
          return { ...g, pieces: g.pieces.map((p) => p.id === pieceId ? { ...p, id: trimmed } : p) };
        }),
      };
    }
    case 'DELETE_PIECE': {
      const { groupId, pieceId } = action.payload;
      return {
        ...state,
        groups: state.groups.map((g) => {
          if (g.groupId !== groupId) return g;
          const filtered = g.pieces.filter((p) => p.id !== pieceId);
          return { ...g, pieces: filtered.map((p, i) => ({ ...p, id: generatePieceId(g.groupName, i) })) };
        }),
      };
    }

    case 'SET_RESULT':
      return { ...state, lastResult: action.payload };

    case 'CLEAR_RESULTS':
      return { ...state, lastResult: null };

    case 'SET_MATERIAL_COST_PER_M':
      return { ...state, materialCostPerM: action.payload };

    case 'SET_CONSTRUCTION_PRICE':
      return { ...state, constructionPricePerM2: action.payload };

    default:
      return state;
  }
}

// ─── AsyncStorage 키 ─────────────────────────────────────────

const STORAGE_KEYS = {
  groups: 'filmGroups_v3',
  materialCostPerM: 'materialCostPerM_v2',
  constructionPrice: 'constructionPricePerM2',
  projectName: 'currentProjectName',
  savedProjects: 'savedProjects_v1',
};

const MAX_SAVED_PROJECTS = 20;

// ─── Context ─────────────────────────────────────────────────

interface FilmContextValue {
  state: FilmState;
  dispatch: React.Dispatch<FilmAction>;
  saveCurrentProject: () => Promise<void>;
  loadProject: (project: SavedProject) => void;
  deleteProject: (id: string) => Promise<void>;
  startNewProject: () => void;
}

const FilmContext = createContext<FilmContextValue | null>(null);

export function FilmProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(filmReducer, initialState);

  // 앱 시작 시 데이터 로드
  useEffect(() => {
    (async () => {
      try {
        const [groupsRaw, costRaw, priceRaw, nameRaw, projectsRaw] = await Promise.all([
          AsyncStorage.getItem(STORAGE_KEYS.groups),
          AsyncStorage.getItem(STORAGE_KEYS.materialCostPerM),
          AsyncStorage.getItem(STORAGE_KEYS.constructionPrice),
          AsyncStorage.getItem(STORAGE_KEYS.projectName),
          AsyncStorage.getItem(STORAGE_KEYS.savedProjects),
        ]);
        dispatch({
          type: 'LOAD_STATE',
          payload: {
            groups: groupsRaw ? JSON.parse(groupsRaw) : [],
            materialCostPerM: costRaw ? parseFloat(costRaw) : DEFAULT_MATERIAL_COST_PER_M,
            constructionPricePerM2: priceRaw ? parseFloat(priceRaw) : CONSTRUCTION_PRICE_DEFAULT,
            projectName: nameRaw ?? '새 프로젝트',
            savedProjects: projectsRaw ? JSON.parse(projectsRaw) : [],
          },
        });
      } catch {
        dispatch({ type: 'SET_LOADING', payload: false });
      }
    })();
  }, []);

  // 자동 저장
  useEffect(() => {
    if (state.isLoading) return;
    AsyncStorage.setItem(STORAGE_KEYS.groups, JSON.stringify(state.groups));
  }, [state.groups, state.isLoading]);

  useEffect(() => {
    if (state.isLoading) return;
    AsyncStorage.setItem(STORAGE_KEYS.materialCostPerM, String(state.materialCostPerM));
  }, [state.materialCostPerM, state.isLoading]);

  useEffect(() => {
    if (state.isLoading) return;
    AsyncStorage.setItem(STORAGE_KEYS.constructionPrice, String(state.constructionPricePerM2));
  }, [state.constructionPricePerM2, state.isLoading]);

  useEffect(() => {
    if (state.isLoading) return;
    AsyncStorage.setItem(STORAGE_KEYS.projectName, state.projectName);
  }, [state.projectName, state.isLoading]);

  // 현재 프로젝트 저장
  const saveCurrentProject = useCallback(async () => {
    const existing = state.savedProjects;
    const now = Date.now();

    // 같은 이름의 프로젝트가 있으면 덮어쓰기
    const sameNameIdx = existing.findIndex((p) => p.name === state.projectName);
    const newProject: SavedProject = {
      id: sameNameIdx >= 0 ? existing[sameNameIdx].id : now.toString(),
      name: state.projectName,
      savedAt: now,
      groups: state.groups,
      materialCostPerM: state.materialCostPerM,
      constructionPricePerM2: state.constructionPricePerM2,
    };

    let updated: SavedProject[];
    if (sameNameIdx >= 0) {
      updated = existing.map((p, i) => i === sameNameIdx ? newProject : p);
    } else {
      // 최대 20개 제한: 가장 오래된 것 제거
      const trimmed = existing.length >= MAX_SAVED_PROJECTS
        ? [...existing.slice(1)]
        : [...existing];
      updated = [...trimmed, newProject];
    }

    // 최신순 정렬
    updated.sort((a, b) => b.savedAt - a.savedAt);

    await AsyncStorage.setItem(STORAGE_KEYS.savedProjects, JSON.stringify(updated));
    dispatch({ type: 'SAVE_PROJECT_DONE', payload: updated });
  }, [state]);

  // 프로젝트 불러오기
  const loadProject = useCallback((project: SavedProject) => {
    dispatch({ type: 'LOAD_PROJECT', payload: project });
  }, []);

  // 프로젝트 삭제
  const deleteProject = useCallback(async (id: string) => {
    const updated = state.savedProjects.filter((p) => p.id !== id);
    await AsyncStorage.setItem(STORAGE_KEYS.savedProjects, JSON.stringify(updated));
    dispatch({ type: 'DELETE_PROJECT_DONE', payload: updated });
  }, [state.savedProjects]);

  // 새 프로젝트 시작
  const startNewProject = useCallback(() => {
    dispatch({ type: 'NEW_PROJECT' });
  }, []);

  return (
    <FilmContext.Provider value={{ state, dispatch, saveCurrentProject, loadProject, deleteProject, startNewProject }}>
      {children}
    </FilmContext.Provider>
  );
}

export function useFilm(): FilmContextValue {
  const ctx = useContext(FilmContext);
  if (!ctx) throw new Error('useFilm must be used within a FilmProvider');
  return ctx;
}
