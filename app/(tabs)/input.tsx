import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';
import { Platform, ScrollView, StyleSheet, Switch, Text, TextInput, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';

import { compareContinuousRollCandidates, type ContinuousRollCandidateComparison, type Placement } from '../../src/features/cutting/optimizeContinuousRollLayout';
import { createLayoutSvgMarkup } from '../../src/features/cutting/createLayoutSvgMarkup';
import { createCsv } from '../../src/features/export/createCsv';
import { createWorkOrderHtml } from '../../src/features/export/createWorkOrderHtml';
import { LibraryDrawer } from '../../src/features/library/LibraryDrawer';
import { createAppLibraryRepository } from '../../src/features/library/libraryRepositoryFactory';
import type { InventoryDelta } from '../../src/features/library/libraryRepository';
import type { FilmPreset, FilmRemnant, LibraryDocument, SavedCuttingJob, SavedMergedCuttingJob, SavedProject } from '../../src/features/library/models';
import { composePieceId, defaultPieceId, nextPieceId, pieceNamePart, validatePieceId } from '../../src/features/library/pieceIds';
import { DEFAULT_BRANDS, isDefaultBrand, normalizeBrandList } from '../../src/features/library/brandOptions';
import { normalizeGroupDisplayId, validateGroupDisplayId } from '../../src/features/library/groupIdentifiers';
import { updateGroupIdentity } from '../../src/features/library/groupIdentity';
import { AUTO_SAVE_HISTORY_STORAGE_KEY, parseAutoSaveHistory } from '../../src/features/library/autoSaveHistory';
import { buildSavedCuttingJob, createUniqueUiId, type CuttingFormState, toRemnantPlanRequest } from '../../src/features/library/uiWorkflowHelpers';
import { planWithRemnants, type RemnantPlan, type RemnantPlanRequest } from '../../src/features/remnants/planWithRemnants';
import { AUTO_MERGE_GROUP_ID, DISABLED_MERGE_GROUP_ID, planGroupedPieces, planMergedGroups, type GroupedPiecePlan, type GroupedPieceRequest, type MergedGroupPlan } from '../../src/features/remnants/planGroupedPieces';
import { RemnantInventoryPanel, type PlannedRemnantSummary, type RemnantDraft } from '../../src/features/remnants/RemnantInventoryPanel';
import { createCurrentEstimateSnapshot, CURRENT_GROUP_ESTIMATE_STORAGE_KEY } from '../../src/features/estimate/currentGroupEstimate';
import { PIECE_INPUT_UNIT_HINT, commitSubgroupName, flattenSubgroupCards, hasAssignedSubgroups, normalizeSubgroupNameDraft, subgroupCardStackIndex, subgroupPieceDisplayName, subgroupPieceNamePart } from '../../src/features/library/subgroupCards';

const repository = createAppLibraryRepository();
const emptyLibrary: LibraryDocument = { version: 1, presets: [], jobs: [], remnants: [], mergedJobs: [] };
const BRANDS_STORAGE_KEY = 'film-cutting-brand-options-v1';
const FIXED_ROLL_WIDTH_MM = 1220;
const DEFAULT_GAP_MM = 0;
const DEFAULT_SIDE_MARGIN_MM = 5;
const DEFAULT_START_END_MARGIN_MM = 5;
const initialForm: CuttingFormState = {
  brand: DEFAULT_BRANDS[0], productNumber: '', rollWidth: String(FIXED_ROLL_WIDTH_MM), pieceWidth: '0', pieceLength: '0',
  quantity: '1', gap: String(DEFAULT_GAP_MM), sideMargin: String(DEFAULT_SIDE_MARGIN_MM), startEndMargin: String(DEFAULT_START_END_MARGIN_MM), allowRotation: true,
};
type CuttingPieceDraft = { id: string; name: string; form: CuttingFormState };
type CuttingSubgroupDraft = { id: string; name: string; pieceIds: string[]; expanded: boolean };
type CuttingGroupDraft = { id: string; displayId: string; name: string; form: CuttingFormState; pieces: CuttingPieceDraft[]; subgroups: CuttingSubgroupDraft[]; mergeGroupId?: string; filmName: string; materialCostPerM: string; constructionCostPerM2: string };
type PendingBatchSave = { jobs: SavedCuttingJob[]; mergedJobs: SavedMergedCuttingJob[] };
type SavedPiecePlanView = {
  plan: RemnantPlan | null;
  planRequest: RemnantPlanRequest | null;
  draftJob: SavedCuttingJob | null;
  manualPlacements: Placement[] | null;
  checkedPlacementIds: number[];
  candidateComparison: ContinuousRollCandidateComparison[];
  confirmed: boolean;
  cuttingComplete: boolean;
};
type SavedGroupPlanView = {
  pieces: Record<string, SavedPiecePlanView>;
  batchPlans: GroupedPiecePlan[] | null;
  mergedGroupPlans: MergedGroupPlan[];
  pendingBatchSave: PendingBatchSave | null;
};
function newPieceDraft(groupName: string, index: number): CuttingPieceDraft {
  const id = defaultPieceId(groupName, index);
  return { id, name: id, form: { ...initialForm } };
}
function subgroupNameForIndex(index: number): string {
  let value = Math.max(0, index);
  let name = '';
  do { name = String.fromCharCode(65 + (value % 26)) + name; value = Math.floor(value / 26) - 1; } while (value >= 0);
  return name;
}
function newGroupDraft(index: number, withInitialPieces = true): CuttingGroupDraft {
  // The legacy app opened each group with three editable piece rows. Keep
  // those rows available while allowing untouched 0×0 rows to be ignored by
  // calculation, just as the legacy group estimator did.
  const groupName = `그룹 ${index}`;
  const pieces = withInitialPieces ? [1, 2, 3].map((pieceIndex) => newPieceDraft(groupName, pieceIndex)) : [];
  return { id: index === 1 ? 'group-1' : `group-${Date.now()}-${index}`, displayId: String(index), name: groupName, form: pieces[0]?.form ?? { ...initialForm }, pieces, subgroups: pieces.length > 0 ? [{ id: `${groupName}-subgroup-A`, name: 'A', pieceIds: pieces.map((piece) => piece.id), expanded: true }] : [], mergeGroupId: AUTO_MERGE_GROUP_ID, filmName: '', materialCostPerM: '', constructionCostPerM2: '' };
}
const statusCopy = {
  exact: { title: '완전 최적', detail: '안전 예산 안에서 전체 우선순위를 정확히 계산했습니다.', tone: '#047857', bg: '#ecfdf5' },
  certified: { title: '하한 인증', detail: '원단 절약 경로가 물리적 최소 길이에 도달했습니다.', tone: '#0369a1', bg: '#e0f2fe' },
  approximate: { title: '원단 절약 계산', detail: '브라우저 안전 경로의 결과이며 전역 최적을 보장하지 않습니다.', tone: '#b45309', bg: '#fffbeb' },
} as const;

export default function FilmCutInputScreen() {
  const { jobId: routeJobId, projectId: routeProjectId, newProject: routeNewProject } = useLocalSearchParams<{ jobId?: string; projectId?: string; newProject?: string }>();
  const routedJobRef = useRef<string | null>(null);
  const routedProjectRef = useRef<string | null>(null);
  const { width } = useWindowDimensions();
  const libraryWide = width >= 1160;
  const [form, setForm] = useState<CuttingFormState>(initialForm);
  const [groups, setGroups] = useState<CuttingGroupDraft[]>(() => [newGroupDraft(1)]);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [projectName, setProjectName] = useState('새 프로젝트');
  const [activeGroupId, setActiveGroupId] = useState('group-1');
  const [activePieceId, setActivePieceId] = useState('piece-1');
  const [library, setLibrary] = useState<LibraryDocument>(emptyLibrary);
  const [plan, setPlan] = useState<RemnantPlan | null>(null);
  const [planRequest, setPlanRequest] = useState<RemnantPlanRequest | null>(null);
  const [draftJob, setDraftJob] = useState<SavedCuttingJob | null>(null);
  const [useRemnants, setUseRemnants] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [cuttingComplete, setCuttingComplete] = useState(false);
  const [manualPlacements, setManualPlacements] = useState<Placement[] | null>(null);
  const [checkedPlacementIds, setCheckedPlacementIds] = useState<number[]>([]);
  const [candidateComparison, setCandidateComparison] = useState<ContinuousRollCandidateComparison[]>([]);
  const [batchPlans, setBatchPlans] = useState<GroupedPiecePlan[] | null>(null);
  const [mergedGroupPlans, setMergedGroupPlans] = useState<MergedGroupPlan[]>([]);
  const [autoSaveHistory, setAutoSaveHistory] = useState(false);
  const [pendingBatchSave, setPendingBatchSave] = useState<PendingBatchSave | null>(null);
  const [savedGroupPlanViews, setSavedGroupPlanViews] = useState<Record<string, SavedGroupPlanView>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const identifiersReady = form.brand.trim().length > 0;
  const activeSourceId = `${activeGroupId}-${activePieceId}`;
  const activeMergedPlan = useMemo(
    () => mergedGroupPlans.find((item) => item.sourceIds.includes(activeSourceId)) ?? null,
    [activeSourceId, mergedGroupPlans],
  );
  const activeMergedJob = useMemo(
    () => activeMergedPlan
      ? [...library.mergedJobs, ...(pendingBatchSave?.mergedJobs ?? [])].find((job) => job.mergeGroupId === activeMergedPlan.mergeGroupId && job.sourceJobIds.includes(draftJob?.id ?? ''))
      : undefined,
    [activeMergedPlan, draftJob?.id, library.mergedJobs, pendingBatchSave],
  );
  const saveActivePlanView = useCallback(() => {
    if (!plan && !planRequest && !draftJob && !batchPlans && mergedGroupPlans.length === 0) return;
    setSavedGroupPlanViews((current) => {
      const groupView = current[activeGroupId];
      return {
        ...current,
        [activeGroupId]: {
          pieces: {
            ...(groupView?.pieces ?? {}),
            [activePieceId]: { plan, planRequest, draftJob, manualPlacements, checkedPlacementIds: [...checkedPlacementIds], candidateComparison: [...candidateComparison], confirmed, cuttingComplete },
          },
          batchPlans,
          mergedGroupPlans,
          pendingBatchSave,
        },
      };
    });
  }, [activeGroupId, activePieceId, batchPlans, candidateComparison, checkedPlacementIds, confirmed, cuttingComplete, draftJob, manualPlacements, mergedGroupPlans, pendingBatchSave, plan, planRequest]);

  const restorePlanView = useCallback((groupId: string, pieceId: string) => {
    const groupView = savedGroupPlanViews[groupId];
    const pieceView = groupView?.pieces[pieceId];
    setPlan(pieceView?.plan ?? null);
    setPlanRequest(pieceView?.planRequest ?? null);
    setDraftJob(pieceView?.draftJob ?? null);
    setManualPlacements(pieceView?.manualPlacements ?? null);
    setCheckedPlacementIds(pieceView?.checkedPlacementIds ?? []);
    setCandidateComparison(pieceView?.candidateComparison ?? []);
    setConfirmed(pieceView?.confirmed ?? false);
    setCuttingComplete(pieceView?.cuttingComplete ?? false);
    setBatchPlans(groupView?.batchPlans ?? null);
    setMergedGroupPlans(groupView?.mergedGroupPlans ?? []);
    setPendingBatchSave(groupView?.pendingBatchSave ?? null);
  }, [savedGroupPlanViews]);

  const refreshLibrary = useCallback(async (): Promise<LibraryDocument> => {
    const loaded = await repository.load();
    setLibrary(loaded.document);
    if (loaded.warnings.length > 0) setNotice(loaded.warnings.join(' '));
    return loaded.document;
  }, []);

  const restoreProject = useCallback((project: SavedProject, document: LibraryDocument) => {
    const savedJobs = project.jobIds
      .map((id) => document.jobs.find((job) => job.id === id))
      .filter((job): job is SavedCuttingJob => Boolean(job));
    if (savedJobs.length === 0) {
      // Projects can now be created from the project tab before the first
      // cutting calculation. Keep the persisted project identity while
      // opening a fresh editable group for the first piece.
      const fresh = newGroupDraft(1);
      setProjectId(project.id); setProjectName(project.name); setGroups([fresh]); setActiveGroupId(fresh.id); setActivePieceId(fresh.pieces[0]!.id); setForm(fresh.form);
      setPlan(null); setPlanRequest(null); setDraftJob(null); setPendingBatchSave(null); setBatchPlans(null); setMergedGroupPlans([]); setSavedGroupPlanViews({}); setCandidateComparison([]); setConfirmed(false); setCuttingComplete(false); setManualPlacements(null); setCheckedPlacementIds([]);
      return;
    }
    const mergeGroupByName = new Map<string, string>();
    project.mergedJobIds.forEach((id) => {
      const merged = document.mergedJobs.find((job) => job.id === id);
      merged?.groupNames.forEach((name) => mergeGroupByName.set(name, merged.mergeGroupId));
    });
    const restoredGroups: CuttingGroupDraft[] = [];
    const groupsByName = new Map<string, CuttingGroupDraft>();
    savedJobs.forEach((job, index) => {
      const [groupLabel, ...pieceLabel] = job.name.split(' · ');
      const groupName = groupLabel?.trim() || `그룹 ${index + 1}`;
      const pieceName = pieceLabel.join(' · ').replace(/ 작업$/, '').trim() || `조각 ${index + 1}`;
      let group = groupsByName.get(groupName);
      if (!group) {
        group = { id: `${project.id}-group-${restoredGroups.length + 1}`, displayId: String(restoredGroups.length + 1), name: groupName, form: formFromSavedJob(job), pieces: [], subgroups: [], mergeGroupId: mergeGroupByName.get(groupName) ?? AUTO_MERGE_GROUP_ID, filmName: job.filmName ?? '', materialCostPerM: job.materialCostPerM === undefined ? '' : String(job.materialCostPerM), constructionCostPerM2: job.constructionCostPerM2 === undefined ? '' : String(job.constructionCostPerM2) };
        groupsByName.set(groupName, group); restoredGroups.push(group);
      }
      // Saved jobs use a generated storage ID, while the legacy UI exposes
      // the human-readable piece ID in the job name. Restore that ID so the
      // batch list and the next calculation keep the same source identity.
      const restoredPieceId = composePieceId(groupName, pieceNamePart(groupName, pieceName || defaultPieceId(groupName, group.pieces.length + 1)));
      const uniquePieceId = group.pieces.some((piece) => piece.id === restoredPieceId)
        ? `${restoredPieceId}-${group.pieces.length + 1}`
        : restoredPieceId;
      group.pieces.push({ id: uniquePieceId, name: uniquePieceId, form: formFromSavedJob(job) });
      group.form = group.pieces[0]!.form;
    });
    restoredGroups.forEach((group) => { group.subgroups = [{ id: `${group.id}-subgroup-A`, name: 'A', pieceIds: group.pieces.map((piece) => piece.id), expanded: true }]; });
    const firstGroup = restoredGroups[0]!;
    const firstPiece = firstGroup.pieces[0]!;
    setProjectId(project.id); setProjectName(project.name); setGroups(restoredGroups); setActiveGroupId(firstGroup.id); setActivePieceId(firstPiece.id); setForm(firstPiece.form);
    setPlan(null); setPlanRequest(null); setDraftJob(null); setPendingBatchSave(null); setBatchPlans(null); setMergedGroupPlans([]); setSavedGroupPlanViews({}); setCandidateComparison([]); setConfirmed(false); setCuttingComplete(false); setManualPlacements(null); setCheckedPlacementIds([]);
  }, []);

  const updateActiveForm: React.Dispatch<React.SetStateAction<CuttingFormState>> = (updater) => {
    setForm((current) => {
      const next = typeof updater === 'function' ? updater(current) : updater;
      const identityChanged = next.brand !== current.brand || next.productNumber !== current.productNumber;
      setGroups((items) => {
        const activeGroup = items.find((group) => group.id === activeGroupId);
        const mergeGroupId = activeGroup?.mergeGroupId;
        const shareIdentity = (group: CuttingGroupDraft) => group.id === activeGroupId
          || (identityChanged && mergeGroupId !== undefined && mergeGroupId !== DISABLED_MERGE_GROUP_ID && group.mergeGroupId === mergeGroupId);
        return items.map((group) => {
          if (!shareIdentity(group)) return group.id === activeGroupId
            ? { ...group, form: next, pieces: group.pieces.map((piece) => piece.id === activePieceId ? { ...piece, form: next } : piece) }
            : group;
          const pieces = group.pieces.map((piece) => {
            const pieceForm = group.id === activeGroupId && piece.id === activePieceId ? next : piece.form;
            return identityChanged
              ? { ...piece, form: { ...pieceForm, brand: next.brand, productNumber: next.productNumber } }
              : group.id === activeGroupId && piece.id === activePieceId ? { ...piece, form: next } : piece;
          });
          const groupForm = group.id === activeGroupId
            ? next
            : { ...group.form, brand: next.brand, productNumber: next.productNumber };
          return { ...group, form: groupForm, pieces };
        });
      });
      return next;
    });
  };
  const updateGroupIdentityFor = (groupId: string, patch: Partial<Pick<CuttingFormState, 'brand' | 'productNumber'>>) => {
    // Identity is entered per big-group row. Explicit merge actions still
    // synchronize identities through changeMergeGroup, but editing a row must
    // never overwrite another big group's product number.
    setGroups((items) => updateGroupIdentity(items, groupId, patch, DISABLED_MERGE_GROUP_ID, false));
    if (groupId === activeGroupId) setForm((current) => ({ ...current, ...patch }));
    setPlan(null); setPlanRequest(null); setDraftJob(null); setBatchPlans(null); setMergedGroupPlans([]); setPendingBatchSave(null); setSavedGroupPlanViews({}); setManualPlacements(null); setCheckedPlacementIds([]); setConfirmed(false); setCuttingComplete(false);
  };
  const updatePieceForm = (groupId: string, pieceId: string, updater: React.SetStateAction<CuttingFormState>) => {
    setGroups((items) => items.map((group) => {
      if (group.id !== groupId) return group;
      const piece = group.pieces.find((item) => item.id === pieceId);
      if (!piece) return group;
      const next = typeof updater === 'function' ? updater(piece.form) : updater;
      return { ...group, form: pieceId === activePieceId ? next : group.form, pieces: group.pieces.map((item) => item.id === pieceId ? { ...item, form: next } : item) };
    }));
    if (groupId === activeGroupId && pieceId === activePieceId) setForm((current) => typeof updater === 'function' ? updater(current) : updater);
    setPlan(null); setPlanRequest(null); setDraftJob(null); setBatchPlans(null); setMergedGroupPlans([]); setPendingBatchSave(null); setSavedGroupPlanViews({}); setManualPlacements(null); setCheckedPlacementIds([]); setConfirmed(false); setCuttingComplete(false);
  };
  const selectGroup = (group: CuttingGroupDraft) => {
    saveActivePlanView();
    const piece = group.pieces[0];
    setActiveGroupId(group.id); setActivePieceId(piece?.id ?? ''); setForm(piece?.form ?? group.form); if (piece) restorePlanView(group.id, piece.id); else { setPlan(null); setPlanRequest(null); setDraftJob(null); setConfirmed(false); setCuttingComplete(false); setManualPlacements(null); setCheckedPlacementIds([]); }
  };
  const selectPiece = (piece: CuttingPieceDraft, groupId = activeGroupId) => {
    saveActivePlanView();
    setActiveGroupId(groupId); setActivePieceId(piece.id); setForm(piece.form); setGroups((items) => items.map((item) => item.id === groupId ? { ...item, form: piece.form } : item)); restorePlanView(groupId, piece.id);
  };
  const addPiece = (subgroupId?: string, groupId = activeGroupId) => {
    const group = groups.find((item) => item.id === groupId); if (!group) return;
    const targetSubgroup = group.subgroups.find((subgroup) => subgroup.id === subgroupId)
      ?? group.subgroups.find((subgroup) => subgroup.pieceIds.includes(activePieceId))
      ?? group.subgroups[0];
    if (!targetSubgroup) { addSubgroup(); return; }
    const next = newPieceDraft(`${group.name}_${targetSubgroup.name}`, targetSubgroup.pieceIds.length + 1);
    next.id = nextPieceId(group.pieces, `${group.name}_${targetSubgroup.name}`);
    next.name = next.id;
    setGroups((items) => items.map((item) => item.id === groupId ? { ...item, form: next.form, pieces: [...item.pieces, next], subgroups: item.subgroups.map((subgroup) => subgroup.id === targetSubgroup.id ? { ...subgroup, pieceIds: [...subgroup.pieceIds, next.id], expanded: true } : subgroup) } : item));
    setActiveGroupId(groupId); setActivePieceId(next.id); setForm(next.form); setPlan(null); setPlanRequest(null); setDraftJob(null); setBatchPlans(null); setMergedGroupPlans([]);
  };
  const addSubgroup = () => {
    const group = groups.find((item) => item.id === activeGroupId); if (!group) return;
    const subgroupName = subgroupNameForIndex(group.subgroups.length);
    const subgroupId = `${group.id}-subgroup-${subgroupName}`;
    const pieces = [1, 2, 3].map((index) => newPieceDraft(`${group.name}_${subgroupName}`, index));
    const usedIds = new Set(group.pieces.map((piece) => piece.id));
    const uniquePieces = pieces.map((piece, index) => {
      const id = usedIds.has(piece.id) ? `${piece.id}-${index + 1}` : piece.id;
      usedIds.add(id);
      return { ...piece, id, name: id };
    });
    setGroups((items) => items.map((item) => item.id === activeGroupId ? { ...item, form: uniquePieces[0]!.form, pieces: [...item.pieces, ...uniquePieces], subgroups: [...item.subgroups, { id: subgroupId, name: subgroupName, pieceIds: uniquePieces.map((piece) => piece.id), expanded: true }] } : item));
    setActivePieceId(uniquePieces[0]!.id); setForm(uniquePieces[0]!.form); setPlan(null); setPlanRequest(null); setDraftJob(null); setBatchPlans(null); setMergedGroupPlans([]); setNotice(`소그룹 ${subgroupName}과 기본 조각 3개를 추가했습니다.`);
  };
  const renameSubgroup = (groupId: string, subgroupId: string, value: string) => {
    const nextName = value.trim().replace(/\s+/g, ' ');
    if (!nextName) return;
    const group = groups.find((item) => item.id === groupId);
    const subgroup = group?.subgroups.find((item) => item.id === subgroupId);
    if (!group || !subgroup || subgroup.name === nextName) return;
    if (group.subgroups.some((item) => item.id !== subgroupId && item.name === nextName)) {
      setError('같은 대그룹 안에서는 소그룹 이름을 중복 사용할 수 없습니다.');
      return;
    }
    setGroups((items) => items.map((item) => item.id === groupId ? {
       ...item,
       // Subgroup names are presentation metadata. Keep piece IDs stable so
       // saved plans and manual placements remain linked after a rename.
       subgroups: item.subgroups.map((itemSubgroup) => itemSubgroup.id === subgroupId ? { ...itemSubgroup, name: nextName } : itemSubgroup),
    } : item));
    setError(null);
    setNotice(`소그룹 이름을 ${nextName}(으)로 변경했습니다. 조각 표시에도 반영되었습니다. 배치 계산을 다시 실행해 주세요.`);
    setPlan(null); setPlanRequest(null); setDraftJob(null); setBatchPlans(null); setMergedGroupPlans([]); setPendingBatchSave(null); setSavedGroupPlanViews({}); setManualPlacements(null); setCheckedPlacementIds([]); setConfirmed(false); setCuttingComplete(false);
  };
  const moveSubgroupToGroup = (sourceGroupId: string, subgroupId: string, targetGroupId: string) => {
    if (sourceGroupId === targetGroupId) return;
    const source = groups.find((group) => group.id === sourceGroupId);
    const target = groups.find((group) => group.id === targetGroupId);
    const subgroup = source?.subgroups.find((item) => item.id === subgroupId);
    if (!source || !target || !subgroup) return;
    const sourcePieces = subgroup.pieceIds.map((id) => source.pieces.find((piece) => piece.id === id)).filter((piece): piece is CuttingPieceDraft => Boolean(piece));
    if (sourcePieces.length === 0) return;
    const usedIds = new Set(target.pieces.map((piece) => piece.id));
    const renamedPieces = sourcePieces.map((piece, index) => {
      const suffix = pieceNamePart(source.name, piece.id);
      let nextId = composePieceId(target.name, suffix);
      if (usedIds.has(nextId)) nextId = `${nextId}-${index + 1}`;
      usedIds.add(nextId);
      return { ...piece, id: nextId, name: nextId, form: { ...piece.form, brand: target.form.brand, productNumber: target.form.productNumber } };
    });
    const renamedById = new Map(sourcePieces.map((piece, index) => [piece.id, renamedPieces[index]!.id]));
    const subgroupIdBase = `${target.id}-subgroup-${subgroup.name}`;
    let nextSubgroupId = subgroupIdBase;
    let suffix = 2;
    while (target.subgroups.some((item) => item.id === nextSubgroupId)) { nextSubgroupId = `${subgroupIdBase}-${suffix}`; suffix += 1; }
    const movedSubgroup = { ...subgroup, id: nextSubgroupId, pieceIds: renamedPieces.map((piece) => piece.id) };
    setGroups((items) => items.map((group) => {
      if (group.id === source.id) {
        const pieces = group.pieces.filter((piece) => !renamedById.has(piece.id));
        return { ...group, pieces, form: pieces[0]?.form ?? group.form, subgroups: group.subgroups.filter((item) => item.id !== subgroup.id) };
      }
      if (group.id === target.id) return { ...group, pieces: [...group.pieces, ...renamedPieces], subgroups: [...group.subgroups, movedSubgroup] };
      return group;
    }));
    if (activeGroupId === source.id && renamedById.has(activePieceId)) {
      const moved = renamedPieces.find((piece) => piece.id === renamedById.get(activePieceId));
      if (moved) { setActiveGroupId(target.id); setActivePieceId(moved.id); setForm(moved.form); }
    }
    setError(null); setNotice(`소그룹 ${subgroup.name}을 대그룹 ID ${target.displayId}로 이동했습니다. 배치 계산을 다시 실행해 주세요.`);
    setPlan(null); setPlanRequest(null); setDraftJob(null); setBatchPlans(null); setMergedGroupPlans([]); setPendingBatchSave(null); setSavedGroupPlanViews({}); setManualPlacements(null); setCheckedPlacementIds([]); setConfirmed(false); setCuttingComplete(false);
  };
  const deletePiece = (id: string, groupId = activeGroupId) => {
    const group = groups.find((item) => item.id === groupId); if (!group || group.pieces.length <= 1) return;
    const remaining = group.pieces.filter((piece) => piece.id !== id);
    const subgroups = group.subgroups.map((subgroup) => ({ ...subgroup, pieceIds: subgroup.pieceIds.filter((pieceId) => pieceId !== id) })).filter((subgroup) => subgroup.pieceIds.length > 0);
    setGroups((items) => items.map((item) => item.id === groupId ? { ...item, pieces: remaining, form: remaining[0]!.form, subgroups } : item));
    if (groupId === activeGroupId && id === activePieceId) { const nextPiece = remaining[0]; if (nextPiece) selectPiece(nextPiece, activeGroupId); else { setActivePieceId(''); setForm(group.form); } }
  };
  const addGroup = () => {
    const next = newGroupDraft(groups.length + 1, false);
    setGroups((items) => [...items, next]); setActiveGroupId(next.id); setActivePieceId(''); setForm(next.form); setPlan(null); setDraftJob(null); setPlanRequest(null); setMergedGroupPlans([]);
  };
  const renameGroupDisplayId = (id: string, value: string) => {
    const nextId = value.replace(/[^0-9]/g, '');
    const current = groups.find((group) => group.id === id);
    if (!current || nextId === current.displayId) return;
    const validation = validateGroupDisplayId(nextId, groups.filter((group) => group.id !== id).map((group) => group.displayId));
    if (validation) { setError(validation); return; }
    setError(null); setNotice('대그룹 ID가 변경되었습니다.');
    setGroups((items) => items.map((group) => group.id === id ? { ...group, displayId: nextId } : group));
    setPlan(null); setPlanRequest(null); setDraftJob(null); setBatchPlans(null); setMergedGroupPlans([]); setPendingBatchSave(null); setSavedGroupPlanViews({}); setManualPlacements(null); setCheckedPlacementIds([]); setConfirmed(false); setCuttingComplete(false);
  };
  const movePieceToGroup = (sourceGroupId: string, pieceId: string, targetDisplayId: string) => {
    const source = groups.find((group) => group.id === sourceGroupId);
    const target = groups.find((group) => group.displayId === targetDisplayId);
    if (!source || !target || source.id === target.id) return;
    if (source.pieces.length <= 1) { setError('대그룹에는 최소 1개의 조각이 필요합니다.'); return; }
    const sourcePiece = source.pieces.find((piece) => piece.id === pieceId);
    if (!sourcePiece) return;
    const targetSubgroup = target.subgroups[0] ?? { id: `${target.id}-subgroup-A`, name: 'A', pieceIds: [], expanded: true };
    const nextPieceIdValue = composePieceId(target.name, pieceNamePart(source.name, sourcePiece.id));
    if (target.pieces.some((piece) => piece.id === nextPieceIdValue)) { setError('대상 대그룹에 같은 조각 이름이 이미 있습니다.'); return; }
    const movedPiece = { ...sourcePiece, id: nextPieceIdValue, name: nextPieceIdValue, form: { ...sourcePiece.form, brand: target.form.brand, productNumber: target.form.productNumber } };
    setGroups((items) => items.map((group) => {
      if (group.id === source.id) { const pieces = group.pieces.filter((piece) => piece.id !== pieceId); const subgroups = group.subgroups.map((subgroup) => ({ ...subgroup, pieceIds: subgroup.pieceIds.filter((id) => id !== pieceId) })).filter((subgroup) => subgroup.pieceIds.length > 0); return { ...group, pieces, form: pieces[0]!.form, subgroups }; }
      if (group.id === target.id) return { ...group, pieces: [...group.pieces, movedPiece], subgroups: group.subgroups.length > 0 ? group.subgroups.map((subgroup, index) => index === 0 ? { ...subgroup, pieceIds: [...subgroup.pieceIds, movedPiece.id] } : subgroup) : [{ ...targetSubgroup, pieceIds: [movedPiece.id] }] };
      return group;
    }));
    if (activeGroupId === source.id && activePieceId === pieceId) { setActiveGroupId(target.id); setActivePieceId(nextPieceIdValue); setForm(movedPiece.form); }
    setError(null); setNotice(`${sourcePiece.id} 조각을 대그룹 ${target.displayId}로 이동했습니다. 배치 계산을 다시 실행해 주세요.`);
    setPlan(null); setPlanRequest(null); setDraftJob(null); setBatchPlans(null); setMergedGroupPlans([]); setPendingBatchSave(null); setSavedGroupPlanViews({}); setManualPlacements(null); setCheckedPlacementIds([]); setConfirmed(false); setCuttingComplete(false);
  };
  const renamePieceId = (groupId: string, pieceId: string, value: string) => {
    const group = groups.find((item) => item.id === groupId);
    if (!group) return;
    const nextId = composePieceId(group.name, value);
    const validation = validatePieceId(group.pieces, pieceId, nextId);
    if (validation) { setError(validation); return; }
    if (nextId === pieceId) return;
    setError(null);
    setNotice('조각 이름이 변경되었습니다. 배치 계산을 다시 실행해 주세요.');
    setGroups((items) => items.map((item) => item.id === groupId
      ? { ...item, pieces: item.pieces.map((piece) => piece.id === pieceId ? { ...piece, id: nextId, name: nextId } : piece), subgroups: item.subgroups.map((subgroup) => ({ ...subgroup, pieceIds: subgroup.pieceIds.map((id) => id === pieceId ? nextId : id) })) }
      : item));
    // A source ID is part of every calculated plan. Clear stale results so a
    // renamed piece can never be confirmed under the previous ID.
    setPlan(null); setPlanRequest(null); setDraftJob(null); setBatchPlans(null); setMergedGroupPlans([]); setPendingBatchSave(null); setSavedGroupPlanViews({}); setManualPlacements(null); setCheckedPlacementIds([]); setConfirmed(false); setCuttingComplete(false);
    if (activeGroupId === groupId && activePieceId === pieceId) setActivePieceId(nextId);
  };
  const renameGroup = (id: string, name: string) => {
    const nextName = name.trim();
    if (!nextName) return;
    const currentGroup = groups.find((group) => group.id === id);
    if (!currentGroup) return;
    setGroups((items) => items.map((group) => group.id === id ? {
      ...group,
      name: nextName,
      pieces: group.pieces.map((piece) => {
        // Group is the immutable prefix of every displayed piece name. Keep
        // the editable suffix while applying the new group name.
        const nextId = composePieceId(nextName, pieceNamePart(currentGroup.name, piece.id));
        return { ...piece, id: nextId, name: nextId };
      }),
    } : group));
    setSavedGroupPlanViews((views) => {
      const next = { ...views };
      delete next[id];
      return next;
    });
    if (id === activeGroupId) {
      const activePiece = currentGroup.pieces.find((piece) => piece.id === activePieceId);
      if (activePiece) setActivePieceId(composePieceId(nextName, pieceNamePart(currentGroup.name, activePiece.id)));
      setPlan(null); setPlanRequest(null); setDraftJob(null); setBatchPlans(null); setMergedGroupPlans([]); setPendingBatchSave(null); setSavedGroupPlanViews({});
    }
  };
  const deleteGroup = (id: string) => {
    if (groups.length <= 1) return;
    if (hasAssignedSubgroups(groups, id)) { setError('소그룹이 연결된 대그룹은 삭제할 수 없습니다. 소그룹의 대그룹 ID를 먼저 변경해 주세요.'); return; }
    const remaining = groups.filter((group) => group.id !== id);
    setGroups(remaining);
    if (id === activeGroupId) selectGroup(remaining[0]!);
  };
  const changeMergeGroup = (id: string, mergeGroupId: string | undefined) => {
    const source = groups.find((group) => group.id === id);
    if (!source) return;
    setGroups((items) => items.map((group) => {
      const linked = group.id === id || (mergeGroupId !== undefined && mergeGroupId !== DISABLED_MERGE_GROUP_ID && group.mergeGroupId === mergeGroupId);
      if (!linked) return group;
      const pieces = group.pieces.map((piece) => ({ ...piece, form: { ...piece.form, brand: source.form.brand, productNumber: source.form.productNumber } }));
      return { ...group, mergeGroupId: group.id === id ? mergeGroupId : group.mergeGroupId, form: { ...group.form, brand: source.form.brand, productNumber: source.form.productNumber }, pieces };
    }));
    setForm((current) => ({ ...current, brand: source.form.brand, productNumber: source.form.productNumber }));
    setPlan(null); setPlanRequest(null); setDraftJob(null); setBatchPlans(null); setMergedGroupPlans([]); setPendingBatchSave(null); setSavedGroupPlanViews({}); setManualPlacements(null); setCheckedPlacementIds([]); setConfirmed(false); setCuttingComplete(false);
  };
  useEffect(() => { void refreshLibrary().catch((caught) => setError(messageOf(caught))); }, [refreshLibrary]);
  useEffect(() => {
    const id = Array.isArray(routeProjectId) ? routeProjectId[0] : routeProjectId;
    if (!id || routedProjectRef.current === id) return;
    // The input tab stays mounted while switching tabs. A project created
    // from the projects tab may therefore require one fresh library read
    // before its route can be restored.
    if (library.projects === undefined) {
      void refreshLibrary().catch((caught) => setError(messageOf(caught)));
      return;
    }
    const project = library.projects.find((item) => item.id === id);
    if (!project) return;
    routedProjectRef.current = id;
    restoreProject(project, library);
  }, [library, refreshLibrary, restoreProject, routeProjectId]);
  useEffect(() => {
    if (routeNewProject !== '1' || routedProjectRef.current === 'new') return;
    routedProjectRef.current = 'new';
    const fresh = newGroupDraft(1);
    setProjectId(null); setProjectName('새 프로젝트'); setGroups([fresh]); setActiveGroupId(fresh.id); setActivePieceId(fresh.pieces[0]!.id); setForm(fresh.form); setPlan(null); setPlanRequest(null); setDraftJob(null); setPendingBatchSave(null); setBatchPlans(null); setMergedGroupPlans([]); setSavedGroupPlanViews({}); setCandidateComparison([]); setConfirmed(false); setCuttingComplete(false); setManualPlacements(null); setCheckedPlacementIds([]);
  }, [routeNewProject]);
  useEffect(() => {
    void AsyncStorage.setItem(CURRENT_GROUP_ESTIMATE_STORAGE_KEY, JSON.stringify(createCurrentEstimateSnapshot(groups)));
  }, [groups]);
  useEffect(() => {
    void AsyncStorage.getItem(AUTO_SAVE_HISTORY_STORAGE_KEY).then((stored) => setAutoSaveHistory(parseAutoSaveHistory(stored))).catch(() => setAutoSaveHistory(false));
  }, []);
  // Persist the active calculated view in memory while the operator moves
  // between groups and pieces; this does not write to project history.
  useEffect(() => {
    saveActivePlanView();
  }, [saveActivePlanView]);
  const toggleAutoSaveHistory = (value: boolean) => {
    setAutoSaveHistory(value);
    void AsyncStorage.setItem(AUTO_SAVE_HISTORY_STORAGE_KEY, String(value));
  };

  const computeAgainst = useCallback((nextForm: CuttingFormState, inventory: LibraryDocument, timestampMs = Date.now(), remnants = inventory.remnants, completed = false, completedIds: number[] = [], preferredJobId?: string) => {
    const normalizedForm = withProductionDefaults(nextForm);
    const request = toRemnantPlanRequest(normalizedForm, remnants);
    const nextPlan = planWithRemnants(request);
    setCandidateComparison(nextPlan.newRollResult?.optimizationStatus === 'approximate' ? compareContinuousRollCandidates(request) : []);
    const createdAt = new Date(timestampMs).toISOString();
    const activeGroup = groups.find((group) => group.id === activeGroupId);
    const nextJob = buildSavedCuttingJob({
      id: preferredJobId ?? createUniqueUiId('job', timestampMs, inventory.jobs.map((job) => job.id)),
      name: request.productNumber ? `${request.brand} ${request.productNumber} 작업` : `${request.brand} 작업`, createdAt, request, plan: nextPlan, inventory: inventory.remnants,
      filmName: activeGroup?.filmName,
      materialCostPerM: optionalCost(activeGroup?.materialCostPerM),
      constructionCostPerM2: optionalCost(activeGroup?.constructionCostPerM2),
    });
    const completedAt = completed ? new Date(timestampMs).toISOString() : undefined;
    const existing = preferredJobId ? inventory.jobs.find((job) => job.id === preferredJobId) : undefined;
    const jobWithStatus = { ...nextJob, isCuttingComplete: completed, ...(completedAt ? { cuttingCompletedAt: completedAt } : {}), completedPlacementIds: [...completedIds], ...(existing?.isInventoryConfirmed ? { isInventoryConfirmed: true, inventoryConfirmedAt: existing.inventoryConfirmedAt } : {}) };
    setForm(normalizedForm); setGroups((items) => items.map((group) => group.id === activeGroupId ? { ...group, form: normalizedForm, pieces: group.pieces.map((piece) => piece.id === activePieceId ? { ...piece, form: normalizedForm } : piece) } : group)); setPlanRequest(request); setPlan(nextPlan); setDraftJob(jobWithStatus); setBatchPlans(null); setConfirmed(false); setCuttingComplete(completed); setManualPlacements(null); setCheckedPlacementIds(completedIds);
    return { request, nextPlan, nextJob: jobWithStatus };
  }, [activeGroupId, activePieceId, groups]);

  const calculate = useCallback(async (nextForm = form, nextUseRemnants = useRemnants, completed = false, completedIds: number[] = [], preferredJobId?: string) => {
    setBusy(true); setError(null); setNotice(null);
    try {
      const latest = await refreshLibrary();
      const computed = computeAgainst(nextForm, latest, Date.now(), nextUseRemnants ? latest.remnants : [], completed, completedIds, preferredJobId);
      setPendingBatchSave(null);
      if (autoSaveHistory) {
        await repository.saveJob(computed.nextJob);
        await refreshLibrary();
        setNotice('계산 결과를 작업 이력에 자동 저장했습니다. 작업 확정 전까지 재고는 변경되지 않습니다.');
      } else {
        setNotice('계산이 완료되었습니다. 작업 이력에는 저장하지 않았습니다. 필요하면 프로젝트 저장을 눌러 주세요.');
      }
    } catch (caught) {
      setPlan(null); setPlanRequest(null); setDraftJob(null); setBatchPlans(null); setConfirmed(false); setCuttingComplete(false); setManualPlacements(null); setCheckedPlacementIds([]); setError(messageOf(caught));
    } finally { setBusy(false); }
  }, [autoSaveHistory, computeAgainst, form, refreshLibrary, useRemnants]);

  const calculateGroup = async (groupId = activeGroupId) => {
    setBusy(true); setError(null); setNotice(null);
    try {
      const latest = await refreshLibrary();
      const targetGroups = groups.filter((group) => group.id === groupId);
      const requests: GroupedPieceRequest[] = targetGroups.flatMap((group) => group.pieces.map((piece) => {
        const normalized = withProductionDefaults(piece.form);
        return { groupId: group.id, groupName: group.name, pieceId: piece.id, pieceName: piece.id, mergeGroupId: group.mergeGroupId, request: toRemnantPlanRequest(normalized, []), filmName: group.filmName, materialCostPerM: optionalCost(group.materialCostPerM), constructionCostPerM2: optionalCost(group.constructionCostPerM2) };
      })).filter(({ request }) => Number.isFinite(request.pieceWidthMm) && request.pieceWidthMm > 0
        && Number.isFinite(request.pieceLengthMm) && request.pieceLengthMm > 0
        && Number.isInteger(request.quantity) && request.quantity > 0);
      if (requests.length === 0) throw new Error('재단 폭·길이·수량이 입력된 조각이 없습니다.');
      const merged = planMergedGroups(requests, FIXED_ROLL_WIDTH_MM, nextInventory(latest, useRemnants), useRemnants);
      const mergedSourceIds = new Set(merged.flatMap((entry) => entry.sourceIds));
      const mergedInventory = nextInventory(latest, useRemnants);
      const mergedConsumedIds = new Set(merged.flatMap((entry) => entry.inventoryDelta.removeIds));
      // Keep independent pieces from consuming merged-roll residuals before
      // the merged physical roll is confirmed. They can be planned on a later
      // calculation after those residuals are persisted.
      const independentInventory = mergedInventory.filter((item) => !mergedConsumedIds.has(item.id));
      // A merged source is saved as a normal job for history/estimates, but its
      // inventory is reserved by the merged-roll plan, never by the per-piece
      // confirmation transaction.
      const independentRequests = requests.filter((entry) => !mergedSourceIds.has(`${entry.groupId}-${entry.pieceId}`));
      const mergedSourceRequests = requests.filter((entry) => mergedSourceIds.has(`${entry.groupId}-${entry.pieceId}`));
      const independentPlans = planGroupedPieces(independentRequests, independentInventory);
      const mergedSourcePlans = planGroupedPieces(mergedSourceRequests, []);
      const plansBySourceId = new Map([...independentPlans, ...mergedSourcePlans].map((entry) => [`${entry.groupId}-${entry.pieceId}`, entry]));
      const planned = requests.map((entry) => plansBySourceId.get(`${entry.groupId}-${entry.pieceId}`)).filter((entry): entry is GroupedPiecePlan => entry !== undefined);
      const confirmablePlans = planned.filter((entry) => !mergedSourceIds.has(`${entry.groupId}-${entry.pieceId}`));
      const generatedIds = latest.jobs.map((job) => job.id);
      const generatedMergedIds = latest.mergedJobs.map((job) => job.id);
      const sourceJobIds = new Map<string, string>();
      const savedJobIds: string[] = [];
      const timestamp = Date.now();
      const jobsToSave: SavedCuttingJob[] = [];
      for (const [index, entry] of planned.entries()) {
        const id = createUniqueUiId('job', timestamp + index, generatedIds);
        generatedIds.push(id);
        savedJobIds.push(id);
        sourceJobIds.set(`${entry.groupId}-${entry.pieceId}`, id);
        const job = buildSavedCuttingJob({ id, name: `${entry.groupName} · ${entry.pieceName} 작업`, createdAt: new Date(timestamp + index).toISOString(), request: entry.request, plan: entry.plan, inventory: entry.inventoryBefore, filmName: entry.filmName, materialCostPerM: entry.materialCostPerM, constructionCostPerM2: entry.constructionCostPerM2 });
        jobsToSave.push(job);
      }
      const plannedWithIds = planned.map((entry, index) => ({ ...entry, savedJobId: savedJobIds[index] }));
      const mergedJobsToSave: SavedMergedCuttingJob[] = [];
      for (const [index, entry] of merged.entries()) {
        const mergedJob: SavedMergedCuttingJob = {
          id: createUniqueUiId('merged-job', timestamp + 1000 + index, generatedMergedIds),
          name: `병합 ${entry.mergeGroupId} · ${entry.groupNames.join(' + ')}`,
          mergeGroupId: entry.mergeGroupId,
          groupNames: [...entry.groupNames],
          sourceJobIds: planned
            .filter((piece) => piece.mergeGroupId === entry.mergeGroupId)
            .map((piece) => sourceJobIds.get(`${piece.groupId}-${piece.pieceId}`))
            .filter((id): id is string => id !== undefined),
          sourceIds: [...entry.sourceIds],
          createdAt: new Date(timestamp + 1000 + index).toISOString(),
          updatedAt: new Date(timestamp + 1000 + index).toISOString(),
          rollWidthMm: FIXED_ROLL_WIDTH_MM,
          usedLengthMm: entry.result.usedLengthMm,
          producedQuantity: entry.producedQuantity,
          utilizationPercent: entry.result.utilizationPercent,
          wastePercent: entry.result.wastePercent,
          placements: entry.result.placements.map((placement) => ({ ...placement })),
          remnantIds: entry.remnantUses.map((use) => use.remnantId),
          remnantSummary: entry.remnantUses.map((use) => ({ id: use.remnantId, widthMm: use.widthMm, lengthMm: use.lengthMm, quantity: 1 })),
        };
        generatedMergedIds.push(mergedJob.id);
        mergedJobsToSave.push(mergedJob);
      }
      if (autoSaveHistory) {
        await repository.saveBatchJobs(jobsToSave, mergedJobsToSave);
        setPendingBatchSave(null);
      } else {
        setPendingBatchSave({ jobs: jobsToSave, mergedJobs: mergedJobsToSave });
      }
      const nextBatchPlans = confirmablePlans.map((entry) => ({ ...entry, savedJobId: savedJobIds[planned.indexOf(entry)] }));
      setBatchPlans(nextBatchPlans);
      setMergedGroupPlans(merged);
      // Save every calculated piece, not only the piece that remains active,
      // so moving through a group restores each piece's own preview.
      setSavedGroupPlanViews((current) => ({
        ...current,
        [groupId]: {
          pieces: Object.fromEntries(plannedWithIds.map((entry, index) => [entry.pieceId, {
            plan: entry.plan,
            planRequest: entry.request,
            draftJob: jobsToSave[index] ?? null,
            manualPlacements: null,
            checkedPlacementIds: [],
            candidateComparison: entry.plan.newRollResult?.optimizationStatus === 'approximate' ? compareContinuousRollCandidates(entry.request) : [],
            confirmed: false,
            cuttingComplete: false,
          }])),
          batchPlans: nextBatchPlans,
          mergedGroupPlans: merged,
          pendingBatchSave: autoSaveHistory ? null : { jobs: jobsToSave, mergedJobs: mergedJobsToSave },
        },
      }));
      const active = plannedWithIds.find((entry) => entry.groupId === activeGroupId && entry.pieceId === activePieceId) ?? plannedWithIds[0];
      if (active) activateBatchPlan(active);
      if (autoSaveHistory) await refreshLibrary();
      setNotice(`${planned.length}개 조각의 현재 그룹 배치 계산이 완료되었습니다.${autoSaveHistory ? ' 작업 이력에 자동 저장했습니다.' : ' 작업 이력에는 저장하지 않았습니다. 프로젝트 저장을 눌러 보관할 수 있습니다.'}${merged.some((entry) => entry.remnantUses.length > 0) ? ' 병합 롤 자투리 사용 계획도 반영했습니다.' : ''}`);
    } catch (caught) { setError(`현재 그룹의 전체 조각을 배치하지 못했습니다. ${messageOf(caught)}`); }
    finally { setBusy(false); }
  };

  const activateBatchPlan = (entry: GroupedPiecePlan) => {
    const nextForm = formFromRequest(entry.request);
    const createdAt = new Date().toISOString();
    const nextJob = buildSavedCuttingJob({ id: entry.savedJobId ?? createUniqueUiId('job', Date.now(), library.jobs.map((job) => job.id)), name: `${entry.groupName} · ${entry.pieceName} 작업`, createdAt, request: entry.request, plan: entry.plan, inventory: entry.inventoryBefore, filmName: entry.filmName, materialCostPerM: entry.materialCostPerM, constructionCostPerM2: entry.constructionCostPerM2 });
    setCandidateComparison(entry.plan.newRollResult?.optimizationStatus === 'approximate' ? compareContinuousRollCandidates(entry.request) : []);
    setActiveGroupId(entry.groupId); setActivePieceId(entry.pieceId); setForm(nextForm); setPlanRequest(entry.request); setPlan(entry.plan); setDraftJob(nextJob); setConfirmed(false); setCuttingComplete(false); setManualPlacements(null); setCheckedPlacementIds([]);
  };

  const reset = () => {
    const fresh = newGroupDraft(1); setProjectId(null); setProjectName('새 프로젝트'); setGroups([fresh]); setActiveGroupId(fresh.id); setActivePieceId(fresh.pieces[0]!.id); setForm(fresh.form); setUseRemnants(false); setPlan(null); setPlanRequest(null); setDraftJob(null); setPendingBatchSave(null); setBatchPlans(null); setMergedGroupPlans([]); setSavedGroupPlanViews({}); setCandidateComparison([]); setConfirmed(false); setCuttingComplete(false); setManualPlacements(null); setCheckedPlacementIds([]); setError(null); setNotice(null);
  };

  const confirmJob = async () => {
    if (plan === null || planRequest === null || draftJob === null || confirmed) return;
    if (activeMergedPlan || activeMergedJob) {
      setError('이 조각은 병합 롤에 포함되어 있습니다. 개별 확정 대신 하단의 병합 롤 재고 확정을 사용해 주세요.');
      return;
    }
    setBusy(true); setError(null); setNotice(null);
    try {
      await repository.confirmJob(draftJob, plan.inventoryDelta);
      const latest = await refreshLibrary();
      const confirmedAt = latest.jobs.find((job) => job.id === draftJob.id)?.inventoryConfirmedAt ?? new Date().toISOString();
      setLibrary(latest); setDraftJob({ ...draftJob, isInventoryConfirmed: true, inventoryConfirmedAt: confirmedAt }); setConfirmed(true);
      const residualCount = plan.inventoryDelta.add.filter((item) => !plan.inventoryDelta.removeIds.includes(item.id)).length;
      setNotice(`작업을 확정했습니다. 재고 반영 완료 · 저장된 잔여 자투리 ${residualCount}건`);
    } catch (caught) {
      setError(`재고가 변경되어 확정하지 못했습니다. 최신 재고로 다시 계산했습니다. ${messageOf(caught)}`);
      try { const latest = await refreshLibrary(); computeAgainst(form, latest, Date.now(), useRemnants ? latest.remnants : []); }
      catch (refreshError) { setPlan(null); setPlanRequest(null); setDraftJob(null); setError(`최신 재고를 불러오지 못했습니다. ${messageOf(refreshError)}`); }
    } finally { setBusy(false); }
  };

  const confirmBatch = async () => {
    if (!batchPlans || batchPlans.length === 0) return;
    const ids = batchPlans.map((entry) => entry.savedJobId).filter((id): id is string => Boolean(id));
    if (ids.length !== batchPlans.length) { setError('그룹 작업 ID가 없어 다시 계산해야 합니다.'); return; }
    setBusy(true); setError(null); setNotice(null);
    try {
      // 자동저장 OFF 상태에서는 계산 결과가 임시 상태이므로, 명시적인
      // 재고 확정 시점에만 저장한 뒤 동일한 최신 문서를 기준으로 검증한다.
      const source = pendingBatchSave ? await ensurePendingBatchSaved() : (await repository.load()).document;
      const merged = source.mergedJobs.find((job) => job.isCuttingComplete && job.sourceJobIds.some((id) => ids.includes(id)));
      if (merged) { setError(`병합 롤 ${merged.name}이 이미 완료되어 순차 자투리 배치를 함께 확정할 수 없습니다.`); return; }
      const jobs = ids.map((id) => source.jobs.find((job) => job.id === id));
      if (jobs.some((job) => job === undefined)) { setError('확정 대상 작업이 변경되어 다시 계산해야 합니다.'); return; }
      if (jobs.some((job) => job!.isInventoryConfirmed)) { setError('이미 재고 확정된 작업이 포함되어 있습니다.'); return; }
      const delta = aggregateInventoryDelta(batchPlans);
      await repository.confirmJobs(jobs as SavedCuttingJob[], delta);
      await refreshLibrary();
      const residualCount = delta.add.filter((item) => !delta.removeIds.includes(item.id)).length;
      setConfirmed(true);
      setNotice(`${batchPlans.length}개 조각을 하나의 재고 트랜잭션으로 확정했습니다. 저장된 잔여 자투리 ${residualCount}건`);
    } catch (caught) {
      setError(`그룹 작업을 함께 확정하지 못했습니다. ${messageOf(caught)}`);
      await refreshLibrary();
    } finally { setBusy(false); }
  };

  const savePreset = async () => {
    setBusy(true); setError(null);
    try {
      const request = toRemnantPlanRequest(form, []);
      const nowMs = Date.now(); const now = new Date(nowMs).toISOString();
      const preset: FilmPreset = {
        id: createUniqueUiId('preset', nowMs, library.presets.map((item) => item.id)),
        brand: request.brand, productNumber: request.productNumber, rollWidthMm: request.rollWidthMm,
        pieceWidthMm: request.pieceWidthMm, pieceLengthMm: request.pieceLengthMm, gapMm: request.gapMm,
        sideMarginMm: request.sideMarginMm, startEndMarginMm: request.startEndMarginMm,
        allowRotation: request.allowRotation, createdAt: now, updatedAt: now,
      };
      await repository.savePreset(preset); await refreshLibrary(); setNotice('현재 규격을 프리셋으로 저장했습니다.');
    } catch (caught) { setError(messageOf(caught)); } finally { setBusy(false); }
  };

  const loadPreset = (preset: FilmPreset) => void calculate({
    brand: preset.brand, productNumber: preset.productNumber, rollWidth: String(FIXED_ROLL_WIDTH_MM),
    pieceWidth: String(preset.pieceWidthMm), pieceLength: String(preset.pieceLengthMm), quantity: form.quantity,
    gap: String(DEFAULT_GAP_MM), sideMargin: String(DEFAULT_SIDE_MARGIN_MM), startEndMargin: String(DEFAULT_START_END_MARGIN_MM), allowRotation: true,
  });
  const loadJob = (job: SavedCuttingJob) => void calculate({
    brand: job.brand, productNumber: job.productNumber, rollWidth: String(FIXED_ROLL_WIDTH_MM),
    pieceWidth: String(job.input.pieceWidthMm), pieceLength: String(job.input.pieceLengthMm), quantity: String(job.input.quantity),
    gap: String(DEFAULT_GAP_MM), sideMargin: String(DEFAULT_SIDE_MARGIN_MM), startEndMargin: String(DEFAULT_START_END_MARGIN_MM), allowRotation: true,
  }, useRemnants, Boolean(job.isCuttingComplete), job.completedPlacementIds ?? [], job.id);
  useEffect(() => {
    const id = Array.isArray(routeJobId) ? routeJobId[0] : routeJobId;
    if (!id || routedJobRef.current === id) return;
    const job = library.jobs.find((item) => item.id === id);
    if (!job) return;
    routedJobRef.current = id;
    loadJob(job);
  }, [library.jobs, loadJob, routeJobId]);
  const deletePreset = async (id: string) => withBusy(async () => { await repository.deletePreset(id); await refreshLibrary(); }, setBusy, setError);
  const ensurePendingBatchSaved = async (): Promise<LibraryDocument> => {
    if (!pendingBatchSave) return library;
    await repository.saveBatchJobs(pendingBatchSave.jobs, pendingBatchSave.mergedJobs);
    setPendingBatchSave(null);
    return refreshLibrary();
  };
  const saveProject = async () => {
    if (!draftJob && !pendingBatchSave) return;
    setBusy(true); setError(null);
    try {
      const latest = await repository.load();
      const name = projectName.trim() || '새 프로젝트';
      const existingByName = latest.document.projects?.find((project) => project.name.trim() === name);
      const nowMs = Date.now();
      const id = projectId ?? existingByName?.id ?? createUniqueUiId('project', nowMs, (latest.document.projects ?? []).map((project) => project.id));
      const existing = (latest.document.projects ?? []).find((project) => project.id === id);
      const jobs = pendingBatchSave?.jobs ?? (draftJob ? [draftJob] : []);
      const mergedJobs = pendingBatchSave?.mergedJobs ?? [];
      const preservedJobs = existing
        ? latest.document.jobs.filter((job) => existing.jobIds.includes(job.id) && !jobs.some((item) => item.id === job.id || item.name === job.name))
        : [];
      const preservedMergedJobs = existing
        ? latest.document.mergedJobs.filter((job) => existing.mergedJobIds.includes(job.id) && !mergedJobs.some((item) => item.id === job.id || item.name === job.name))
        : [];
      const allJobs = [...preservedJobs, ...jobs];
      const allMergedJobs = [...preservedMergedJobs, ...mergedJobs];
      const project: SavedProject = {
        id, name, jobIds: allJobs.map((job) => job.id), mergedJobIds: allMergedJobs.map((job) => job.id),
        materialCostPerM: optionalCost(groups[0]?.materialCostPerM) ?? 10_000,
        constructionCostPerM2: optionalCost(groups[0]?.constructionCostPerM2) ?? 15_000,
        createdAt: existing?.createdAt ?? new Date(nowMs).toISOString(), updatedAt: new Date(nowMs).toISOString(),
      };
      await repository.saveProjectBundle(project, allJobs, allMergedJobs);
      setProjectId(id); setProjectName(name); setPendingBatchSave(null);
      await refreshLibrary();
      setNotice(`"${name}" 프로젝트를 저장했습니다.`);
    }
    catch (caught) { setError(`프로젝트를 저장하지 못했습니다. ${messageOf(caught)}`); }
    finally { setBusy(false); }
  };

  const exportLibrary = async () => {
    setBusy(true); setError(null);
    try {
      const raw = await repository.exportDocument();
      const filename = `film-cutting-library-${new Date().toISOString().slice(0, 10)}.json`;
      if (Platform.OS === 'web') {
        const blob = new Blob([raw], { type: 'application/json;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a'); anchor.href = url; anchor.download = filename; anchor.click(); URL.revokeObjectURL(url);
      } else {
        const FileSystem = await import('expo-file-system/legacy');
        const uri = `${FileSystem.cacheDirectory}${filename}`;
        await FileSystem.writeAsStringAsync(uri, raw, { encoding: FileSystem.EncodingType.UTF8 });
        if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri, { mimeType: 'application/json', dialogTitle: '프로젝트 백업 공유' });
        else throw new Error('이 기기에서는 파일 공유를 사용할 수 없습니다.');
      }
      setNotice('프로젝트 라이브러리를 JSON 파일로 내보냈습니다.');
    } catch (caught) { setError(`프로젝트를 내보내지 못했습니다. ${messageOf(caught)}`); }
    finally { setBusy(false); }
  };

  const importLibrary = async () => {
    setBusy(true); setError(null);
    try {
      let raw: string | null = null;
      if (Platform.OS === 'web') {
        raw = await new Promise<string | null>((resolve) => {
          const picker = document.createElement('input'); picker.type = 'file'; picker.accept = 'application/json,.json';
          picker.onchange = async () => { const file = picker.files?.[0]; resolve(file ? await file.text() : null); };
          picker.click();
        });
      } else {
        const picked = await DocumentPicker.getDocumentAsync({ type: 'application/json', copyToCacheDirectory: true });
        if (!picked.canceled) {
          const FileSystem = await import('expo-file-system/legacy');
          raw = await FileSystem.readAsStringAsync(picked.assets[0]!.uri, { encoding: FileSystem.EncodingType.UTF8 });
        }
      }
      if (raw === null) return;
      await repository.importDocument(raw);
      await refreshLibrary();
      setPlan(null); setPlanRequest(null); setDraftJob(null); setBatchPlans(null); setConfirmed(false); setCuttingComplete(false); setCheckedPlacementIds([]);
      setNotice('프로젝트 라이브러리를 불러왔습니다.');
    } catch (caught) { setError(`프로젝트를 불러오지 못했습니다. ${messageOf(caught)}`); }
    finally { setBusy(false); }
  };

  const markCuttingComplete = async () => {
    if (!draftJob) return;
    if (activeMergedPlan || activeMergedJob) {
      setError('이 조각은 병합 롤에 포함되어 있습니다. 하단의 병합 롤 전체 재단 완료를 사용해 주세요.');
      return;
    }
    setBusy(true); setError(null);
    try {
      const now = new Date().toISOString();
      const stored = library.jobs.find((job) => job.id === draftJob.id);
      const inventoryStatus = stored?.isInventoryConfirmed ? { isInventoryConfirmed: true, inventoryConfirmedAt: stored.inventoryConfirmedAt } : {};
      const next = cuttingComplete
        ? { ...draftJob, ...inventoryStatus, isCuttingComplete: false, updatedAt: now, cuttingCompletedAt: undefined, completedPlacementIds: [] }
        : { ...draftJob, ...inventoryStatus, isCuttingComplete: true, updatedAt: now, cuttingCompletedAt: now, completedPlacementIds: [...checkedPlacementIds].sort((a, b) => a - b) };
      await repository.saveJob(next);
      setDraftJob(next); setCuttingComplete(Boolean(next.isCuttingComplete));
      await refreshLibrary();
      setNotice(next.isCuttingComplete ? '재단 완료 상태를 저장했습니다.' : '재단 완료 상태를 해제했습니다.');
    } catch (caught) { setError(`재단 완료 상태를 저장하지 못했습니다. ${messageOf(caught)}`); }
    finally { setBusy(false); }
  };
  const toggleMergedComplete = async (id: string) => {
    setBusy(true); setError(null);
    try {
      const source = pendingBatchSave ? await ensurePendingBatchSaved() : library;
      const current = source.mergedJobs.find((job) => job.id === id);
      if (!current) return;
      if (!current.isCuttingComplete && current.sourceJobIds.some((sourceId) => source.jobs.some((job) => job.id === sourceId && job.isInventoryConfirmed))) {
        setError('병합 롤의 원본 조각 중 이미 재고 확정된 작업이 있어 병합 롤을 완료 처리할 수 없습니다.');
        return;
      }
      const now = new Date().toISOString();
      const next = current.isCuttingComplete
        ? { ...current, isCuttingComplete: false, updatedAt: now, cuttingCompletedAt: undefined, completedPlacementIds: [] }
        : { ...current, isCuttingComplete: true, updatedAt: now, cuttingCompletedAt: now, completedPlacementIds: current.placements.map((placement) => placement.id) };
      await repository.saveMergedJob(next);
      await refreshLibrary();
      setNotice(next.isCuttingComplete ? '병합 롤 전체 재단 완료를 저장했습니다.' : '병합 롤 재단 완료를 해제했습니다.');
    } catch (caught) { setError(`병합 롤 완료 상태를 저장하지 못했습니다. ${messageOf(caught)}`); }
    finally { setBusy(false); }
  };
  const toggleMergedPlacementComplete = async (jobId: string, placementId: number) => {
    setBusy(true); setError(null);
    try {
      const source = pendingBatchSave ? await ensurePendingBatchSaved() : library;
      const current = source.mergedJobs.find((job) => job.id === jobId);
      if (!current) return;
      const completedIds = new Set(current.completedPlacementIds ?? []);
      if (completedIds.has(placementId)) completedIds.delete(placementId);
      else completedIds.add(placementId);
      const nextCompletedPlacementIds = [...completedIds].sort((left, right) => left - right);
      const isComplete = current.placements.length > 0 && nextCompletedPlacementIds.length === current.placements.length;
      if (isComplete && !current.isCuttingComplete && current.sourceJobIds.some((sourceId) => source.jobs.some((job) => job.id === sourceId && job.isInventoryConfirmed))) {
        setError('병합 롤의 원본 조각 중 이미 재고 확정된 작업이 있어 병합 롤을 완료 처리할 수 없습니다.');
        return;
      }
      const now = new Date().toISOString();
      const next = { ...current, isCuttingComplete: isComplete, updatedAt: now, cuttingCompletedAt: isComplete ? now : undefined, completedPlacementIds: nextCompletedPlacementIds };
      await repository.saveMergedJob(next);
      await refreshLibrary();
      setNotice(isComplete ? '병합 롤의 모든 조각을 재단 완료로 저장했습니다.' : '병합 롤 배치 목록의 완료 상태를 저장했습니다.');
    } catch (caught) { setError(`병합 조각 완료 상태를 저장하지 못했습니다. ${messageOf(caught)}`); }
    finally { setBusy(false); }
  };
  const confirmMergedInventory = async (id: string) => {
    setBusy(true); setError(null); setNotice(null);
    try {
      const source = pendingBatchSave ? await ensurePendingBatchSaved() : library;
      const current = source.mergedJobs.find((job) => job.id === id);
      const planned = mergedGroupPlans.find((item) => item.mergeGroupId === current?.mergeGroupId);
      if (!current || !planned || current.isInventoryConfirmed) return;
      await repository.confirmMergedJob(current, planned.inventoryDelta);
      await refreshLibrary();
      setNotice(`병합 롤 재고를 확정했습니다. 자투리 ${planned.remnantUses.length}개를 반영했습니다.`);
    } catch (caught) {
      setError(`병합 롤 재고를 확정하지 못했습니다. ${messageOf(caught)}`);
      await refreshLibrary();
    } finally { setBusy(false); }
  };

  const saveRemnant = async (draft: RemnantDraft) => {
    const brand = form.brand.trim(); const productNumber = form.productNumber.trim();
    if (!brand) throw new Error('브랜드를 먼저 선택해 주세요.');
    setBusy(true);
    try {
      const nowMs = Date.now(); const now = new Date(nowMs).toISOString();
      const remnant: FilmRemnant = {
        id: createUniqueUiId('remnant', nowMs, library.remnants.map((item) => item.id)), brand, productNumber,
        widthMm: draft.widthMm, lengthMm: draft.lengthMm, quantity: draft.quantity, createdAt: now, updatedAt: now,
        ...(draft.note === undefined ? {} : { note: draft.note }),
      };
      await repository.saveRemnant(remnant);
      const latest = await refreshLibrary(); if (plan !== null) computeAgainst(form, latest, Date.now(), useRemnants ? latest.remnants : []);
      setNotice('자투리의 실제 크기를 저장했습니다.');
    } finally { setBusy(false); }
  };
  const deleteRemnant = async (id: string) => {
    setBusy(true); setError(null);
    try { await repository.deleteRemnant(id); const latest = await refreshLibrary(); if (plan !== null) computeAgainst(form, latest, Date.now(), useRemnants ? latest.remnants : []); setNotice('자투리 재고를 삭제했습니다.'); }
    catch (caught) { setError(messageOf(caught)); } finally { setBusy(false); }
  };

  const preview = useMemo(() => {
    if (plan?.newRollResult) return { result: plan.newRollResult, widthMm: planRequest?.rollWidthMm ?? 0, sideMarginMm: planRequest?.sideMarginMm ?? 0, startEndMarginMm: planRequest?.startEndMarginMm ?? 0, title: '새 연속 롤 배치' };
    const use = plan?.remnantUses[0]; const source = use && planRequest?.remnants.find((item) => item.id === use.remnantId);
    return use && source ? { result: use.result, widthMm: source.widthMm, sideMarginMm: planRequest?.sideMarginMm ?? 0, startEndMarginMm: planRequest?.startEndMarginMm ?? 0, title: '자투리 배치' } : null;
  }, [plan, planRequest]);
  const previewResult = preview ? { ...preview.result, placements: manualPlacements ?? preview.result.placements } : null;

  const exportCsv = async () => {
    if (!draftJob) return; setBusy(true); setError(null);
    try {
      const csv = createCsv(draftJob); const filename = `${safeFilename(draftJob.name)}.csv`;
      if (Platform.OS === 'web' && typeof document !== 'undefined') {
        const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
        const anchor = document.createElement('a'); anchor.href = url; anchor.download = filename; anchor.click(); URL.revokeObjectURL(url);
      } else {
        const FileSystem = await import('expo-file-system/legacy'); const uri = `${FileSystem.cacheDirectory}${filename}`;
        await FileSystem.writeAsStringAsync(uri, csv, { encoding: FileSystem.EncodingType.UTF8 });
        if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri, { mimeType: 'text/csv', dialogTitle: 'CSV 작업지시서 공유' });
        else throw new Error('이 기기에서는 파일 공유를 사용할 수 없습니다.');
      }
      setNotice('CSV 작업지시서를 준비했습니다.');
    } catch (caught) { setError(`CSV를 내보내지 못했습니다. ${messageOf(caught)}`); } finally { setBusy(false); }
  };
  const exportPdf = async () => {
    if (!draftJob) return; setBusy(true); setError(null);
    try {
      const svg = previewResult && preview ? createLayoutSvgMarkup({ result: previewResult, rollWidthMm: preview.widthMm, displayLengthMm: previewResult.usedLengthMm, sideMarginMm: preview.sideMarginMm, startEndMarginMm: preview.startEndMarginMm }) : '';
      const html = createWorkOrderHtml(draftJob, svg);
      if (Platform.OS === 'web') await Print.printAsync({ html });
      else { const file = await Print.printToFileAsync({ html }); if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(file.uri, { mimeType: 'application/pdf', dialogTitle: 'PDF 작업지시서 공유' }); else throw new Error('이 기기에서는 파일 공유를 사용할 수 없습니다.'); }
      setNotice('인쇄용 작업지시서를 준비했습니다.');
    } catch (caught) { setError(`PDF를 내보내지 못했습니다. ${messageOf(caught)}`); } finally { setBusy(false); }
  };

  const plannedUses: PlannedRemnantSummary[] = plan?.remnantUses.map((use) => ({ remnantId: use.remnantId, producedQuantity: use.producedQuantity, savedNewRollLengthMm: use.savedNewRollLengthMm, optimizationStatus: use.result.optimizationStatus })) ?? [];
  return (
    <ScrollView style={styles.page} contentContainerStyle={[styles.pageContent, width < 420 && styles.pageContentSmall]} keyboardShouldPersistTaps="handled" nestedScrollEnabled>
      <View style={styles.header}>
        <View style={styles.headerCopy}><Text style={styles.eyebrow}>CONTINUOUS ROLL WORKSPACE</Text><Text style={styles.title} accessibilityRole="header">필름 재단 생산 계획</Text><Text style={styles.description}>자투리를 먼저 사용하고 부족한 수량만 새 연속 롤에서 계산합니다.</Text></View>
        <View style={styles.headerActions}><View style={styles.modeBadge}><Text style={styles.modeText}>원단 절약 우선</Text></View><TouchableOpacity accessibilityRole="button" onPress={reset} disabled={busy} style={[styles.resetButton, busy && styles.disabled]}><Text style={styles.resetText}>입력 초기화</Text></TouchableOpacity></View>
      </View>
      {(error || notice) && <View accessibilityLiveRegion="polite" style={[styles.message, error ? styles.messageError : styles.messageInfo]}><Text style={error ? styles.messageErrorText : styles.messageInfoText}>{error ?? notice}</Text></View>}

      <View style={styles.workspace}>
          <View style={styles.panel}>
          <PanelHeading step="01" title="생산 조건" subtitle="모든 치수 단위는 mm입니다." />
          <View style={styles.projectContext}><Text style={styles.projectContextLabel}>현재 프로젝트</Text><Text style={styles.projectContextName}>{projectName}</Text><Text style={styles.projectContextHint}>프로젝트 생성과 이름 변경은 프로젝트 탭에서 진행합니다.</Text></View>
          <GroupInputPanel groups={groups} activeGroupId={activeGroupId} onSelect={selectGroup} onAdd={addGroup} onRenameId={renameGroupDisplayId} onDelete={deleteGroup} onGroupBrandChange={(id, brand) => updateGroupIdentityFor(id, { brand })} onGroupProductNumberChange={(id, productNumber) => updateGroupIdentityFor(id, { productNumber })} />
          <PieceInputPanel groups={groups} groupOptions={groups.map((group) => ({ id: group.id, displayId: group.displayId }))} activePieceId={activePieceId} onSelect={(groupId, piece) => selectPiece(piece, groupId)} onAdd={(groupId, subgroupId) => addPiece(subgroupId, groupId)} onAddSubgroup={addSubgroup} onDelete={(groupId, pieceId) => deletePiece(pieceId, groupId)} onRename={(groupId, pieceId, nextId) => renamePieceId(groupId, pieceId, nextId)} onRenameSubgroup={(groupId, subgroupId, name) => renameSubgroup(groupId, subgroupId, name)} onMoveSubgroup={moveSubgroupToGroup} onChangeForm={(groupId, pieceId, updater) => updatePieceForm(groupId, pieceId, updater)} />
          <ProductionSettingsCard useRemnants={useRemnants} autoSaveHistory={autoSaveHistory} busy={busy} onToggleRemnants={(value) => { setUseRemnants(value); void calculate(form, value); }} onToggleHistory={toggleAutoSaveHistory} />
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="현재 그룹의 모든 조각 자동 배치 계산" disabled={busy} onPress={() => void calculateGroup()} style={[styles.primaryButton, busy && styles.disabled]}><Text style={styles.primaryButtonText}>{busy ? '처리 중…' : '현재 조각 배치'}</Text><Text style={styles.arrow}>→</Text></TouchableOpacity>
        </View>
      </View>

      {plan && <View style={styles.resultMovedNotice}><Text style={styles.resultMovedTitle}>재단 결과가 배치계획으로 이동되었습니다.</Text><Text style={styles.resultMovedText}>통합 원단 사용 계획, 미리보기, 배치목록과 조각별 완료 체크를 배치계획 탭에서 관리합니다.</Text><TouchableOpacity accessibilityRole="button" accessibilityLabel="배치계획으로 이동" onPress={() => router.push('/planning')} style={styles.resultMovedButton}><Text style={styles.resultMovedButtonText}>배치계획 열기 →</Text></TouchableOpacity></View>}
      {plan && draftJob && <View style={styles.workflowCard}><Text style={styles.workflowTitle}>작업 상태</Text><Text style={styles.workflowText}>재단 완료와 재고 확정은 현재 작업에서 계속 관리할 수 있습니다.</Text><View style={[styles.completeBar, cuttingComplete ? styles.completeBarDone : styles.completeBarPending]}><View style={styles.confirmCopy}><Text style={styles.confirmTitle}>{cuttingComplete ? '재단 완료 체크됨' : '재단 완료 체크'}</Text><Text style={styles.confirmMeta}>{cuttingComplete ? '현장 재단 완료 상태가 프로젝트에 저장되었습니다.' : '실제 재단이 끝난 뒤 체크하면 작업 이력에 상태가 남습니다.'}</Text></View><TouchableOpacity accessibilityRole="button" accessibilityLabel="재단 완료 상태 변경" disabled={busy} onPress={() => void markCuttingComplete()} style={[styles.completeButton, busy && styles.disabled]}><Text style={styles.completeButtonText}>{cuttingComplete ? '완료 해제' : '재단 완료'}</Text></TouchableOpacity></View><View style={[styles.confirmBar, confirmed ? styles.confirmedBar : styles.tentativeBar]}><View style={styles.confirmCopy}><Text style={styles.confirmTitle}>{confirmed ? '재고 반영 완료' : '재고 미반영'}</Text><Text style={styles.confirmMeta}>{confirmed ? '작업 이력과 잔여 자투리를 저장했습니다.' : '계산만 완료된 상태입니다. 확정 전에는 재고가 바뀌지 않습니다.'}</Text></View><TouchableOpacity accessibilityRole="button" accessibilityLabel="작업 확정 및 자투리 재고 반영" disabled={busy || confirmed} onPress={confirmJob} style={[styles.confirmButton, (busy || confirmed) && styles.disabled]}><Text style={styles.confirmButtonText}>{confirmed ? '확정 완료' : '작업 확정'}</Text></TouchableOpacity></View><View style={styles.exportRow}><TouchableOpacity accessibilityRole="button" accessibilityLabel="CSV 작업지시서 내보내기" disabled={busy} onPress={exportCsv} style={[styles.secondaryButton, busy && styles.disabled]}><Text style={styles.secondaryButtonText}>CSV 내보내기</Text></TouchableOpacity><TouchableOpacity accessibilityRole="button" accessibilityLabel="PDF 작업지시서 인쇄 또는 공유" disabled={busy} onPress={exportPdf} style={[styles.secondaryButton, busy && styles.disabled]}><Text style={styles.secondaryButtonText}>PDF·인쇄</Text></TouchableOpacity></View></View>}

      <View style={[styles.libraryGrid, libraryWide && styles.libraryGridWide]}>
        <RemnantInventoryPanel brand={form.brand} productNumber={form.productNumber} remnants={library.remnants} plannedUses={plannedUses} identifiersReady={identifiersReady} busy={busy} onSave={saveRemnant} onDelete={deleteRemnant} />
        <LibraryDrawer presets={library.presets} identifiersReady={identifiersReady} busy={busy} onSavePreset={() => void savePreset()} onLoadPreset={loadPreset} onDeletePreset={(id) => void deletePreset(id)} />
      </View>
    </ScrollView>
  );
}

