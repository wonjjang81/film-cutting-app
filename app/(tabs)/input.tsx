import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';
import { Platform, ScrollView, StyleSheet, Switch, Text, TextInput, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';

import { FilmLayoutPreview } from '../../src/features/cutting/FilmLayoutPreview';
import { MergedRollPlacementList, MergedRollPreview } from '../../src/features/cutting/MergedRollPreview';
import { PlacementList } from '../../src/features/cutting/PlacementList';
import { compareContinuousRollCandidates, type ContinuousRollCandidateComparison, type Placement } from '../../src/features/cutting/optimizeContinuousRollLayout';
import { createLayoutSvgMarkup } from '../../src/features/cutting/createLayoutSvgMarkup';
import { createCsv } from '../../src/features/export/createCsv';
import { createWorkOrderHtml } from '../../src/features/export/createWorkOrderHtml';
import { LibraryDrawer } from '../../src/features/library/LibraryDrawer';
import { createAppLibraryRepository } from '../../src/features/library/libraryRepositoryFactory';
import type { InventoryDelta } from '../../src/features/library/libraryRepository';
import type { FilmPreset, FilmRemnant, LibraryDocument, SavedCuttingJob, SavedMergedCuttingJob } from '../../src/features/library/models';
import { AUTO_SAVE_HISTORY_STORAGE_KEY, parseAutoSaveHistory } from '../../src/features/library/autoSaveHistory';
import { buildSavedCuttingJob, createUniqueUiId, type CuttingFormState, toRemnantPlanRequest } from '../../src/features/library/uiWorkflowHelpers';
import { planWithRemnants, type RemnantPlan, type RemnantPlanRequest } from '../../src/features/remnants/planWithRemnants';
import { AUTO_MERGE_GROUP_ID, DISABLED_MERGE_GROUP_ID, planGroupedPieces, planMergedGroups, type GroupedPiecePlan, type GroupedPieceRequest, type MergedGroupPlan } from '../../src/features/remnants/planGroupedPieces';
import { RemnantInventoryPanel, type PlannedRemnantSummary, type RemnantDraft } from '../../src/features/remnants/RemnantInventoryPanel';
import { EstimateSummary } from '../../src/features/estimate/EstimateSummary';
import { createCurrentEstimateSnapshot, CURRENT_GROUP_ESTIMATE_STORAGE_KEY } from '../../src/features/estimate/currentGroupEstimate';

const repository = createAppLibraryRepository();
const emptyLibrary: LibraryDocument = { version: 1, presets: [], jobs: [], remnants: [], mergedJobs: [] };
const BRAND_OPTIONS = ['영림', '현대', 'Lx', '삼성'] as const;
const FIXED_ROLL_WIDTH_MM = 1220;
const DEFAULT_GAP_MM = 0;
const DEFAULT_SIDE_MARGIN_MM = 5;
const DEFAULT_START_END_MARGIN_MM = 5;
const initialForm: CuttingFormState = {
  brand: BRAND_OPTIONS[0], productNumber: '', rollWidth: String(FIXED_ROLL_WIDTH_MM), pieceWidth: '0', pieceLength: '0',
  quantity: '1', gap: String(DEFAULT_GAP_MM), sideMargin: String(DEFAULT_SIDE_MARGIN_MM), startEndMargin: String(DEFAULT_START_END_MARGIN_MM), allowRotation: true,
};
type CuttingPieceDraft = { id: string; name: string; form: CuttingFormState };
type CuttingGroupDraft = { id: string; name: string; form: CuttingFormState; pieces: CuttingPieceDraft[]; mergeGroupId?: string; filmName: string; materialCostPerM: string; constructionCostPerM2: string };
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
function newPieceDraft(index: number): CuttingPieceDraft {
  return { id: index === 1 ? 'piece-1' : `piece-${Date.now()}-${index}`, name: `조각 ${index}`, form: { ...initialForm } };
}
function newGroupDraft(index: number): CuttingGroupDraft {
  const piece = newPieceDraft(1);
  return { id: index === 1 ? 'group-1' : `group-${Date.now()}-${index}`, name: `그룹 ${index}`, form: piece.form, pieces: [piece], mergeGroupId: AUTO_MERGE_GROUP_ID, filmName: '', materialCostPerM: '', constructionCostPerM2: '' };
}
const statusCopy = {
  exact: { title: '완전 최적', detail: '안전 예산 안에서 전체 우선순위를 정확히 계산했습니다.', tone: '#047857', bg: '#ecfdf5' },
  certified: { title: '하한 인증', detail: '원단 절약 경로가 물리적 최소 길이에 도달했습니다.', tone: '#0369a1', bg: '#e0f2fe' },
  approximate: { title: '원단 절약 계산', detail: '브라우저 안전 경로의 결과이며 전역 최적을 보장하지 않습니다.', tone: '#b45309', bg: '#fffbeb' },
} as const;

export default function FilmCutInputScreen() {
  const { jobId: routeJobId } = useLocalSearchParams<{ jobId?: string }>();
  const routedJobRef = useRef<string | null>(null);
  const { width } = useWindowDimensions();
  const wide = width >= 1000;
  const libraryWide = width >= 1160;
  const [form, setForm] = useState<CuttingFormState>(initialForm);
  const [groups, setGroups] = useState<CuttingGroupDraft[]>(() => [newGroupDraft(1)]);
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
  const activeMergedUsage = useMemo(() => {
    if (!activeMergedPlan) return undefined;
    const placedAreaMm2 = [
      ...activeMergedPlan.result.placements,
      ...activeMergedPlan.remnantUses.flatMap((use) => use.placements),
    ].reduce((sum, placement) => sum + placement.width * placement.height, 0);
    return { materialLengthMm: activeMergedPlan.result.usedLengthMm, productAreaM2: placedAreaMm2 / 1_000_000 };
  }, [activeMergedPlan]);
  const activeMergedUtilizationPercent = useMemo(() => {
    if (!activeMergedPlan) return undefined;
    const productAreaMm2 = activeMergedUsage?.productAreaM2 ?? 0;
    const materialAreaMm2 = activeMergedPlan.result.usedLengthMm * FIXED_ROLL_WIDTH_MM
      + activeMergedPlan.remnantUses.reduce((sum, use) => sum + use.widthMm * use.result.usedLengthMm, 0);
    return materialAreaMm2 > 0 ? Math.round((productAreaMm2 * 1_000_000 / materialAreaMm2) * 1000) / 10 : 0;
  }, [activeMergedPlan, activeMergedUsage]);

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

  const updateActiveForm: React.Dispatch<React.SetStateAction<CuttingFormState>> = (updater) => {
    setForm((current) => {
      const next = typeof updater === 'function' ? updater(current) : updater;
      setGroups((items) => items.map((group) => group.id === activeGroupId ? { ...group, form: next, pieces: group.pieces.map((piece) => piece.id === activePieceId ? { ...piece, form: next } : piece) } : group));
      return next;
    });
  };
  const selectGroup = (group: CuttingGroupDraft) => {
    saveActivePlanView();
    const piece = group.pieces[0]!;
    setActiveGroupId(group.id); setActivePieceId(piece.id); setForm(piece.form); restorePlanView(group.id, piece.id);
  };
  const selectPiece = (piece: CuttingPieceDraft) => {
    saveActivePlanView();
    setActivePieceId(piece.id); setForm(piece.form); setGroups((items) => items.map((item) => item.id === activeGroupId ? { ...item, form: piece.form } : item)); restorePlanView(activeGroupId, piece.id);
  };
  const addPiece = () => {
    const group = groups.find((item) => item.id === activeGroupId); if (!group) return;
    const next = newPieceDraft(group.pieces.length + 1);
    setGroups((items) => items.map((item) => item.id === activeGroupId ? { ...item, form: next.form, pieces: [...item.pieces, next] } : item));
    setActivePieceId(next.id); setForm(next.form); setPlan(null); setPlanRequest(null); setDraftJob(null); setBatchPlans(null); setMergedGroupPlans([]);
  };
  const deletePiece = (id: string) => {
    const group = groups.find((item) => item.id === activeGroupId); if (!group || group.pieces.length <= 1) return;
    const remaining = group.pieces.filter((piece) => piece.id !== id);
    setGroups((items) => items.map((item) => item.id === activeGroupId ? { ...item, pieces: remaining, form: remaining[0]!.form } : item));
    if (id === activePieceId) selectPiece(remaining[0]!);
  };
  const addGroup = () => {
    const next = newGroupDraft(groups.length + 1);
    setGroups((items) => [...items, next]); setActiveGroupId(next.id); setActivePieceId(next.pieces[0]!.id); setForm(next.form); setPlan(null); setDraftJob(null); setPlanRequest(null); setMergedGroupPlans([]);
  };
  const renameGroup = (id: string, name: string) => setGroups((items) => items.map((group) => group.id === id ? { ...group, name: name.trim() || group.name } : group));
  const deleteGroup = (id: string) => {
    if (groups.length <= 1) return;
    const remaining = groups.filter((group) => group.id !== id);
    setGroups(remaining);
    if (id === activeGroupId) selectGroup(remaining[0]!);
  };
  useEffect(() => { void refreshLibrary().catch((caught) => setError(messageOf(caught))); }, [refreshLibrary]);
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
        return { groupId: group.id, groupName: group.name, pieceId: piece.id, pieceName: piece.name, mergeGroupId: group.mergeGroupId, request: toRemnantPlanRequest(normalized, []), filmName: group.filmName, materialCostPerM: optionalCost(group.materialCostPerM), constructionCostPerM2: optionalCost(group.constructionCostPerM2) };
      }));
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
    const fresh = newGroupDraft(1); setGroups([fresh]); setActiveGroupId(fresh.id); setActivePieceId(fresh.pieces[0]!.id); setForm(fresh.form); setUseRemnants(false); setPlan(null); setPlanRequest(null); setDraftJob(null); setPendingBatchSave(null); setBatchPlans(null); setMergedGroupPlans([]); setSavedGroupPlanViews({}); setCandidateComparison([]); setConfirmed(false); setCuttingComplete(false); setManualPlacements(null); setCheckedPlacementIds([]); setError(null); setNotice(null);
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
      if (pendingBatchSave) {
        await repository.saveBatchJobs(pendingBatchSave.jobs, pendingBatchSave.mergedJobs);
        setPendingBatchSave(null);
        await refreshLibrary();
        setNotice('계산된 전체 그룹 작업 이력을 저장했습니다.');
      } else if (draftJob) {
        await repository.saveJob(draftJob);
        await refreshLibrary();
        setNotice('현재 계산 결과를 프로젝트로 저장했습니다.');
      }
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
  const resultStatus = draftJob ? statusCopy[draftJob.result.optimizationStatus] : null;
  const displayedNewRollLengthMm = activeMergedPlan?.result.usedLengthMm ?? plan?.newRollResult?.usedLengthMm ?? 0;
  const displayedNewRollQuantity = activeMergedPlan?.result.producedQuantity ?? plan?.newRollQuantity ?? 0;
  const displayedRemnantCount = activeMergedPlan?.remnantUses.length ?? plan?.remnantUses.length ?? 0;
  const displayedUtilizationPercent = activeMergedUtilizationPercent ?? draftJob?.result.utilizationPercent ?? 0;

  return (
    <ScrollView style={styles.page} contentContainerStyle={[styles.pageContent, width < 420 && styles.pageContentSmall]} keyboardShouldPersistTaps="handled" nestedScrollEnabled>
      <View style={styles.header}>
        <View style={styles.headerCopy}><Text style={styles.eyebrow}>CONTINUOUS ROLL WORKSPACE</Text><Text style={styles.title} accessibilityRole="header">필름 재단 생산 계획</Text><Text style={styles.description}>자투리를 먼저 사용하고 부족한 수량만 새 연속 롤에서 계산합니다.</Text></View>
        <View style={styles.headerActions}><View style={styles.modeBadge}><Text style={styles.modeText}>원단 절약 우선</Text></View><TouchableOpacity accessibilityRole="button" onPress={reset} disabled={busy} style={[styles.resetButton, busy && styles.disabled]}><Text style={styles.resetText}>입력 초기화</Text></TouchableOpacity></View>
      </View>
      {(error || notice) && <View accessibilityLiveRegion="polite" style={[styles.message, error ? styles.messageError : styles.messageInfo]}><Text style={error ? styles.messageErrorText : styles.messageInfoText}>{error ?? notice}</Text></View>}

      <View style={[styles.workspace, wide && styles.workspaceWide]}>
        <View style={[styles.panel, wide && styles.inputPanelWide]}>
          <PanelHeading step="01" title="생산 조건" subtitle="모든 치수 단위는 mm입니다." />
          <GroupInputPanel groups={groups} activeGroupId={activeGroupId} onSelect={selectGroup} onAdd={addGroup} onRename={renameGroup} onDelete={deleteGroup} onMergeGroup={(id, mergeGroupId) => setGroups((items) => items.map((group) => group.id === id ? { ...group, mergeGroupId } : group))} onSettings={(id, patch) => setGroups((items) => items.map((group) => group.id === id ? { ...group, ...patch } : group))} />
          <PieceInputPanel group={groups.find((group) => group.id === activeGroupId)!} activePieceId={activePieceId} onSelect={selectPiece} onAdd={addPiece} onDelete={deletePiece} />
          <View style={styles.identityGrid}><BrandSelect value={form.brand} onChange={(brand) => updateActiveForm((current) => ({ ...current, brand }))} /><TextField label="제품 번호 (선택)" value={form.productNumber} onChange={(productNumber) => updateActiveForm((current) => ({ ...current, productNumber }))} /></View>
          <FormSection title={`${groups.find((group) => group.id === activeGroupId)?.name ?? '현재 그룹'} · ${groups.find((group) => group.id === activeGroupId)?.pieces.find((piece) => piece.id === activePieceId)?.name ?? '현재 조각'} 생산 조건`} fields={[[ 'pieceWidth', '재단 폭', 'mm' ], [ 'pieceLength', '재단 길이', 'mm' ], [ 'quantity', '필요 수량', '개' ]]} form={form} setForm={updateActiveForm} />
          <FixedProductionConditions />
          <View style={styles.switchCard}><View style={styles.switchCopy}><Text style={styles.switchTitle}>자투리 사용</Text><Text style={styles.switchDescription}>{useRemnants ? '브랜드 기준으로 사용 가능한 자투리를 먼저 배치합니다.' : '새 원본 롤만 계산합니다. 필요할 때 켜 주세요.'}</Text></View><Switch accessibilityLabel="자투리 사용" value={useRemnants} disabled={busy} onValueChange={(value) => { setUseRemnants(value); void calculate(form, value); }} trackColor={{ false: '#cbd5e1', true: '#99f6e4' }} thumbColor={useRemnants ? '#0f766e' : '#f8fafc'} /></View>
          <View style={styles.historySwitchCard}><View style={styles.switchCopy}><Text style={styles.historySwitchTitle}>작업이력 자동저장</Text><Text style={styles.historySwitchDescription}>{autoSaveHistory ? '계산할 때마다 작업 이력에 자동 저장합니다.' : '기본 OFF: 계산 결과는 임시 상태로만 유지합니다. 프로젝트 저장을 눌러야 이력에 남습니다.'}</Text></View><Switch accessibilityLabel="작업이력 자동저장" value={autoSaveHistory} disabled={busy} onValueChange={toggleAutoSaveHistory} trackColor={{ false: '#cbd5e1', true: '#93c5fd' }} thumbColor={autoSaveHistory ? '#2563eb' : '#f8fafc'} /></View>
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="현재 그룹의 모든 조각 자동 배치 계산" disabled={busy} onPress={() => void calculateGroup()} style={[styles.primaryButton, busy && styles.disabled]}><Text style={styles.primaryButtonText}>{busy ? '처리 중…' : '현재 조각 배치'}</Text><Text style={styles.arrow}>→</Text></TouchableOpacity>
        </View>
        <View style={[styles.panel, styles.previewPanel]}><PanelHeading step="02" title="배치 미리보기" subtitle={activeMergedPlan ? '병합 롤 도면과 조각별 재단 완료 상태를 확인합니다.' : (preview?.title ?? '계산 후 연속 롤 도면을 표시합니다.')} dark />{activeMergedPlan ? <MergedRollPreview plan={activeMergedPlan} job={activeMergedJob} busy={busy} hidePlacementList onToggleComplete={activeMergedJob ? () => void toggleMergedComplete(activeMergedJob.id) : undefined} onTogglePlacementComplete={activeMergedJob ? (placementId) => void toggleMergedPlacementComplete(activeMergedJob.id, placementId) : undefined} /> : <FilmLayoutPreview result={previewResult} rollWidthMm={preview?.widthMm ?? Number(form.rollWidth)} sideMarginMm={preview?.sideMarginMm ?? Number(form.sideMargin)} startEndMarginMm={preview?.startEndMarginMm ?? Number(form.startEndMargin)} completedPlacementIds={checkedPlacementIds} />}</View>
      </View>

      {plan && draftJob && resultStatus && <View style={styles.resultSection} accessibilityRole="summary">
        <View style={styles.resultHeading}><View><Text style={styles.eyebrow}>MATERIAL PLAN</Text><Text style={styles.resultTitle}>원단 사용 계획</Text></View><View style={[styles.statusBadge, { backgroundColor: resultStatus.bg }]}><Text style={[styles.statusText, { color: resultStatus.tone }]}>{resultStatus.title}</Text></View></View>
        <Text style={styles.statusDetail}>{resultStatus.detail}</Text>
        <View style={styles.metrics}><Metric label="자투리 사용" value={`${displayedRemnantCount}개`} accent="#0f766e" /><Metric label="새 롤 재단 수량" value={`${displayedNewRollQuantity}개`} accent="#2563eb" /><Metric label="총 새 롤 사용 길이" value={`${displayedNewRollLengthMm.toLocaleString()} mm`} accent="#7c3aed" /><Metric label="전체 면적 수율" value={`${displayedUtilizationPercent}%`} accent="#059669" />{plan.newRollResult?.optimizationStatus === 'approximate' && <Metric label="물리 하한과 차이" value={`${Math.round(plan.newRollResult.optimalityGapMm).toLocaleString()} mm`} accent="#f59e0b" />}</View>
        {candidateComparison.length > 1 && <View style={styles.candidateCard}><View style={styles.candidateHeader}><Text style={styles.candidateTitle}>대규모 입력 배치 후보 비교</Text><Text style={styles.candidateHint}>최적 혼합 결과를 기준으로 방향별 새 롤 절감량을 비교합니다.</Text></View>{candidateComparison.map((candidate) => <View key={candidate.name} style={[styles.candidateRow, candidate.name === '최적 혼합' && styles.candidateRowBest]}><Text style={styles.candidateName}>{candidate.name}</Text><Text style={styles.candidateValue}>{candidate.result.producedQuantity.toLocaleString()}개 · {Math.round(candidate.result.usedLengthMm).toLocaleString()}mm</Text><Text style={[styles.candidateSaving, candidate.name === '최적 혼합' && styles.candidateSavingBest]}>{candidate.name === '최적 혼합' ? '기준 결과' : `혼합 대비 ${Math.round(candidate.savedLengthMm).toLocaleString()}mm 절감`}</Text></View>)}</View>}
        {batchPlans && <BatchPlanSummary plans={batchPlans} mergedPlans={mergedGroupPlans} mergedJobs={[...library.mergedJobs, ...(pendingBatchSave?.mergedJobs ?? [])]} busy={busy} onConfirmBatch={() => void confirmBatch()} onConfirmMergedInventory={(id) => void confirmMergedInventory(id)} />}
        {plan.remnantUses.length > 0 && <View style={styles.useList}>{plan.remnantUses.map((use, index) => <Text key={`${use.remnantId}-${index}`} style={styles.useLine}>• {use.remnantId} · {use.producedQuantity}개 생산 · 새 롤 {use.savedNewRollLengthMm.toLocaleString()}mm 절감 · {statusCopy[use.result.optimizationStatus].title}</Text>)}</View>}
        {activeMergedPlan ? <><MergedRollPlacementList plan={activeMergedPlan} job={activeMergedJob} busy={busy} onTogglePlacementComplete={activeMergedJob ? (placementId) => void toggleMergedPlacementComplete(activeMergedJob.id, placementId) : undefined} /><View style={styles.mergedSourceNotice}><Text style={styles.mergedSourceNoticeTitle}>병합 롤 전체 조각</Text><Text style={styles.mergedSourceNoticeText}>현재 조각은 병합 롤에 포함되어 개별 수동 배치·확정하지 않습니다. 원단 사용 계획의 배치 목록에서 전체 재단 완료와 재고 확정을 진행하세요.</Text></View></> : <>{previewResult && <PlacementList result={previewResult} rollWidthMm={preview?.widthMm ?? Number(form.rollWidth)} sideMarginMm={preview?.sideMarginMm ?? Number(form.sideMargin)} startEndMarginMm={preview?.startEndMarginMm ?? Number(form.startEndMargin)} onPlacementsChange={setManualPlacements} onCheckedIdsChange={setCheckedPlacementIds} checkedPlacementIds={checkedPlacementIds} />}
          <View style={[styles.completeBar, cuttingComplete ? styles.completeBarDone : styles.completeBarPending]}><View style={styles.confirmCopy}><Text style={styles.confirmTitle}>{cuttingComplete ? '재단 완료 체크됨' : '재단 완료 체크'}</Text><Text style={styles.confirmMeta}>{cuttingComplete ? '현장 재단 완료 상태가 프로젝트에 저장되었습니다.' : '실제 재단이 끝난 뒤 체크하면 작업 이력에 상태가 남습니다.'}</Text></View><TouchableOpacity accessibilityRole="button" accessibilityLabel="재단 완료 상태 변경" disabled={busy} onPress={() => void markCuttingComplete()} style={[styles.completeButton, busy && styles.disabled]}><Text style={styles.completeButtonText}>{cuttingComplete ? '완료 해제' : '재단 완료'}</Text></TouchableOpacity></View>
          <View style={[styles.confirmBar, confirmed ? styles.confirmedBar : styles.tentativeBar]}><View style={styles.confirmCopy}><Text style={styles.confirmTitle}>{confirmed ? '재고 반영 완료' : '재고 미반영'}</Text><Text style={styles.confirmMeta}>{confirmed ? '작업 이력과 잔여 자투리를 저장했습니다.' : '계산만 완료된 상태입니다. 확정 전에는 재고가 바뀌지 않습니다.'}</Text></View><TouchableOpacity accessibilityRole="button" accessibilityLabel="작업 확정 및 자투리 재고 반영" disabled={busy || confirmed} onPress={confirmJob} style={[styles.confirmButton, (busy || confirmed) && styles.disabled]}><Text style={styles.confirmButtonText}>{confirmed ? '확정 완료' : '작업 확정'}</Text></TouchableOpacity></View></>}
        <EstimateSummary job={draftJob} compact discountRateOverride={0} usageOverride={activeMergedUsage} />
        <View style={styles.exportRow}><TouchableOpacity accessibilityRole="button" accessibilityLabel="프로젝트 저장" disabled={busy} onPress={() => void saveProject()} style={[styles.secondaryButton, busy && styles.disabled]}><Text style={styles.secondaryButtonText}>프로젝트 저장</Text></TouchableOpacity><TouchableOpacity accessibilityRole="button" accessibilityLabel="프로젝트 라이브러리 내보내기" disabled={busy} onPress={() => void exportLibrary()} style={[styles.secondaryButton, busy && styles.disabled]}><Text style={styles.secondaryButtonText}>백업 내보내기</Text></TouchableOpacity><TouchableOpacity accessibilityRole="button" accessibilityLabel="프로젝트 라이브러리 불러오기" disabled={busy} onPress={() => void importLibrary()} style={[styles.secondaryButton, busy && styles.disabled]}><Text style={styles.secondaryButtonText}>백업 불러오기</Text></TouchableOpacity><TouchableOpacity accessibilityRole="button" accessibilityLabel="CSV 작업지시서 내보내기" disabled={busy} onPress={exportCsv} style={[styles.secondaryButton, busy && styles.disabled]}><Text style={styles.secondaryButtonText}>CSV 내보내기</Text></TouchableOpacity><TouchableOpacity accessibilityRole="button" accessibilityLabel="PDF 작업지시서 인쇄 또는 공유" disabled={busy} onPress={exportPdf} style={[styles.secondaryButton, busy && styles.disabled]}><Text style={styles.secondaryButtonText}>PDF·인쇄</Text></TouchableOpacity></View>
      </View>}

      <View style={[styles.libraryGrid, libraryWide && styles.libraryGridWide]}>
        <RemnantInventoryPanel brand={form.brand} productNumber={form.productNumber} remnants={library.remnants} plannedUses={plannedUses} identifiersReady={identifiersReady} busy={busy} onSave={saveRemnant} onDelete={deleteRemnant} />
        <LibraryDrawer presets={library.presets} identifiersReady={identifiersReady} busy={busy} onSavePreset={() => void savePreset()} onLoadPreset={loadPreset} onDeletePreset={(id) => void deletePreset(id)} />
      </View>
    </ScrollView>
  );
}

type NumericKey = Exclude<keyof CuttingFormState, 'brand' | 'productNumber' | 'allowRotation'>;
function FormSection({ title, fields, form, setForm }: { title: string; fields: [NumericKey, string, string][]; form: CuttingFormState; setForm: React.Dispatch<React.SetStateAction<CuttingFormState>> }) {
  return <View style={styles.group}><Text style={styles.groupTitle}>{title}</Text><View style={styles.fieldGrid}>{fields.map(([key, label, unit]) => <NumericField key={key} label={label} unit={unit} value={form[key]} integer={key === 'quantity'} step={key === 'quantity' ? 1 : 50} min={key === 'quantity' ? 1 : 0} onChange={(value) => setForm((current) => ({ ...current, [key]: value }))} />)}</View></View>;
}
function GroupInputPanel({ groups, activeGroupId, onSelect, onAdd, onRename, onDelete, onMergeGroup, onSettings }: { groups: CuttingGroupDraft[]; activeGroupId: string; onSelect(group: CuttingGroupDraft): void; onAdd(): void; onRename(id: string, name: string): void; onDelete(id: string): void; onMergeGroup(id: string, mergeGroupId: string | undefined): void; onSettings(id: string, patch: Partial<Pick<CuttingGroupDraft, 'filmName' | 'materialCostPerM' | 'constructionCostPerM2'>>): void }) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const finishRename = () => { if (editingId) onRename(editingId, editingName); setEditingId(null); };
  const activeGroup = groups.find((group) => group.id === activeGroupId);
  const activeMergeGroupId = activeGroup?.mergeGroupId;
  const mergeLabel = activeMergeGroupId === DISABLED_MERGE_GROUP_ID
    ? '병합하지 않음'
    : activeMergeGroupId === AUTO_MERGE_GROUP_ID
      ? '자동 병합 · 전체 그룹을 한 롤 후보로 계산합니다.'
      : '같은 번호 그룹을 하나의 혼합 롤로 계산합니다.';
  return <View style={styles.groupInputPanel}>
    <View style={styles.groupInputHeader}><View><Text style={styles.groupInputTitle}>그룹 입력</Text><Text style={styles.groupInputHint}>그룹을 선택해 조건을 입력하고 순서대로 계산합니다.</Text></View><TouchableOpacity accessibilityRole="button" accessibilityLabel="새 그룹 추가" onPress={onAdd} style={styles.addGroupButton}><Text style={styles.addGroupButtonText}>＋ 그룹 추가</Text></TouchableOpacity></View>
    <View style={styles.groupChips}>{groups.map((group, index) => <View key={group.id} style={[styles.groupChip, group.id === activeGroupId && styles.groupChipActive]}><TouchableOpacity accessibilityRole="button" accessibilityState={{ selected: group.id === activeGroupId }} onPress={() => onSelect(group)} style={styles.groupChipMain}>{editingId === group.id ? <TextInput accessibilityLabel={`${group.name} 이름`} autoFocus value={editingName} onChangeText={setEditingName} onBlur={finishRename} onSubmitEditing={finishRename} returnKeyType="done" style={styles.groupNameInput} /> : <><Text style={[styles.groupChipIndex, group.id === activeGroupId && styles.groupChipIndexActive]}>{index + 1}</Text><View style={styles.groupChipCopy}><Text style={[styles.groupChipText, group.id === activeGroupId && styles.groupChipTextActive]} numberOfLines={1}>{group.name}</Text><Text style={styles.groupChipMeta} numberOfLines={1}>{group.form.brand} · {group.form.pieceWidth || '—'}×{group.form.pieceLength || '—'} · {group.form.quantity || '—'}개{group.mergeGroupId && group.mergeGroupId !== DISABLED_MERGE_GROUP_ID ? ` · ${group.mergeGroupId === AUTO_MERGE_GROUP_ID ? '자동 병합' : `병합 ${group.mergeGroupId}`}` : ''}</Text></View></>}</TouchableOpacity>{editingId !== group.id && <TouchableOpacity accessibilityLabel={`${group.name} 이름 변경`} onPress={() => { setEditingId(group.id); setEditingName(group.name); }} style={styles.groupChipAction}><Text>✎</Text></TouchableOpacity>}{groups.length > 1 && <TouchableOpacity accessibilityLabel={`${group.name} 삭제`} onPress={() => onDelete(group.id)} style={styles.groupChipAction}><Text style={styles.groupDeleteText}>×</Text></TouchableOpacity>}</View>)}</View>
    <View style={styles.mergeControl}><Text style={styles.mergeControlLabel}>현재 그룹 병합 번호</Text>{['1', '2', '3'].map((value) => <TouchableOpacity key={value} accessibilityRole="button" accessibilityState={{ selected: activeMergeGroupId === value }} onPress={() => onMergeGroup(activeGroupId, activeMergeGroupId === value ? DISABLED_MERGE_GROUP_ID : value)} style={[styles.mergeControlButton, activeMergeGroupId === value && styles.mergeControlButtonActive]}><Text style={[styles.mergeControlText, activeMergeGroupId === value && styles.mergeControlTextActive]}>{value}</Text></TouchableOpacity>)}<Text style={styles.mergeControlHint}>{mergeLabel}</Text></View>
    {activeGroup && <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 }}><TextInput accessibilityLabel="그룹 필름명" value={activeGroup.filmName} onChangeText={(value) => onSettings(activeGroup.id, { filmName: value })} placeholder="그룹 필름명" placeholderTextColor="#94a3b8" style={{ flex: 1, minWidth: 120, minHeight: 36, paddingHorizontal: 9, borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 7, fontSize: 11, color: '#0f172a', backgroundColor: '#fff' }} /><TextInput accessibilityLabel="그룹 원단 단가" value={activeGroup.materialCostPerM} onChangeText={(value) => onSettings(activeGroup.id, { materialCostPerM: value.replace(/[^0-9]/g, '') })} placeholder="원단 단가 원/m" placeholderTextColor="#94a3b8" keyboardType="numeric" style={{ flex: 1, minWidth: 110, minHeight: 36, paddingHorizontal: 9, borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 7, fontSize: 11, color: '#0f172a', backgroundColor: '#fff' }} /><TextInput accessibilityLabel="그룹 시공 단가" value={activeGroup.constructionCostPerM2} onChangeText={(value) => onSettings(activeGroup.id, { constructionCostPerM2: value.replace(/[^0-9]/g, '') })} placeholder="시공 단가 원/m²" placeholderTextColor="#94a3b8" keyboardType="numeric" style={{ flex: 1, minWidth: 110, minHeight: 36, paddingHorizontal: 9, borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 7, fontSize: 11, color: '#0f172a', backgroundColor: '#fff' }} /></View>}
  </View>;
}
function PieceInputPanel({ group, activePieceId, onSelect, onAdd, onDelete }: { group: CuttingGroupDraft; activePieceId: string; onSelect(piece: CuttingPieceDraft): void; onAdd(): void; onDelete(id: string): void }) {
  return <View style={styles.pieceInputPanel}>
    <View style={styles.pieceInputHeader}><View><Text style={styles.pieceInputTitle}>{group.name} 조각 입력</Text><Text style={styles.pieceInputHint}>기존 앱처럼 한 그룹에 여러 재단 조각을 추가할 수 있습니다.</Text></View><TouchableOpacity accessibilityRole="button" accessibilityLabel="현재 그룹에 조각 추가" onPress={onAdd} style={styles.addPieceButton}><Text style={styles.addPieceButtonText}>＋ 조각 추가</Text></TouchableOpacity></View>
    <View style={styles.pieceRows}>{group.pieces.map((piece, index) => <View key={piece.id} style={[styles.pieceRowCard, piece.id === activePieceId && styles.pieceRowCardActive]}><TouchableOpacity accessibilityRole="button" accessibilityState={{ selected: piece.id === activePieceId }} onPress={() => onSelect(piece)} style={styles.pieceRowMain}><Text style={[styles.pieceIndex, piece.id === activePieceId && styles.pieceIndexActive]}>{index + 1}</Text><View style={styles.pieceCopy}><Text style={[styles.pieceName, piece.id === activePieceId && styles.pieceNameActive]}>{piece.name}</Text><Text style={styles.pieceMeta}>{piece.form.pieceWidth || '—'} × {piece.form.pieceLength || '—'} mm · {piece.form.quantity || '—'}개</Text></View></TouchableOpacity>{group.pieces.length > 1 && <TouchableOpacity accessibilityLabel={`${piece.name} 삭제`} onPress={() => onDelete(piece.id)} style={styles.pieceDelete}><Text style={styles.pieceDeleteText}>×</Text></TouchableOpacity>}</View>)}</View>
  </View>;
}
function NumericField({ label, unit, value, onChange, integer = false, step = 1, min = 0 }: { label: string; unit: string; value: string; onChange(value: string): void; integer?: boolean; step?: number; min?: number }) {
  const adjust = (direction: -1 | 1) => { const current = Number(value); const base = Number.isFinite(current) ? current : min; onChange(String(Math.max(min, base + direction * step))); };
  return <View style={styles.field}><Text style={styles.label}>{label} <Text style={styles.stepHint}>({step}{unit} 단위)</Text></Text><View style={styles.inputWrap}><TouchableOpacity accessibilityRole="button" accessibilityLabel={`${label} ${step}${unit} 감소`} onPress={() => adjust(-1)} style={styles.stepperButton}><Text style={styles.stepperText}>−</Text></TouchableOpacity><TextInput accessibilityLabel={`${label} ${unit}`} inputMode="decimal" keyboardType="numeric" selectTextOnFocus style={styles.input} value={value} onChangeText={(text) => onChange(text.replace(integer ? /[^0-9]/g : /[^0-9.]/g, ''))} /><Text style={styles.unit}>{unit}</Text><TouchableOpacity accessibilityRole="button" accessibilityLabel={`${label} ${step}${unit} 증가`} onPress={() => adjust(1)} style={styles.stepperButton}><Text style={styles.stepperText}>＋</Text></TouchableOpacity></View></View>;
}
function TextField({ label, value, onChange }: { label: string; value: string; onChange(value: string): void }) { return <View style={styles.textField}><Text style={styles.label}>{label}</Text><TextInput accessibilityLabel={label} autoCapitalize="none" value={value} onChangeText={onChange} style={styles.textInput} placeholder={`${label} 입력`} placeholderTextColor="#94a3b8" /></View>; }
function BrandSelect({ value, onChange }: { value: string; onChange(value: string): void }) {
  const [open, setOpen] = useState(false);
  return <View style={styles.brandField}>
    <Text style={styles.label}>제품 브랜드</Text>
    <TouchableOpacity accessibilityRole="combobox" accessibilityLabel="제품 브랜드" accessibilityState={{ expanded: open }} onPress={() => setOpen((current) => !current)} style={styles.selectButton}>
      <Text style={[styles.selectText, !value && styles.selectPlaceholder]}>{value || '브랜드 선택'}</Text><Text style={styles.selectChevron}>{open ? '⌃' : '⌄'}</Text>
    </TouchableOpacity>
    {open && <View style={styles.optionList}>{BRAND_OPTIONS.map((brand) => <TouchableOpacity key={brand} accessibilityRole="button" accessibilityState={{ selected: value === brand }} onPress={() => { onChange(brand); setOpen(false); }} style={[styles.option, value === brand && styles.optionSelected]}><Text style={[styles.optionText, value === brand && styles.optionTextSelected]}>{brand}</Text></TouchableOpacity>)}</View>}
  </View>;
}
function FixedProductionConditions() {
  return <View style={styles.fixedConditions}><View style={styles.fixedConditionHeader}><Text style={styles.groupTitle}>재단 조건</Text><Text style={styles.fixedBadge}>고정</Text></View><Text style={styles.fixedConditionText}>원본 롤 폭 {FIXED_ROLL_WIDTH_MM.toLocaleString()} mm</Text><Text style={styles.fixedConditionText}>간격 {DEFAULT_GAP_MM} mm · 좌우 여백 {DEFAULT_SIDE_MARGIN_MM} mm · 시작·끝 여백 {DEFAULT_START_END_MARGIN_MM} mm</Text></View>;
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
  const brand = BRAND_OPTIONS.includes(form.brand as (typeof BRAND_OPTIONS)[number]) ? form.brand : BRAND_OPTIONS[0];
  return { ...form, brand, rollWidth: String(FIXED_ROLL_WIDTH_MM), gap: String(DEFAULT_GAP_MM), sideMargin: String(DEFAULT_SIDE_MARGIN_MM), startEndMargin: String(DEFAULT_START_END_MARGIN_MM), allowRotation: true };
}
function formFromRequest(request: RemnantPlanRequest): CuttingFormState {
  return withProductionDefaults({ brand: request.brand, productNumber: request.productNumber, rollWidth: String(request.rollWidthMm), pieceWidth: String(request.pieceWidthMm), pieceLength: String(request.pieceLengthMm), quantity: String(request.quantity), gap: String(request.gapMm), sideMargin: String(request.sideMarginMm), startEndMargin: String(request.startEndMarginMm), allowRotation: request.allowRotation });
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
  mergedPreviewNotice: { flex: 1, minHeight: 360, marginTop: 14, padding: 18, alignItems: 'center', justifyContent: 'center', borderRadius: 12, borderWidth: 1, borderColor: '#99f6e4', backgroundColor: '#f0fdfa' }, mergedPreviewNoticeTitle: { fontSize: 16, fontWeight: '900', color: '#115e59', textAlign: 'center' }, mergedPreviewNoticeText: { maxWidth: 420, marginTop: 8, fontSize: 12, lineHeight: 19, color: '#0f766e', textAlign: 'center' },
  page: { flex: 1, backgroundColor: '#f1f5f9' }, pageContent: { width: '100%', maxWidth: 1400, alignSelf: 'center', paddingHorizontal: 20, paddingTop: 32, paddingBottom: 72 }, pageContentSmall: { paddingHorizontal: 12, paddingTop: 20 },
  header: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'flex-end', gap: 18, marginBottom: 24 }, headerCopy: { flex: 1, minWidth: 240 }, headerActions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 9 },
  eyebrow: { fontSize: 11, letterSpacing: 1.8, fontWeight: '800', color: '#2563eb' }, title: { marginTop: 6, fontSize: 32, lineHeight: 40, fontWeight: '800', letterSpacing: -0.8, color: '#0f172a' }, description: { marginTop: 7, fontSize: 14, lineHeight: 21, color: '#64748b' },
  modeBadge: { minHeight: 44, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 15, borderRadius: 999, backgroundColor: '#dbeafe' }, modeText: { fontSize: 12, fontWeight: '800', color: '#1d4ed8' }, resetButton: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 15, borderRadius: 10, borderWidth: 1, borderColor: '#cbd5e1', backgroundColor: '#fff' }, resetText: { fontSize: 12, fontWeight: '700', color: '#475569' },
  message: { marginBottom: 18, padding: 13, borderRadius: 10, borderWidth: 1 }, messageInfo: { borderColor: '#bfdbfe', backgroundColor: '#eff6ff' }, messageError: { borderColor: '#fecaca', backgroundColor: '#fff1f2' }, messageInfoText: { color: '#1e40af' }, messageErrorText: { color: '#991b1b' },
  workspace: { gap: 20 }, workspaceWide: { flexDirection: 'row', alignItems: 'stretch' }, panel: { minWidth: 0, padding: 21, borderRadius: 20, backgroundColor: '#fff', ...shadow }, inputPanelWide: { width: 450, flexShrink: 0 }, previewPanel: { flex: 1, minHeight: 560 },
  panelHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 20 }, panelHeaderCopy: { flex: 1 }, panelTitle: { fontSize: 20, fontWeight: '800', color: '#0f172a' }, panelSubtitle: { marginTop: 5, fontSize: 12, lineHeight: 18, color: '#64748b' }, stepBadge: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: '#eff6ff' }, stepBadgeDark: { backgroundColor: '#0f172a' }, stepText: { fontSize: 12, fontWeight: '800', color: '#2563eb' }, stepTextLight: { color: '#fff' },
  identityGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 }, textField: { minWidth: 170, flex: 1 }, brandField: { minWidth: 170, flex: 1, zIndex: 10 }, label: { marginBottom: 6, fontSize: 12, fontWeight: '700', color: '#475569' }, textInput: { minHeight: 46, paddingHorizontal: 12, borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 10, fontSize: 15, fontWeight: '700', color: '#0f172a', backgroundColor: '#f8fafc' }, selectButton: { minHeight: 46, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 10, backgroundColor: '#f8fafc' }, selectText: { fontSize: 15, fontWeight: '700', color: '#0f172a' }, selectPlaceholder: { color: '#94a3b8' }, selectChevron: { fontSize: 18, color: '#64748b' }, optionList: { position: 'absolute', top: 73, left: 0, right: 0, overflow: 'hidden', borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 10, backgroundColor: '#fff', ...shadow }, option: { minHeight: 42, justifyContent: 'center', paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' }, optionSelected: { backgroundColor: '#eff6ff' }, optionText: { fontSize: 14, color: '#334155' }, optionTextSelected: { color: '#1d4ed8', fontWeight: '800' },
  mergeControl: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#dbeafe' }, mergeControlLabel: { fontSize: 10, fontWeight: '800', color: '#475569' }, mergeControlButton: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 7, backgroundColor: '#fff' }, mergeControlButtonActive: { borderColor: '#0f766e', backgroundColor: '#0f766e' }, mergeControlText: { fontSize: 11, fontWeight: '800', color: '#64748b' }, mergeControlTextActive: { color: '#fff' }, mergeControlHint: { flex: 1, minWidth: 150, fontSize: 10, color: '#64748b' },
  groupInputPanel: { marginBottom: 17, padding: 12, borderRadius: 13, borderWidth: 1, borderColor: '#dbeafe', backgroundColor: '#f8fbff' }, groupInputHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }, groupInputTitle: { fontSize: 14, fontWeight: '800', color: '#1e3a8a' }, groupInputHint: { marginTop: 3, fontSize: 10, color: '#64748b' }, addGroupButton: { minHeight: 34, justifyContent: 'center', paddingHorizontal: 10, borderRadius: 8, backgroundColor: '#2563eb' }, addGroupButtonText: { fontSize: 11, fontWeight: '800', color: '#fff' }, groupChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 11 }, groupChip: { minHeight: 48, maxWidth: '100%', flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 9, backgroundColor: '#fff' }, groupChipActive: { borderColor: '#2563eb', backgroundColor: '#eff6ff' }, groupChipMain: { minWidth: 120, maxWidth: 190, minHeight: 46, flexDirection: 'row', alignItems: 'center', gap: 6, paddingLeft: 9, paddingRight: 4 }, groupChipIndex: { width: 19, height: 19, textAlign: 'center', borderRadius: 10, backgroundColor: '#e2e8f0', fontSize: 10, lineHeight: 19, fontWeight: '800', color: '#475569' }, groupChipIndexActive: { backgroundColor: '#2563eb', color: '#fff' }, groupChipCopy: { flex: 1, minWidth: 0 }, groupChipText: { flexShrink: 1, fontSize: 11, fontWeight: '700', color: '#475569' }, groupChipTextActive: { color: '#1d4ed8' }, groupChipMeta: { marginTop: 2, fontSize: 9, color: '#64748b' }, groupChipAction: { width: 24, height: 43, alignItems: 'center', justifyContent: 'center' }, groupDeleteText: { fontSize: 17, color: '#ef4444' }, groupNameInput: { minWidth: 86, height: 30, paddingHorizontal: 5, borderWidth: 1, borderColor: '#93c5fd', borderRadius: 5, fontSize: 11, backgroundColor: '#fff' },
  pieceInputPanel: { marginBottom: 15, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: '#e2e8f0', backgroundColor: '#fff' }, pieceInputHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }, pieceInputTitle: { fontSize: 13, fontWeight: '800', color: '#334155' }, pieceInputHint: { marginTop: 3, fontSize: 10, color: '#64748b' }, addPieceButton: { minHeight: 34, justifyContent: 'center', paddingHorizontal: 10, borderRadius: 8, backgroundColor: '#0f766e' }, addPieceButtonText: { fontSize: 11, fontWeight: '800', color: '#fff' }, pieceRows: { gap: 6, marginTop: 10 }, pieceRowCard: { minHeight: 46, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 8, backgroundColor: '#f8fafc' }, pieceRowCardActive: { borderColor: '#0f766e', backgroundColor: '#f0fdfa' }, pieceRowMain: { flex: 1, minWidth: 0, minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 9 }, pieceIndex: { width: 20, height: 20, textAlign: 'center', borderRadius: 10, backgroundColor: '#e2e8f0', fontSize: 10, lineHeight: 20, fontWeight: '800', color: '#64748b' }, pieceIndexActive: { backgroundColor: '#0f766e', color: '#fff' }, pieceCopy: { flex: 1, minWidth: 0 }, pieceName: { fontSize: 11, fontWeight: '700', color: '#475569' }, pieceNameActive: { color: '#115e59' }, pieceMeta: { marginTop: 2, fontSize: 9, color: '#64748b' }, pieceDelete: { width: 32, height: 44, alignItems: 'center', justifyContent: 'center' }, pieceDeleteText: { fontSize: 18, color: '#ef4444' },
  group: { marginTop: 18, paddingTop: 17, borderTopWidth: 1, borderTopColor: '#e2e8f0' }, groupTitle: { marginBottom: 11, fontSize: 14, fontWeight: '800', color: '#1e293b' }, stepHint: { fontSize: 10, fontWeight: '600', color: '#94a3b8' }, fieldGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 }, field: { minWidth: 130, flexGrow: 1, flexBasis: '46%' }, inputWrap: { minHeight: 46, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 10, backgroundColor: '#f8fafc' }, input: { flex: 1, minHeight: 44, minWidth: 36, paddingHorizontal: 7, fontSize: 15, fontWeight: '700', color: '#0f172a', textAlign: 'center' }, unit: { paddingHorizontal: 3, fontSize: 10, fontWeight: '700', color: '#94a3b8' }, stepperButton: { width: 34, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 8, backgroundColor: '#e2e8f0' }, stepperText: { fontSize: 20, lineHeight: 22, color: '#334155' }, fixedConditions: { marginTop: 18, padding: 14, borderRadius: 12, borderWidth: 1, borderColor: '#bfdbfe', backgroundColor: '#eff6ff' }, fixedConditionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, fixedBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999, backgroundColor: '#dbeafe', color: '#1d4ed8', fontSize: 10, fontWeight: '800' }, fixedConditionText: { marginTop: 5, fontSize: 11, color: '#1e40af' }, switchCard: { minHeight: 66, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 13, marginTop: 15, padding: 14, borderRadius: 12, backgroundColor: '#f0fdfa' }, historySwitchCard: { minHeight: 66, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 13, marginTop: 10, padding: 14, borderRadius: 12, backgroundColor: '#eff6ff' }, switchCopy: { flex: 1 }, switchTitle: { fontSize: 13, fontWeight: '800', color: '#115e59' }, switchDescription: { marginTop: 3, fontSize: 10, lineHeight: 15, color: '#0f766e' }, historySwitchTitle: { fontSize: 13, fontWeight: '800', color: '#1e3a8a' }, historySwitchDescription: { marginTop: 3, fontSize: 10, lineHeight: 15, color: '#1d4ed8' }, primaryButton: { minHeight: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, marginTop: 16, borderRadius: 12, backgroundColor: '#2563eb' }, primaryButtonText: { fontSize: 14, fontWeight: '800', color: '#fff' }, arrow: { fontSize: 19, color: '#bfdbfe' }, disabled: { opacity: 0.45 },
  resultSection: { marginTop: 22, padding: 22, borderRadius: 20, backgroundColor: '#fff', ...shadow }, resultHeading: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 10 }, resultTitle: { marginTop: 4, fontSize: 23, fontWeight: '800', color: '#0f172a' }, statusBadge: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999 }, statusText: { fontSize: 12, fontWeight: '800' }, statusDetail: { marginTop: 8, fontSize: 12, lineHeight: 18, color: '#64748b' },
  metrics: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 18 }, metric: { minWidth: 170, flex: 1, padding: 15, overflow: 'hidden', borderRadius: 12, borderWidth: 1, borderColor: '#e2e8f0', backgroundColor: '#f8fafc' }, metricAccent: { position: 'absolute', top: 0, bottom: 0, left: 0, width: 4 }, metricLabel: { marginLeft: 3, fontSize: 11, color: '#64748b' }, metricValue: { marginTop: 6, marginLeft: 3, fontSize: 19, fontWeight: '800', color: '#0f172a' }, batchSummary: { marginTop: 14, padding: 13, borderRadius: 11, borderWidth: 1, borderColor: '#99f6e4', backgroundColor: '#f0fdfa' }, batchSummaryHeader: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8 }, batchSummaryTitle: { fontSize: 12, fontWeight: '800', color: '#115e59' }, batchSummaryMeta: { fontSize: 10, color: '#0f766e' }, batchSummaryLine: { marginTop: 5, fontSize: 10, lineHeight: 15, color: '#475569' }, useList: { marginTop: 14, gap: 5 }, useLine: { fontSize: 11, lineHeight: 17, color: '#475569' }, batchConfirmButton: { minHeight: 38, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 11, borderRadius: 8, backgroundColor: '#0f766e' }, batchConfirmButtonText: { fontSize: 10, fontWeight: '800', color: '#fff' }, batchWarning: { marginTop: 10, padding: 9, borderRadius: 8, fontSize: 10, lineHeight: 15, color: '#92400e', backgroundColor: '#fffbeb' },
  candidateCard: { marginTop: 14, padding: 14, borderRadius: 12, borderWidth: 1, borderColor: '#fde68a', backgroundColor: '#fffbeb' }, candidateHeader: { marginBottom: 8 }, candidateTitle: { fontSize: 12, fontWeight: '800', color: '#92400e' }, candidateHint: { marginTop: 3, fontSize: 10, lineHeight: 15, color: '#a16207' }, candidateRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 7, marginTop: 6, padding: 9, borderRadius: 8, backgroundColor: '#fff' }, candidateRowBest: { borderWidth: 1, borderColor: '#f59e0b', backgroundColor: '#fef3c7' }, candidateName: { minWidth: 70, fontSize: 11, fontWeight: '800', color: '#78350f' }, candidateValue: { flex: 1, minWidth: 150, fontSize: 10, color: '#57534e' }, candidateSaving: { fontSize: 10, fontWeight: '700', color: '#b45309' }, candidateSavingBest: { color: '#92400e' },
  mergedSourceNotice: { marginTop: 14, padding: 13, borderRadius: 11, borderWidth: 1, borderColor: '#99f6e4', backgroundColor: '#f0fdfa' }, mergedSourceNoticeTitle: { fontSize: 12, fontWeight: '800', color: '#115e59' }, mergedSourceNoticeText: { marginTop: 4, fontSize: 11, lineHeight: 17, color: '#0f766e' }, confirmBar: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 17, padding: 14, borderRadius: 12, borderWidth: 1 }, tentativeBar: { borderColor: '#fbbf24', backgroundColor: '#fffbeb' }, confirmedBar: { borderColor: '#6ee7b7', backgroundColor: '#ecfdf5' }, completeBar: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 12, padding: 14, borderRadius: 12, borderWidth: 1 }, completeBarPending: { borderColor: '#cbd5e1', backgroundColor: '#f8fafc' }, completeBarDone: { borderColor: '#86efac', backgroundColor: '#f0fdf4' }, confirmCopy: { flex: 1, minWidth: 210 }, confirmTitle: { fontSize: 14, fontWeight: '800', color: '#1e293b' }, confirmMeta: { marginTop: 3, fontSize: 11, lineHeight: 17, color: '#64748b' }, confirmButton: { minHeight: 46, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18, borderRadius: 10, backgroundColor: '#0f172a' }, confirmButtonText: { fontSize: 13, fontWeight: '800', color: '#fff' }, completeButton: { minHeight: 46, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18, borderRadius: 10, backgroundColor: '#047857' }, completeButtonText: { fontSize: 13, fontWeight: '800', color: '#fff' }, exportRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 9, marginTop: 12 }, secondaryButton: { minHeight: 46, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16, borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 10, backgroundColor: '#fff' }, secondaryButtonText: { fontSize: 12, fontWeight: '800', color: '#334155' }, libraryGrid: { gap: 20, marginTop: 22 }, libraryGridWide: { flexDirection: 'row', alignItems: 'flex-start' },
});