function GroupInputPanel({ groups, activeGroupId, onSelect, onAdd, onRenameId, onDelete, onGroupBrandChange, onGroupProductNumberChange }: { groups: CuttingGroupDraft[]; activeGroupId: string; onSelect(group: CuttingGroupDraft): void; onAdd(): void; onRenameId(id: string, value: string): void; onDelete(id: string): void; onGroupBrandChange(id: string, value: string): void; onGroupProductNumberChange(id: string, value: string): void }) {
  const [openBrandGroupId, setOpenBrandGroupId] = useState<string | null>(null);
  return <View style={[styles.groupInputPanel, styles.overlayGroupPanel]}>
    <View style={styles.groupInputHeader}><View><Text style={styles.groupInputTitle}>대그룹 입력</Text><Text style={styles.groupInputHint}>대그룹은 배치계획용 브랜드·제품번호 단위이며 ID는 숫자로 관리합니다.</Text></View><TouchableOpacity accessibilityRole="button" accessibilityLabel="새 대그룹 추가" onPress={onAdd} style={styles.addGroupButton}><Text style={styles.addGroupButtonText}>＋ 대그룹 추가</Text></TouchableOpacity></View>
    <View style={styles.hierarchyRole}><Text style={styles.hierarchyBadge}>대그룹 정보</Text><Text style={styles.hierarchyRoleText}>각 대그룹 행에서 ID·브랜드·제품번호를 설정합니다.</Text></View>
    <View style={styles.groupRows}>{groups.map((group, index) => { const baseLayer = subgroupCardStackIndex(groups.length, index); const rowLayer = openBrandGroupId === group.id ? groups.length + 10 : baseLayer; return <View key={group.id} style={[styles.groupRow, { zIndex: rowLayer, elevation: rowLayer }, group.id === activeGroupId && styles.groupRowActive]}>
      <TouchableOpacity accessibilityRole="button" accessibilityLabel={`${group.name} 선택`} accessibilityState={{ selected: group.id === activeGroupId }} onPress={() => onSelect(group)} style={styles.groupRowSelect}>
        <Text style={[styles.groupChipIndex, group.id === activeGroupId && styles.groupChipIndexActive]}>{group.displayId || index + 1}</Text>
        <View style={styles.groupChipCopy}><Text style={[styles.groupChipText, group.id === activeGroupId && styles.groupChipTextActive]} numberOfLines={1}>대그룹 ID {group.displayId || index + 1}</Text><Text style={styles.groupChipMeta} numberOfLines={1}>{group.form.brand || '브랜드 미입력'} · {group.form.productNumber || '제품번호 미입력'} · {group.pieces.length}개 조각</Text></View>
      </TouchableOpacity>
      <TextInput accessibilityLabel={`대그룹 ID ${group.displayId || index + 1}`} value={group.displayId} onChangeText={(value) => onRenameId(group.id, value)} onBlur={() => onRenameId(group.id, group.displayId)} keyboardType="numeric" style={styles.groupIdInput} />
      <BrandSelect compact value={group.form.brand} onChange={(value) => onGroupBrandChange(group.id, value)} onOpenChange={(open) => setOpenBrandGroupId(open ? group.id : null)} />
      <TextInput accessibilityLabel={`${group.name} 제품 번호`} autoCapitalize="none" value={group.form.productNumber} onChangeText={(value) => onGroupProductNumberChange(group.id, value)} placeholder="제품번호" placeholderTextColor="#94a3b8" style={styles.groupProductInput} />
      {groups.length > 1 && <TouchableOpacity accessibilityLabel={`${group.name} 삭제`} onPress={() => onDelete(group.id)} style={styles.groupRowAction}><Text style={styles.groupDeleteText}>×</Text></TouchableOpacity>}
    </View>; })}</View>
  </View>;
}
function PieceInputPanel({ groups, groupOptions, activePieceId, onSelect, onAdd, onAddSubgroup, onDelete, onRename, onRenameSubgroup, onMoveSubgroup, onChangeForm }: { groups: CuttingGroupDraft[]; groupOptions: { id: string; displayId: string }[]; activePieceId: string; onSelect(groupId: string, piece: CuttingPieceDraft): void; onAdd(groupId: string, subgroupId?: string): void; onAddSubgroup(): void; onDelete(groupId: string, id: string): void; onRename(groupId: string, pieceId: string, nextId: string): void; onRenameSubgroup(groupId: string, subgroupId: string, name: string): void; onMoveSubgroup(sourceGroupId: string, subgroupId: string, targetGroupId: string): void; onChangeForm(groupId: string, pieceId: string, updater: React.SetStateAction<CuttingFormState>): void }) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState('');
  const [editingError, setEditingError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(true);
  const [collapsedSubgroups, setCollapsedSubgroups] = useState<Record<string, boolean>>({});
  const [openSubgroupId, setOpenSubgroupId] = useState<string | null>(null);
  const [subgroupNameDrafts, setSubgroupNameDrafts] = useState<Record<string, string>>({});
  const finishRename = (groupId: string, pieceId: string) => {
    const nextId = editingValue.trim();
    if (!nextId) { setEditingError('조각 이름을 입력해 주세요.'); return; }
    onRename(groupId, pieceId, nextId);
    setEditingId(null); setEditingError(null);
  };
  const renderPiece = (group: CuttingGroupDraft, subgroupName: string, piece: CuttingPieceDraft, index: number) => <View key={piece.id} style={[styles.pieceRowCard, piece.id === activePieceId && styles.pieceRowCardActive]}>
    <View style={styles.pieceRowContent}>
      {editingId === piece.id
        ? <View style={styles.pieceEditRow}><View style={styles.pieceEditPrefix}><Text style={styles.pieceEditPrefixText}>{group.name}_</Text></View><TextInput accessibilityLabel={`${piece.id} 조각 이름`} autoFocus value={editingValue} onChangeText={(value) => { setEditingValue(value.replace(/[\s_]+/g, '')); setEditingError(null); }} onSubmitEditing={() => finishRename(group.id, piece.id)} returnKeyType="done" style={styles.pieceIdInput} /><TouchableOpacity accessibilityLabel={`${piece.id} 조각 이름 저장`} onPress={() => finishRename(group.id, piece.id)} style={styles.pieceEditAction}><Text style={styles.pieceEditActionText}>저장</Text></TouchableOpacity><TouchableOpacity accessibilityLabel="조각 이름 변경 취소" onPress={() => { setEditingId(null); setEditingError(null); }} style={styles.pieceEditCancel}><Text style={styles.pieceEditCancelText}>취소</Text></TouchableOpacity></View>
         : <><TouchableOpacity accessibilityRole="button" accessibilityLabel={`${piece.id} 선택`} accessibilityState={{ selected: piece.id === activePieceId }} onPress={() => onSelect(group.id, piece)} style={[styles.pieceRowMain, styles.compactPieceRowMain]}><Text style={[styles.pieceIndex, piece.id === activePieceId && styles.pieceIndexActive]}>{index + 1}</Text><View style={styles.pieceCopy}><Text style={[styles.pieceName, piece.id === activePieceId && styles.pieceNameActive]} numberOfLines={1}>{subgroupPieceDisplayName(group.name, subgroupName, piece.id)}</Text></View></TouchableOpacity><TouchableOpacity accessibilityLabel={`${piece.id} 조각 이름 변경`} onPress={() => { setEditingId(piece.id); setEditingValue(subgroupPieceNamePart(group.name, subgroupName, piece.id)); setEditingError(null); }} style={styles.pieceEditButton}><Text style={styles.pieceEditButtonText}>✎</Text></TouchableOpacity><View style={[styles.pieceCardFields, styles.expandedPieceCardFields]}><NumericField compact label="재단 폭" unit="mm" value={piece.form.pieceWidth} step={50} min={0} onChange={(value) => onChangeForm(group.id, piece.id, (current) => ({ ...current, pieceWidth: value }))} /><NumericField compact label="재단 길이" unit="mm" value={piece.form.pieceLength} step={50} min={0} onChange={(value) => onChangeForm(group.id, piece.id, (current) => ({ ...current, pieceLength: value }))} /><NumericField compact label="필요 수량" unit="개" value={piece.form.quantity} integer step={1} min={1} onChange={(value) => onChangeForm(group.id, piece.id, (current) => ({ ...current, quantity: value }))} /></View></>}
      {editingId !== piece.id && group.pieces.length > 1 && <TouchableOpacity accessibilityLabel={`${piece.id} 삭제`} onPress={() => onDelete(group.id, piece.id)} style={styles.pieceDelete}><Text style={styles.pieceDeleteText}>×</Text></TouchableOpacity>}
    </View>
    {editingError && editingId === piece.id && <Text style={styles.pieceEditError}>{editingError}</Text>}
  </View>;
  const subgroupCards = flattenSubgroupCards(groups);
  return <View style={[styles.pieceInputPanel, styles.overlayPiecePanel]}>
    <View style={styles.pieceInputHeader}><View style={styles.pieceHeaderCopy}><Text style={styles.pieceInputTitle}>소그룹 입력</Text><Text style={styles.pieceInputUnitHint}>{PIECE_INPUT_UNIT_HINT}</Text><Text style={styles.pieceInputHint}>소그룹 카드는 독립적으로 관리하며, 각 카드에서 대그룹 ID를 지정합니다.</Text></View><View style={styles.pieceHeaderActions}><TouchableOpacity accessibilityRole="button" accessibilityLabel="새 소그룹 추가" onPress={onAddSubgroup} style={styles.addSubgroupButton}><Text style={styles.addSubgroupButtonText}>＋ 소그룹 추가</Text></TouchableOpacity><TouchableOpacity accessibilityRole="button" accessibilityLabel={expanded ? '소그룹 입력 접기' : '소그룹 입력 펼치기'} onPress={() => setExpanded((current) => !current)} style={styles.collapseButton}><Text style={styles.collapseButtonText}>{expanded ? '접기' : '펼치기'}</Text></TouchableOpacity></View></View>
    {expanded && (subgroupCards.length === 0
      ? <View style={styles.emptySubgroup}><Text style={styles.emptySubgroupText}>소그룹이 없습니다. 위의 소그룹 추가 버튼으로 시작하세요.</Text></View>
      : subgroupCards.map(({ groupId, groupDisplayId, subgroup }, subgroupIndex) => {
        const group = groups.find((item) => item.id === groupId);
        if (!group) return null;
        const pieces = subgroup.pieceIds.map((id) => group.pieces.find((piece) => piece.id === id)).filter((piece): piece is CuttingPieceDraft => Boolean(piece));
        const isExpanded = collapsedSubgroups[subgroup.id] !== true;
        const cardLayer = openSubgroupId === subgroup.id ? subgroupCards.length + 10 : subgroupCardStackIndex(subgroupCards.length, subgroupIndex);
        const subgroupDraft = subgroupNameDrafts[subgroup.id];
        const subgroupInputValue = subgroupDraft ?? subgroup.name;
        const commitSubgroupDraft = () => {
          if (subgroupDraft === undefined) return;
          onRenameSubgroup(groupId, subgroup.id, commitSubgroupName(subgroupDraft, subgroup.name));
          setSubgroupNameDrafts((current) => { const next = { ...current }; delete next[subgroup.id]; return next; });
        };
        return <View key={subgroup.id} style={[styles.subgroupCard, { zIndex: cardLayer, elevation: cardLayer }]}><View style={[styles.subgroupHeader, styles.dropdownHeader]}><TextInput accessibilityLabel={`${subgroup.name} 소그룹 이름`} value={subgroupInputValue} onChangeText={(value) => setSubgroupNameDrafts((current) => ({ ...current, [subgroup.id]: normalizeSubgroupNameDraft(value) }))} onBlur={commitSubgroupDraft} onSubmitEditing={commitSubgroupDraft} returnKeyType="done" style={styles.subgroupNameInput} /><SubgroupGroupSelect options={groupOptions} value={groupId} onChange={(targetGroupId) => onMoveSubgroup(groupId, subgroup.id, targetGroupId)} onOpenChange={(open) => setOpenSubgroupId(open ? subgroup.id : null)} /><Text style={styles.subgroupMeta}>대그룹 {groupDisplayId} · {pieces.length}개 조각</Text><TouchableOpacity accessibilityRole="button" accessibilityLabel={isExpanded ? `${subgroup.name} 접기` : `${subgroup.name} 펼치기`} onPress={() => setCollapsedSubgroups((current) => ({ ...current, [subgroup.id]: isExpanded }))} style={styles.subgroupToggle}><Text style={styles.subgroupToggleText}>{isExpanded ? '접기' : '펼치기'}</Text></TouchableOpacity></View>{isExpanded && <><View style={[styles.pieceRows, styles.dropdownRows]}>{pieces.map((piece, index) => renderPiece(group, subgroup.name, piece, index))}</View><TouchableOpacity accessibilityRole="button" accessibilityLabel={`${subgroup.name} 조각 추가`} onPress={() => onAdd(groupId, subgroup.id)} style={styles.addPieceBottomButton}><Text style={styles.addPieceButtonText}>＋ 조각 추가</Text></TouchableOpacity></>}</View>;
      }))}
  </View>;
}
function SubgroupGroupSelect({ options, value, onChange, onOpenChange }: { options: { id: string; displayId: string }[]; value: string; onChange(value: string): void; onOpenChange?: (open: boolean) => void }) {
  const [open, setOpen] = useState(false);
  const current = options.find((option) => option.id === value);
  return <View style={styles.subgroupGroupSelectWrap}><TouchableOpacity accessibilityRole="combobox" accessibilityLabel="소그룹 대그룹 ID 선택" accessibilityState={{ expanded: open }} onPress={() => setOpen((state) => { const next = !state; onOpenChange?.(next); return next; })} style={styles.subgroupGroupSelect}><Text style={styles.subgroupGroupSelectText}>대그룹 {current?.displayId ?? '—'}</Text><Text style={styles.subgroupGroupSelectChevron}>{open ? '⌃' : '⌄'}</Text></TouchableOpacity>{open && <View style={[styles.subgroupGroupOptions, styles.topmostDropdown]}>{options.map((option) => <TouchableOpacity key={option.id} accessibilityRole="button" accessibilityLabel={`대그룹 ID ${option.displayId} 선택`} onPress={() => { onChange(option.id); setOpen(false); onOpenChange?.(false); }} style={[styles.subgroupGroupOption, option.id === value && styles.subgroupGroupOptionActive]}><Text style={[styles.subgroupGroupOptionText, option.id === value && styles.subgroupGroupOptionTextActive]}>ID {option.displayId}</Text></TouchableOpacity>)}</View>}</View>;
}
function NumericField({ label, unit, value, onChange, integer = false, step = 1, min = 0, compact = false }: { label: string; unit: string; value: string; onChange(value: string): void; integer?: boolean; step?: number; min?: number; compact?: boolean }) {
  const adjust = (direction: -1 | 1) => { const current = Number(value); const base = Number.isFinite(current) ? current : min; onChange(String(Math.max(min, base + direction * step))); };
  if (compact) return <View style={styles.compactField}><Text style={styles.compactFieldLabel}>{label === '재단 폭' ? '폭' : label === '재단 길이' ? '길이' : '수량'}</Text><View style={styles.compactInputWrap}><TouchableOpacity accessibilityRole="button" accessibilityLabel={`${label} ${step}${unit} 감소`} onPress={() => adjust(-1)} style={styles.compactStepperButton}><Text style={styles.compactStepperText}>−</Text></TouchableOpacity><TextInput accessibilityLabel={`${label} ${unit}`} inputMode="decimal" keyboardType="numeric" selectTextOnFocus style={styles.compactInput} value={value} onChangeText={(text) => onChange(text.replace(integer ? /[^0-9]/g : /[^0-9.]/g, ''))} /><TouchableOpacity accessibilityRole="button" accessibilityLabel={`${label} ${step}${unit} 증가`} onPress={() => adjust(1)} style={styles.compactStepperButton}><Text style={styles.compactStepperText}>＋</Text></TouchableOpacity></View></View>;
  return <View style={styles.field}><Text style={styles.label}>{label} <Text style={styles.stepHint}>({step}{unit} 단위)</Text></Text><View style={styles.inputWrap}><TouchableOpacity accessibilityRole="button" accessibilityLabel={`${label} ${step}${unit} 감소`} onPress={() => adjust(-1)} style={styles.stepperButton}><Text style={styles.stepperText}>−</Text></TouchableOpacity><TextInput accessibilityLabel={`${label} ${unit}`} inputMode="decimal" keyboardType="numeric" selectTextOnFocus style={styles.input} value={value} onChangeText={(text) => onChange(text.replace(integer ? /[^0-9]/g : /[^0-9.]/g, ''))} /><Text style={styles.unit}>{unit}</Text><TouchableOpacity accessibilityRole="button" accessibilityLabel={`${label} ${step}${unit} 증가`} onPress={() => adjust(1)} style={styles.stepperButton}><Text style={styles.stepperText}>＋</Text></TouchableOpacity></View></View>;
}
function TextField({ label, value, onChange }: { label: string; value: string; onChange(value: string): void }) { return <View style={styles.textField}><Text style={styles.label}>{label}</Text><TextInput accessibilityLabel={label} autoCapitalize="none" value={value} onChangeText={onChange} style={styles.textInput} placeholder={`${label} 입력`} placeholderTextColor="#94a3b8" /></View>; }
function BrandSelect({ value, onChange, compact = false, onOpenChange }: { value: string; onChange(value: string): void; compact?: boolean; onOpenChange?: (open: boolean) => void }) {
  const [open, setOpen] = useState(false);
  const [brands, setBrands] = useState<string[]>([...DEFAULT_BRANDS]);
  const [newBrand, setNewBrand] = useState('');
  const [brandError, setBrandError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void AsyncStorage.getItem(BRANDS_STORAGE_KEY).then((raw) => {
      if (!active) return;
      try { setBrands(normalizeBrandList(raw ? JSON.parse(raw) : null, value)); }
      catch { setBrands(normalizeBrandList(null, value)); }
    });
    return () => { active = false; };
  }, []);

  const visibleBrands = brands.some((brand) => brand.toLocaleLowerCase('ko-KR') === value.trim().toLocaleLowerCase('ko-KR')) || !value.trim()
    ? brands
    : normalizeBrandList([...brands, value]);
  const persistBrands = (next: string[]) => { setBrands(next); void AsyncStorage.setItem(BRANDS_STORAGE_KEY, JSON.stringify(next)); };
  const addBrand = () => {
    const next = newBrand.trim().replace(/\s+/g, ' ');
    if (!next) { setBrandError('추가할 브랜드명을 입력해 주세요.'); return; }
    if (brands.some((brand) => brand.toLocaleLowerCase('ko-KR') === next.toLocaleLowerCase('ko-KR'))) { setBrandError('이미 등록된 브랜드입니다.'); return; }
    const nextBrands = [...brands, next];
    persistBrands(nextBrands); onChange(next); setNewBrand(''); setBrandError(null); setOpen(true);
  };
  const removeBrand = (brand: string) => {
    if (isDefaultBrand(brand)) return;
    const nextBrands = brands.filter((item) => item !== brand);
    persistBrands(nextBrands);
    if (value.toLocaleLowerCase('ko-KR') === brand.toLocaleLowerCase('ko-KR')) onChange(DEFAULT_BRANDS[0]);
  };
  return <View style={[styles.brandField, compact && styles.compactBrandField]}>
    {!compact && <Text style={styles.label}>제품 브랜드</Text>}
    <TouchableOpacity accessibilityRole="combobox" accessibilityLabel="제품 브랜드" accessibilityState={{ expanded: open }} onPress={() => { setOpen((current) => { const next = !current; onOpenChange?.(next); return next; }); setBrandError(null); }} style={[styles.selectButton, compact && styles.compactSelectButton]}>
      <Text style={[styles.selectText, !value && styles.selectPlaceholder]}>{value || '브랜드 선택'}</Text><Text style={styles.selectChevron}>{open ? '⌃' : '⌄'}</Text>
    </TouchableOpacity>
    {open && <View style={[styles.optionList, compact && styles.compactOptionList]}>
      {visibleBrands.map((brand) => <View key={brand} style={styles.optionRow}>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel={`${brand} 브랜드 선택`} accessibilityState={{ selected: value === brand }} onPress={() => { onChange(brand); setOpen(false); onOpenChange?.(false); }} style={[styles.option, value === brand && styles.optionSelected]}><Text style={[styles.optionText, value === brand && styles.optionTextSelected]}>{brand}</Text></TouchableOpacity>
        {!isDefaultBrand(brand) && <TouchableOpacity accessibilityRole="button" accessibilityLabel={`${brand} 브랜드 삭제`} onPress={() => removeBrand(brand)} style={styles.brandDeleteButton}><Text style={styles.brandDeleteText}>×</Text></TouchableOpacity>}
      </View>)}
      <View style={styles.brandAddRow}><TextInput accessibilityLabel="새 브랜드명" value={newBrand} onChangeText={(text) => { setNewBrand(text); setBrandError(null); }} onSubmitEditing={addBrand} returnKeyType="done" placeholder="새 브랜드명" placeholderTextColor="#94a3b8" style={styles.brandAddInput} /><TouchableOpacity accessibilityRole="button" accessibilityLabel="브랜드 추가" onPress={addBrand} style={styles.brandAddButton}><Text style={styles.brandAddButtonText}>추가</Text></TouchableOpacity></View>
      {brandError && <Text style={styles.brandError}>{brandError}</Text>}
    </View>}
  </View>;
}
function FixedProductionConditions() {
  return <View style={styles.fixedConditions}><View style={styles.fixedConditionHeader}><Text style={styles.groupTitle}>재단 조건</Text><Text style={styles.fixedBadge}>고정</Text></View><Text style={styles.fixedConditionText}>원본 롤 폭 {FIXED_ROLL_WIDTH_MM.toLocaleString()} mm</Text><Text style={styles.fixedConditionText}>간격 {DEFAULT_GAP_MM} mm · 좌우 여백 {DEFAULT_SIDE_MARGIN_MM} mm · 시작·끝 여백 {DEFAULT_START_END_MARGIN_MM} mm</Text></View>;
}
function ProductionSettingsCard({ useRemnants, autoSaveHistory, busy, onToggleRemnants, onToggleHistory }: { useRemnants: boolean; autoSaveHistory: boolean; busy: boolean; onToggleRemnants(value: boolean): void; onToggleHistory(value: boolean): void }) {
  const [expanded, setExpanded] = useState(false);
  return <View style={styles.productionSettingsCard}><TouchableOpacity accessibilityRole="button" accessibilityLabel={expanded ? '생산 설정 접기' : '생산 설정 펼치기'} accessibilityState={{ expanded }} onPress={() => setExpanded((current) => !current)} style={styles.productionSettingsHeader}><View><Text style={styles.productionSettingsTitle}>생산 설정</Text><Text style={styles.productionSettingsHint}>재단 조건 · 자투리 사용 · 작업이력 자동저장</Text></View><Text style={styles.productionSettingsToggle}>{expanded ? '⌃' : '⌄'}</Text></TouchableOpacity>{expanded && <View style={styles.productionSettingsBody}><FixedProductionConditions /><View style={styles.switchCard}><View style={styles.switchCopy}><Text style={styles.switchTitle}>자투리 사용</Text><Text style={styles.switchDescription}>{useRemnants ? '브랜드 기준으로 사용 가능한 자투리를 먼저 배치합니다.' : '새 원본 롤만 계산합니다. 필요할 때 켜 주세요.'}</Text></View><Switch accessibilityLabel="자투리 사용" value={useRemnants} disabled={busy} onValueChange={onToggleRemnants} trackColor={{ false: '#cbd5e1', true: '#99f6e4' }} thumbColor={useRemnants ? '#0f766e' : '#f8fafc'} /></View><View style={styles.historySwitchCard}><View style={styles.switchCopy}><Text style={styles.historySwitchTitle}>작업이력 자동저장</Text><Text style={styles.historySwitchDescription}>{autoSaveHistory ? '계산할 때마다 작업 이력에 자동 저장합니다.' : '기본 OFF: 계산 결과는 임시 상태로만 유지합니다. 프로젝트 저장을 눌러야 이력에 남습니다.'}</Text></View><Switch accessibilityLabel="작업이력 자동저장" value={autoSaveHistory} disabled={busy} onValueChange={onToggleHistory} trackColor={{ false: '#cbd5e1', true: '#93c5fd' }} thumbColor={autoSaveHistory ? '#2563eb' : '#f8fafc'} /></View></View>}</View>;
}
function PanelHeading({ step, title, subtitle, dark = false }: { step: string; title: string; subtitle: string; dark?: boolean }) { return <View style={styles.panelHeader}><View style={styles.panelHeaderCopy}><Text style={styles.panelTitle}>{title}</Text><Text style={styles.panelSubtitle}>{subtitle}</Text></View><View style={[styles.stepBadge, dark && styles.stepBadgeDark]}><Text style={[styles.stepText, dark && styles.stepTextLight]}>{step}</Text></View></View>; }
function Metric({ label, value, accent }: { label: string; value: string; accent: string }) { return <View style={styles.metric}><View style={[styles.metricAccent, { backgroundColor: accent }]} /><Text style={styles.metricLabel}>{label}</Text><Text style={styles.metricValue}>{value}</Text></View>; }
function BatchPlanSummary({ plans, mergedPlans, mergedJobs, busy, onConfirmBatch, onConfirmMergedInventory }: { plans: readonly GroupedPiecePlan[]; mergedPlans: readonly MergedGroupPlan[]; mergedJobs: readonly SavedMergedCuttingJob[]; busy: boolean; onConfirmBatch(): void; onConfirmMergedInventory(id: string): void }) {
  const produced = plans.reduce((sum, item) => sum + item.plan.remnantUses.reduce((inner, use) => inner + use.producedQuantity, 0) + (item.plan.newRollResult?.producedQuantity ?? 0), 0) + mergedPlans.reduce((sum, item) => sum + item.producedQuantity, 0);
  const newRollLength = plans.reduce((sum, item) => sum + (item.plan.newRollResult?.usedLengthMm ?? 0), 0) + mergedPlans.reduce((sum, item) => sum + item.result.usedLengthMm, 0);
  const pieceCount = plans.length + mergedPlans.reduce((sum, item) => sum + item.pieceCount, 0);
  return <View style={styles.batchSummary}><View style={styles.batchSummaryHeader}><View><Text style={styles.batchSummaryTitle}>그룹 통합 배치 결과</Text><Text style={styles.batchSummaryMeta}>{pieceCount}개 조각 · 생산 {produced}개 · 새 롤 {Math.round(newRollLength).toLocaleString()}mm</Text></View><TouchableOpacity accessibilityRole="button" accessibilityLabel="순차 그룹 재고 일괄 확정" disabled={busy || plans.length === 0} onPress={onConfirmBatch} style={[styles.batchConfirmButton, (busy || plans.length === 0) && styles.disabled]}><Text style={styles.batchConfirmButtonText}>{plans.length === 0 ? '개별 자투리 없음' : '순차 배치 일괄 확정'}</Text></TouchableOpacity></View>{plans.map((item) => <Text key={`${item.groupId}-${item.pieceId}`} style={styles.batchSummaryLine}>• {item.groupName} · {item.pieceName} · 자투리 {item.plan.remnantUses.length}개 · 새 롤 {item.plan.newRollQuantity}개</Text>)}{mergedPlans.length > 0 && <Text style={styles.batchWarning}>자동·번호 병합 롤은 상단 배치 미리보기에 한 번만 표시합니다. 도면에서 조각별 재단 완료를 체크하고, 아래에서 자투리 재고를 확정하세요.</Text>}{mergedPlans.map((item) => { const job = mergedJobs.find((candidate) => candidate.mergeGroupId === item.mergeGroupId); const mergeLabel = item.mergeGroupId === AUTO_MERGE_GROUP_ID ? '자동 병합' : `병합 ${item.mergeGroupId}`; return <View key={`merged-${item.mergeGroupId}`}><Text style={{ marginTop: 7, paddingTop: 7, borderTopWidth: 1, borderTopColor: '#99f6e4', fontSize: 10, lineHeight: 15, fontWeight: '800', color: '#0f766e' }}>{mergeLabel}: {item.groupNames.join(' + ')} · 자투리 {item.remnantUses.length}개 · 새 롤 {Math.round(item.result.usedLengthMm).toLocaleString()}mm · 총 생산 {item.producedQuantity}개 · 수율 {item.result.utilizationPercent}%</Text>{item.remnantUses.map((use) => <Text key={`${item.mergeGroupId}-${use.remnantId}`} style={styles.batchSummaryLine}>• 자투리 {use.remnantId} · {use.producedQuantity}개 · 새 롤 {Math.round(use.savedNewRollLengthMm).toLocaleString()}mm 절감</Text>)}<TouchableOpacity accessibilityRole="button" accessibilityLabel={`병합 ${item.mergeGroupId} 자투리 재고 확정`} disabled={busy || !job || job.isInventoryConfirmed} onPress={() => job && onConfirmMergedInventory(job.id)} style={[styles.batchConfirmButton, (busy || !job || job.isInventoryConfirmed) && styles.disabled]}><Text style={styles.batchConfirmButtonText}>{job?.isInventoryConfirmed ? '병합 재고 확정 완료' : '병합 롤 재고 확정'}</Text></TouchableOpacity></View>; })}</View>;
}
function messageOf(value: unknown): string { return value instanceof Error ? value.message : '요청을 처리하지 못했습니다.'; }
function safeFilename(value: string): string { return value.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').trim() || 'film-cutting-work-order'; }
function withProductionDefaults(form: CuttingFormState): CuttingFormState {
  const brand = form.brand.trim() || DEFAULT_BRANDS[0];
  return { ...form, brand, rollWidth: String(FIXED_ROLL_WIDTH_MM), gap: String(DEFAULT_GAP_MM), sideMargin: String(DEFAULT_SIDE_MARGIN_MM), startEndMargin: String(DEFAULT_START_END_MARGIN_MM), allowRotation: true };
}
function formFromRequest(request: RemnantPlanRequest): CuttingFormState {
  return withProductionDefaults({ brand: request.brand, productNumber: request.productNumber, rollWidth: String(request.rollWidthMm), pieceWidth: String(request.pieceWidthMm), pieceLength: String(request.pieceLengthMm), quantity: String(request.quantity), gap: String(request.gapMm), sideMargin: String(request.sideMarginMm), startEndMargin: String(request.startEndMarginMm), allowRotation: request.allowRotation });
}
function formFromSavedJob(job: SavedCuttingJob): CuttingFormState {
  return formFromRequest({ brand: job.brand, productNumber: job.productNumber, rollWidthMm: job.input.rollWidthMm, pieceWidthMm: job.input.pieceWidthMm, pieceLengthMm: job.input.pieceLengthMm, quantity: job.input.quantity, gapMm: job.input.gapMm, sideMarginMm: job.input.sideMarginMm, startEndMarginMm: job.input.startEndMarginMm, allowRotation: job.input.allowRotation, remnants: [] });
}
function nextInventory(library: LibraryDocument, useRemnants: boolean): FilmRemnant[] {
  return useRemnants ? library.remnants.map((item) => ({ ...item })) : [];
}
function sameRemnant(left: FilmRemnant, right: FilmRemnant): boolean {
  return left.id === right.id && left.brand === right.brand && left.productNumber === right.productNumber
    && left.widthMm === right.widthMm && left.lengthMm === right.lengthMm && left.quantity === right.quantity
    && left.createdAt === right.createdAt && left.updatedAt === right.updatedAt && left.note === right.note;
}
function aggregateInventoryDelta(plans: readonly GroupedPiecePlan[]): InventoryDelta {
  const initial = plans[0]?.inventoryBefore ?? [];
  const final = plans.at(-1)?.inventoryAfter ?? initial;
  const initialById = new Map(initial.map((item) => [item.id, item]));
  const finalById = new Map(final.map((item) => [item.id, item]));
  const removeIds: string[] = [];
  const add: FilmRemnant[] = [];
  const basedOnUpdatedAt: Record<string, string> = {};
  for (const source of initial) {
    const replacement = finalById.get(source.id);
    if (replacement && sameRemnant(source, replacement)) continue;
    removeIds.push(source.id);
    basedOnUpdatedAt[source.id] = source.updatedAt;
    if (replacement) add.push({ ...replacement });
  }
  for (const remnant of final) {
    if (!initialById.has(remnant.id)) add.push({ ...remnant });
  }
  return { removeIds, add, basedOnUpdatedAt };
}
function optionalCost(value: string | undefined): number | undefined {
  if (!value || value.trim().length === 0) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}
async function withBusy(operation: () => Promise<void>, setBusy: (value: boolean) => void, setError: (value: string | null) => void) { setBusy(true); setError(null); try { await operation(); } catch (caught) { setError(messageOf(caught)); } finally { setBusy(false); } }

const shadow = { shadowColor: '#0f172a', shadowOpacity: 0.08, shadowRadius: 22, shadowOffset: { width: 0, height: 8 }, elevation: 3 } as const;
const styles = StyleSheet.create({
  productionSettingsCard: { marginTop: 18, borderRadius: 12, borderWidth: 1, borderColor: '#bfdbfe', backgroundColor: '#f8fbff', overflow: 'hidden' }, productionSettingsHeader: { minHeight: 58, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14 }, productionSettingsTitle: { fontSize: 13, fontWeight: '900', color: '#1e3a8a' }, productionSettingsHint: { marginTop: 3, fontSize: 10, color: '#64748b' }, productionSettingsToggle: { fontSize: 20, color: '#2563eb' }, productionSettingsBody: { paddingHorizontal: 10, paddingBottom: 10 },
  pieceHeaderCopy: { flex: 1, minWidth: 0 }, pieceHeaderActions: { flexDirection: 'row', alignItems: 'center', gap: 5 }, addSubgroupButton: { minHeight: 32, justifyContent: 'center', paddingHorizontal: 8, borderRadius: 7, backgroundColor: '#0f766e' }, addSubgroupButtonText: { fontSize: 10, fontWeight: '800', color: '#fff' }, collapseButton: { minHeight: 32, justifyContent: 'center', paddingHorizontal: 10, borderRadius: 7, backgroundColor: '#e2e8f0' }, collapseButtonText: { fontSize: 10, fontWeight: '800', color: '#475569' }, subgroupCard: { position: 'relative', overflow: 'visible', marginTop: 10, padding: 8, borderRadius: 10, borderWidth: 1, borderColor: '#cbd5e1', backgroundColor: '#f8fafc' }, subgroupHeader: { flexDirection: 'row', alignItems: 'center', gap: 6 }, subgroupNameInput: { flex: 1, minHeight: 32, paddingHorizontal: 8, borderWidth: 1, borderColor: '#99f6e4', borderRadius: 7, backgroundColor: '#fff', fontSize: 12, fontWeight: '800', color: '#115e59' }, subgroupGroupSelectWrap: { position: 'relative', zIndex: 20 }, subgroupGroupSelect: { minHeight: 30, flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 7, borderWidth: 1, borderColor: '#93c5fd', borderRadius: 6, backgroundColor: '#eff6ff' }, subgroupGroupSelectText: { fontSize: 9, fontWeight: '800', color: '#1d4ed8' }, subgroupGroupSelectChevron: { fontSize: 11, color: '#2563eb' }, subgroupGroupOptions: { position: 'absolute', top: 33, right: 0, minWidth: 85, overflow: 'hidden', borderWidth: 1, borderColor: '#93c5fd', borderRadius: 7, backgroundColor: '#fff', ...shadow }, subgroupGroupOption: { minHeight: 30, justifyContent: 'center', paddingHorizontal: 9, borderBottomWidth: 1, borderBottomColor: '#eff6ff' }, subgroupGroupOptionActive: { backgroundColor: '#dbeafe' }, subgroupGroupOptionText: { fontSize: 10, color: '#475569' }, subgroupGroupOptionTextActive: { fontWeight: '800', color: '#1d4ed8' }, subgroupMeta: { fontSize: 10, color: '#64748b' }, subgroupToggle: { minHeight: 30, justifyContent: 'center', paddingHorizontal: 7, borderRadius: 6, backgroundColor: '#e2e8f0' }, subgroupToggleText: { fontSize: 9, fontWeight: '800', color: '#475569' }, emptySubgroup: { marginTop: 10, padding: 16, alignItems: 'center', borderRadius: 9, backgroundColor: '#f8fafc' }, emptySubgroupText: { fontSize: 11, color: '#64748b' },
  groupRows: { gap: 6, marginTop: 10, overflow: 'visible' }, groupRow: { position: 'relative', overflow: 'visible', minHeight: 46, flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 6, borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 9, backgroundColor: '#fff' }, groupRowActive: { borderColor: '#2563eb', backgroundColor: '#eff6ff' }, groupRowSelect: { flex: 1, minWidth: 48, minHeight: 42, flexDirection: 'row', alignItems: 'center', gap: 5 }, compactBrandField: { width: 82, flexGrow: 0, flexShrink: 0, position: 'relative', zIndex: 30 }, compactSelectButton: { minHeight: 32, paddingHorizontal: 7, borderRadius: 6 }, compactOptionList: { position: 'absolute', top: 38, left: 0, right: 0, marginTop: 0, zIndex: 100 }, groupProductInput: { width: 130, minWidth: 88, height: 32, flexShrink: 1, paddingHorizontal: 8, borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 6, fontSize: 10, fontWeight: '700', color: '#0f172a', backgroundColor: '#fff' }, groupRowAction: { width: 24, height: 38, flexShrink: 0, alignItems: 'center', justifyContent: 'center' }, addPieceBottomButton: { minHeight: 38, alignItems: 'center', justifyContent: 'center', marginTop: 8, borderRadius: 8, backgroundColor: '#0f766e' },
  mergedPreviewNotice: { flex: 1, minHeight: 360, marginTop: 14, padding: 18, alignItems: 'center', justifyContent: 'center', borderRadius: 12, borderWidth: 1, borderColor: '#99f6e4', backgroundColor: '#f0fdfa' }, mergedPreviewNoticeTitle: { fontSize: 16, fontWeight: '900', color: '#115e59', textAlign: 'center' }, mergedPreviewNoticeText: { maxWidth: 420, marginTop: 8, fontSize: 12, lineHeight: 19, color: '#0f766e', textAlign: 'center' },
  page: { flex: 1, backgroundColor: '#f1f5f9' }, pageContent: { width: '100%', maxWidth: 1400, alignSelf: 'center', paddingHorizontal: 20, paddingTop: 32, paddingBottom: 72 }, pageContentSmall: { paddingHorizontal: 12, paddingTop: 20 },
  header: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'flex-end', gap: 18, marginBottom: 24 }, headerCopy: { flex: 1, minWidth: 240 }, headerActions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 9 },
  eyebrow: { fontSize: 11, letterSpacing: 1.8, fontWeight: '800', color: '#2563eb' }, title: { marginTop: 6, fontSize: 32, lineHeight: 40, fontWeight: '800', letterSpacing: -0.8, color: '#0f172a' }, description: { marginTop: 7, fontSize: 14, lineHeight: 21, color: '#64748b' },
  modeBadge: { minHeight: 44, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 15, borderRadius: 999, backgroundColor: '#dbeafe' }, modeText: { fontSize: 12, fontWeight: '800', color: '#1d4ed8' }, resetButton: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 15, borderRadius: 10, borderWidth: 1, borderColor: '#cbd5e1', backgroundColor: '#fff' }, resetText: { fontSize: 12, fontWeight: '700', color: '#475569' },
  message: { marginBottom: 18, padding: 13, borderRadius: 10, borderWidth: 1 }, messageInfo: { borderColor: '#bfdbfe', backgroundColor: '#eff6ff' }, messageError: { borderColor: '#fecaca', backgroundColor: '#fff1f2' }, messageInfoText: { color: '#1e40af' }, messageErrorText: { color: '#991b1b' },
  workspace: { gap: 20 }, workspaceWide: { flexDirection: 'row', alignItems: 'stretch' }, panel: { minWidth: 0, padding: 21, borderRadius: 20, backgroundColor: '#fff', ...shadow }, inputPanelWide: { width: 450, flexShrink: 0 }, previewPanel: { flex: 1, minHeight: 560 },
  panelHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 20 }, panelHeaderCopy: { flex: 1 }, panelTitle: { fontSize: 20, fontWeight: '800', color: '#0f172a' }, panelSubtitle: { marginTop: 5, fontSize: 12, lineHeight: 18, color: '#64748b' }, stepBadge: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: '#eff6ff' }, stepBadgeDark: { backgroundColor: '#0f172a' }, stepText: { fontSize: 12, fontWeight: '800', color: '#2563eb' }, stepTextLight: { color: '#fff' },
  projectContext: { marginTop: 12, marginBottom: 6, padding: 12, borderRadius: 10, borderWidth: 1, borderColor: '#dbeafe', backgroundColor: '#eff6ff' }, projectContextLabel: { fontSize: 11, fontWeight: '700', color: '#64748b' }, projectContextName: { marginTop: 3, fontSize: 17, fontWeight: '800', color: '#1e3a8a' }, projectContextHint: { marginTop: 4, fontSize: 11, color: '#475569' }, identityGrid: { position: 'relative', zIndex: 20, flexDirection: 'row', flexWrap: 'wrap', gap: 10 }, textField: { minWidth: 170, flex: 1 }, brandField: { minWidth: 170, flex: 1, position: 'relative', zIndex: 30 }, label: { marginBottom: 6, fontSize: 12, fontWeight: '700', color: '#475569' }, textInput: { minHeight: 46, paddingHorizontal: 12, borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 10, fontSize: 15, fontWeight: '700', color: '#0f172a', backgroundColor: '#f8fafc' }, selectButton: { minHeight: 46, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 10, backgroundColor: '#f8fafc' }, selectText: { fontSize: 15, fontWeight: '700', color: '#0f172a' }, selectPlaceholder: { color: '#94a3b8' }, selectChevron: { fontSize: 18, color: '#64748b' }, optionList: { position: 'relative', zIndex: 100, width: '100%', marginTop: 6, overflow: 'hidden', borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 10, backgroundColor: '#fff', ...shadow }, optionRow: { flexDirection: 'row', alignItems: 'stretch', backgroundColor: '#fff' }, option: { flex: 1, minHeight: 42, justifyContent: 'center', paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' }, optionSelected: { backgroundColor: '#eff6ff' }, optionText: { fontSize: 14, color: '#334155' }, optionTextSelected: { color: '#1d4ed8', fontWeight: '800' }, brandDeleteButton: { width: 42, minHeight: 42, alignItems: 'center', justifyContent: 'center', borderBottomWidth: 1, borderBottomColor: '#f1f5f9', backgroundColor: '#fff' }, brandDeleteText: { fontSize: 20, lineHeight: 22, color: '#dc2626' }, brandAddRow: { flexDirection: 'row', alignItems: 'center', gap: 6, padding: 8, backgroundColor: '#f8fafc' }, brandAddInput: { flex: 1, minHeight: 36, paddingHorizontal: 9, borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 7, fontSize: 12, color: '#0f172a', backgroundColor: '#fff' }, brandAddButton: { minHeight: 36, justifyContent: 'center', paddingHorizontal: 12, borderRadius: 7, backgroundColor: '#2563eb' }, brandAddButtonText: { fontSize: 11, fontWeight: '800', color: '#fff' }, brandError: { paddingHorizontal: 9, paddingBottom: 7, fontSize: 10, color: '#b91c1c', backgroundColor: '#f8fafc' },
  mergeControl: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#dbeafe' }, mergeControlLabel: { fontSize: 10, fontWeight: '800', color: '#475569' }, mergeControlButton: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 7, backgroundColor: '#fff' }, mergeControlButtonActive: { borderColor: '#0f766e', backgroundColor: '#0f766e' }, mergeControlText: { fontSize: 11, fontWeight: '800', color: '#64748b' }, mergeControlTextActive: { color: '#fff' }, mergeControlHint: { flex: 1, minWidth: 150, fontSize: 10, color: '#64748b' },
  groupInputPanel: { marginBottom: 17, padding: 12, borderRadius: 13, borderWidth: 1, borderColor: '#dbeafe', backgroundColor: '#f8fbff' }, groupInputHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }, groupInputTitle: { fontSize: 14, fontWeight: '800', color: '#1e3a8a' }, groupInputHint: { marginTop: 3, fontSize: 10, color: '#64748b' }, hierarchyRole: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10, marginBottom: 8 }, hierarchyBadge: { paddingHorizontal: 7, paddingVertical: 3, borderRadius: 999, backgroundColor: '#dbeafe', color: '#1d4ed8', fontSize: 9, fontWeight: '800' }, hierarchyRoleText: { flex: 1, fontSize: 10, color: '#475569' }, addGroupButton: { minHeight: 34, justifyContent: 'center', paddingHorizontal: 10, borderRadius: 8, backgroundColor: '#2563eb' }, addGroupButtonText: { fontSize: 11, fontWeight: '800', color: '#fff' }, groupChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 11 }, groupChip: { minHeight: 48, maxWidth: '100%', flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 9, backgroundColor: '#fff' }, groupChipActive: { borderColor: '#2563eb', backgroundColor: '#eff6ff' }, groupChipMain: { minWidth: 120, maxWidth: 190, minHeight: 46, flexDirection: 'row', alignItems: 'center', gap: 6, paddingLeft: 9, paddingRight: 4 }, groupChipIndex: { width: 19, height: 19, textAlign: 'center', borderRadius: 10, backgroundColor: '#e2e8f0', fontSize: 10, lineHeight: 19, fontWeight: '800', color: '#475569' }, groupChipIndexActive: { backgroundColor: '#2563eb', color: '#fff' }, groupChipCopy: { flex: 1, minWidth: 0 }, groupChipText: { flexShrink: 1, fontSize: 11, fontWeight: '700', color: '#475569' }, groupChipTextActive: { color: '#1d4ed8' }, groupChipMeta: { marginTop: 2, fontSize: 9, color: '#64748b' }, groupChipAction: { width: 24, height: 43, alignItems: 'center', justifyContent: 'center' }, groupDeleteText: { fontSize: 17, color: '#ef4444' }, groupNameInput: { minWidth: 86, height: 30, paddingHorizontal: 5, borderWidth: 1, borderColor: '#93c5fd', borderRadius: 5, fontSize: 11, backgroundColor: '#fff' }, groupIdInput: { width: 32, height: 30, paddingHorizontal: 2, borderWidth: 1, borderColor: '#93c5fd', borderRadius: 5, fontSize: 11, textAlign: 'center', color: '#1e3a8a', backgroundColor: '#fff' },
  pieceInputPanel: { marginBottom: 15, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: '#e2e8f0', backgroundColor: '#fff' }, pieceInputHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }, pieceInputTitle: { fontSize: 13, fontWeight: '800', color: '#334155' }, pieceInputUnitHint: { marginTop: 2, fontSize: 10, fontWeight: '800', color: '#0f766e' }, pieceInputHint: { marginTop: 3, fontSize: 10, color: '#64748b' }, addPieceButton: { minHeight: 34, justifyContent: 'center', paddingHorizontal: 10, borderRadius: 8, backgroundColor: '#0f766e' }, addPieceButtonText: { fontSize: 11, fontWeight: '800', color: '#fff' }, pieceRows: { gap: 6, marginTop: 10 }, pieceRowCard: { minHeight: 46, overflow: 'hidden', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 8, backgroundColor: '#f8fafc' }, pieceRowCardActive: { borderColor: '#0f766e', backgroundColor: '#f0fdfa' }, pieceRowContent: { flexGrow: 1, minHeight: 46, minWidth: '100%', flexDirection: 'row', alignItems: 'center' }, pieceRowMain: { flex: 1, flexBasis: 100, minWidth: 78, minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 5 }, pieceIndex: { width: 18, height: 18, textAlign: 'center', borderRadius: 9, backgroundColor: '#e2e8f0', fontSize: 9, lineHeight: 18, fontWeight: '800', color: '#64748b' }, pieceIndexActive: { backgroundColor: '#0f766e', color: '#fff' }, pieceCopy: { flex: 1, minWidth: 0 }, pieceName: { fontSize: 10, fontWeight: '700', color: '#475569' }, pieceNameActive: { color: '#115e59' }, pieceMeta: { marginTop: 2, fontSize: 9, color: '#64748b' }, pieceGroupIdLabel: { marginRight: 1, fontSize: 9, fontWeight: '800', color: '#64748b' }, pieceGroupIdInput: { width: 26, height: 30, flexShrink: 0, paddingHorizontal: 1, borderWidth: 1, borderColor: '#93c5fd', borderRadius: 5, fontSize: 10, textAlign: 'center', color: '#1e3a8a', backgroundColor: '#fff' }, pieceEditButton: { width: 24, height: 36, flexShrink: 0, alignItems: 'center', justifyContent: 'center' }, pieceEditButtonText: { fontSize: 12, fontWeight: '800', color: '#0f766e' }, pieceEditRow: { flex: 1, minWidth: 0, minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 7 }, pieceEditPrefix: { minHeight: 34, justifyContent: 'center', paddingLeft: 2 }, pieceEditPrefixText: { fontSize: 12, fontWeight: '800', color: '#115e59' }, pieceIdInput: { flex: 1, minWidth: 55, minHeight: 34, paddingHorizontal: 8, borderWidth: 1, borderColor: '#5eead4', borderRadius: 7, backgroundColor: '#fff', fontSize: 12, color: '#0f172a' }, pieceEditAction: { minHeight: 34, justifyContent: 'center', paddingHorizontal: 8, borderRadius: 6, backgroundColor: '#0f766e' }, pieceEditActionText: { fontSize: 10, fontWeight: '800', color: '#fff' }, pieceEditCancel: { minHeight: 34, justifyContent: 'center', paddingHorizontal: 5 }, pieceEditCancelText: { fontSize: 10, color: '#64748b' }, pieceEditError: { width: '100%', paddingHorizontal: 9, paddingBottom: 6, fontSize: 10, color: '#b91c1c' }, pieceCardFields: { flex: 3, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 1 }, compactField: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 1 }, compactFieldLabel: { fontSize: 9, fontWeight: '800', color: '#64748b' }, compactInputWrap: { flex: 1, minWidth: 0, height: 32, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 6, backgroundColor: '#fff' }, compactInput: { flex: 1, minWidth: 14, height: 30, paddingHorizontal: 0, fontSize: 11, fontWeight: '700', color: '#0f172a', textAlign: 'center' }, compactUnit: { paddingHorizontal: 0, fontSize: 8, fontWeight: '700', color: '#94a3b8' }, compactStepperButton: { width: 17, height: 28, alignItems: 'center', justifyContent: 'center', borderRadius: 4, backgroundColor: '#e2e8f0' }, compactStepperText: { fontSize: 13, lineHeight: 15, color: '#334155' }, pieceDelete: { width: 24, height: 40, flexShrink: 0, alignItems: 'center', justifyContent: 'center' }, pieceDeleteText: { fontSize: 18, color: '#ef4444' },
  group: { marginTop: 18, paddingTop: 17, borderTopWidth: 1, borderTopColor: '#e2e8f0' }, groupTitle: { marginBottom: 11, fontSize: 14, fontWeight: '800', color: '#1e293b' }, stepHint: { fontSize: 10, fontWeight: '600', color: '#94a3b8' }, fieldGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 }, field: { minWidth: 130, flexGrow: 1, flexBasis: '46%' }, inputWrap: { minHeight: 46, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 10, backgroundColor: '#f8fafc' }, input: { flex: 1, minHeight: 44, minWidth: 36, paddingHorizontal: 7, fontSize: 15, fontWeight: '700', color: '#0f172a', textAlign: 'center' }, unit: { paddingHorizontal: 3, fontSize: 10, fontWeight: '700', color: '#94a3b8' }, stepperButton: { width: 34, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 8, backgroundColor: '#e2e8f0' }, stepperText: { fontSize: 20, lineHeight: 22, color: '#334155' }, fixedConditions: { marginTop: 18, padding: 14, borderRadius: 12, borderWidth: 1, borderColor: '#bfdbfe', backgroundColor: '#eff6ff' }, fixedConditionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, fixedBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999, backgroundColor: '#dbeafe', color: '#1d4ed8', fontSize: 10, fontWeight: '800' }, fixedConditionText: { marginTop: 5, fontSize: 11, color: '#1e40af' }, switchCard: { minHeight: 66, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 13, marginTop: 15, padding: 14, borderRadius: 12, backgroundColor: '#f0fdfa' }, historySwitchCard: { minHeight: 66, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 13, marginTop: 10, padding: 14, borderRadius: 12, backgroundColor: '#eff6ff' }, switchCopy: { flex: 1 }, switchTitle: { fontSize: 13, fontWeight: '800', color: '#115e59' }, switchDescription: { marginTop: 3, fontSize: 10, lineHeight: 15, color: '#0f766e' }, historySwitchTitle: { fontSize: 13, fontWeight: '800', color: '#1e3a8a' }, historySwitchDescription: { marginTop: 3, fontSize: 10, lineHeight: 15, color: '#1d4ed8' }, primaryButton: { minHeight: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, marginTop: 16, borderRadius: 12, backgroundColor: '#2563eb' }, primaryButtonText: { fontSize: 14, fontWeight: '800', color: '#fff' }, arrow: { fontSize: 19, color: '#bfdbfe' }, disabled: { opacity: 0.45 },
  resultSection: { marginTop: 22, padding: 22, borderRadius: 20, backgroundColor: '#fff', ...shadow }, resultHeading: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 10 }, resultHeadingActions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'flex-end', gap: 8 }, planningLink: { minHeight: 34, justifyContent: 'center', paddingHorizontal: 10, borderRadius: 8, backgroundColor: '#eff6ff' }, planningLinkText: { fontSize: 10, fontWeight: '800', color: '#1d4ed8' }, resultTitle: { marginTop: 4, fontSize: 23, fontWeight: '800', color: '#0f172a' }, statusBadge: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999 }, statusText: { fontSize: 12, fontWeight: '800' }, statusDetail: { marginTop: 8, fontSize: 12, lineHeight: 18, color: '#64748b' }, resultMovedNotice: { marginTop: 16, padding: 16, borderRadius: 14, borderWidth: 1, borderColor: '#bfdbfe', backgroundColor: '#eff6ff' }, resultMovedTitle: { fontSize: 14, fontWeight: '800', color: '#1e3a8a' }, resultMovedText: { marginTop: 5, fontSize: 11, lineHeight: 17, color: '#1d4ed8' }, resultMovedButton: { alignSelf: 'flex-start', marginTop: 12, minHeight: 40, justifyContent: 'center', paddingHorizontal: 14, borderRadius: 9, backgroundColor: '#2563eb' }, resultMovedButtonText: { fontSize: 12, fontWeight: '800', color: '#fff' }, resultBatchLink: { marginTop: 10, padding: 12, borderRadius: 10, backgroundColor: '#f8fafc' }, resultBatchLinkText: { fontSize: 11, lineHeight: 17, color: '#475569' }, workflowCard: { marginTop: 16, padding: 16, borderRadius: 14, borderWidth: 1, borderColor: '#e2e8f0', backgroundColor: '#fff' }, workflowTitle: { fontSize: 14, fontWeight: '800', color: '#334155' }, workflowText: { marginTop: 4, fontSize: 11, lineHeight: 17, color: '#64748b' },
  metrics: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 18 }, metric: { minWidth: 170, flex: 1, padding: 15, overflow: 'hidden', borderRadius: 12, borderWidth: 1, borderColor: '#e2e8f0', backgroundColor: '#f8fafc' }, metricAccent: { position: 'absolute', top: 0, bottom: 0, left: 0, width: 4 }, metricLabel: { marginLeft: 3, fontSize: 11, color: '#64748b' }, metricValue: { marginTop: 6, marginLeft: 3, fontSize: 19, fontWeight: '800', color: '#0f172a' }, batchSummary: { marginTop: 14, padding: 13, borderRadius: 11, borderWidth: 1, borderColor: '#99f6e4', backgroundColor: '#f0fdfa' }, batchSummaryHeader: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8 }, batchSummaryTitle: { fontSize: 12, fontWeight: '800', color: '#115e59' }, batchSummaryMeta: { fontSize: 10, color: '#0f766e' }, batchSummaryLine: { marginTop: 5, fontSize: 10, lineHeight: 15, color: '#475569' }, useList: { marginTop: 14, gap: 5 }, useLine: { fontSize: 11, lineHeight: 17, color: '#475569' }, batchConfirmButton: { minHeight: 38, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 11, borderRadius: 8, backgroundColor: '#0f766e' }, batchConfirmButtonText: { fontSize: 10, fontWeight: '800', color: '#fff' }, batchWarning: { marginTop: 10, padding: 9, borderRadius: 8, fontSize: 10, lineHeight: 15, color: '#92400e', backgroundColor: '#fffbeb' },
  candidateCard: { marginTop: 14, padding: 14, borderRadius: 12, borderWidth: 1, borderColor: '#fde68a', backgroundColor: '#fffbeb' }, candidateHeader: { marginBottom: 8 }, candidateTitle: { fontSize: 12, fontWeight: '800', color: '#92400e' }, candidateHint: { marginTop: 3, fontSize: 10, lineHeight: 15, color: '#a16207' }, candidateRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 7, marginTop: 6, padding: 9, borderRadius: 8, backgroundColor: '#fff' }, candidateRowBest: { borderWidth: 1, borderColor: '#f59e0b', backgroundColor: '#fef3c7' }, candidateName: { minWidth: 70, fontSize: 11, fontWeight: '800', color: '#78350f' }, candidateValue: { flex: 1, minWidth: 150, fontSize: 10, color: '#57534e' }, candidateSaving: { fontSize: 10, fontWeight: '700', color: '#b45309' }, candidateSavingBest: { color: '#92400e' },
  mergedSourceNotice: { marginTop: 14, padding: 13, borderRadius: 11, borderWidth: 1, borderColor: '#99f6e4', backgroundColor: '#f0fdfa' }, mergedSourceNoticeTitle: { fontSize: 12, fontWeight: '800', color: '#115e59' }, mergedSourceNoticeText: { marginTop: 4, fontSize: 11, lineHeight: 17, color: '#0f766e' }, confirmBar: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 17, padding: 14, borderRadius: 12, borderWidth: 1 }, tentativeBar: { borderColor: '#fbbf24', backgroundColor: '#fffbeb' }, confirmedBar: { borderColor: '#6ee7b7', backgroundColor: '#ecfdf5' }, completeBar: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 12, padding: 14, borderRadius: 12, borderWidth: 1 }, completeBarPending: { borderColor: '#cbd5e1', backgroundColor: '#f8fafc' }, completeBarDone: { borderColor: '#86efac', backgroundColor: '#f0fdf4' }, confirmCopy: { flex: 1, minWidth: 210 }, confirmTitle: { fontSize: 14, fontWeight: '800', color: '#1e293b' }, confirmMeta: { marginTop: 3, fontSize: 11, lineHeight: 17, color: '#64748b' }, confirmButton: { minHeight: 46, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18, borderRadius: 10, backgroundColor: '#0f172a' }, confirmButtonText: { fontSize: 13, fontWeight: '800', color: '#fff' }, completeButton: { minHeight: 46, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18, borderRadius: 10, backgroundColor: '#047857' }, completeButtonText: { fontSize: 13, fontWeight: '800', color: '#fff' }, exportRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 9, marginTop: 12 }, secondaryButton: { minHeight: 46, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16, borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 10, backgroundColor: '#fff' }, secondaryButtonText: { fontSize: 12, fontWeight: '800', color: '#334155' }, libraryGrid: { gap: 20, marginTop: 22 }, libraryGridWide: { flexDirection: 'row', alignItems: 'flex-start' },
  overlayGroupPanel: { position: 'relative', zIndex: 40, elevation: 40, overflow: 'visible' },
  overlayPiecePanel: { position: 'relative', zIndex: 20, elevation: 20, overflow: 'visible' },
  compactPieceRowMain: { flexBasis: 78, minWidth: 58, gap: 3, paddingHorizontal: 3 },
  expandedPieceCardFields: { flex: 3.8, gap: 4, paddingHorizontal: 2 },
  dropdownHeader: { position: 'relative', zIndex: 100, elevation: 100 },
  dropdownRows: { position: 'relative', zIndex: 1, elevation: 1 },
  topmostDropdown: { zIndex: 1000, elevation: 1000 },
});
