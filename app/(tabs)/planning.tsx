import { useCallback, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Print from 'expo-print';
import { router, useFocusEffect } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { FileDown, RefreshCw, Scissors } from 'lucide-react-native';
import { Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { createLayoutSvgMarkup } from '../../src/features/cutting/createLayoutSvgMarkup';
import { FilmLayoutPreview } from '../../src/features/cutting/FilmLayoutPreview';
import { MergedRollPlacementList, MergedRollPreview } from '../../src/features/cutting/MergedRollPreview';
import { groupPlacementsBySubgroup, areAllPlacementListsCollapsed, findLatestMergedJob, findLatestPieceJob, majorGroupTabLabel, nextPlacementCompletion, resolveActiveMergedPlanKey, resolvePlacementCompletionIds, toggleAllPlacementLists } from '../../src/features/cutting/planningPlacementModel';
import { calculateCurrentGroupPlan, CURRENT_GROUP_ESTIMATE_STORAGE_KEY, parseCurrentEstimateSnapshot, type CurrentEstimatePlan } from '../../src/features/estimate/currentGroupEstimate';
import { createPlanningPreviewHtml, type PlanningPreviewSection } from '../../src/features/export/createPlanningPreviewHtml';
import { printHtmlOnWeb } from '../../src/features/export/printHtmlOnWeb';
import { createAppLibraryRepository } from '../../src/features/library/libraryRepositoryFactory';
import type { LibraryDocument, SavedCuttingJob, SavedMergedCuttingJob } from '../../src/features/library/models';
import type { GroupedPiecePlan } from '../../src/features/remnants/planGroupedPieces';

const repository = createAppLibraryRepository();
const emptyLibrary: LibraryDocument = { version: 1, presets: [], jobs: [], remnants: [], mergedJobs: [] };
const emptyPlan: CurrentEstimatePlan = { groupedPlans: [], mergedPlans: [], pieceNamesBySourceId: {}, subgroupNamesBySourceId: {} };
type PlanningView = 'drawing' | 'list';

export default function PlanningScreen() {
  const [currentPlan, setCurrentPlan] = useState<CurrentEstimatePlan>(emptyPlan);
  const [library, setLibrary] = useState<LibraryDocument>(emptyLibrary);
  const [loading, setLoading] = useState(true);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pieceCompletionOverrides, setPieceCompletionOverrides] = useState<Record<string, number[]>>({});
  const [mergedCompletionOverrides, setMergedCompletionOverrides] = useState<Record<string, number[]>>({});
  const [collapsedPlacementLists, setCollapsedPlacementLists] = useState<Record<string, boolean>>({});
  const [selectedMergedPlanKey, setSelectedMergedPlanKey] = useState<string | null>(null);
  const [planningView, setPlanningView] = useState<PlanningView>('drawing');

  const refresh = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [raw, loaded] = await Promise.all([AsyncStorage.getItem(CURRENT_GROUP_ESTIMATE_STORAGE_KEY), repository.load()]);
      const snapshot = parseCurrentEstimateSnapshot(raw);
      setLibrary(loaded.document);
      setCurrentPlan(snapshot ? calculateCurrentGroupPlan(snapshot) : emptyPlan);
    } catch (caught) {
      setCurrentPlan(emptyPlan);
      setError(caught instanceof Error ? caught.message : '배치 계획을 불러오지 못했습니다.');
    } finally { setLoading(false); }
  }, []);

  const toggleMergedPlacementComplete = useCallback(async (planKey: string, mergeGroupId: string, jobId: string | undefined, placementId: number, placementIds: readonly number[]) => {
    setLoading(true); setError(null);
    try {
      const loaded = await repository.load();
      const current = jobId ? loaded.document.mergedJobs.find((job) => job.id === jobId) : undefined;
      const completedIds = resolvePlacementCompletionIds(current?.completedPlacementIds, mergedCompletionOverrides[planKey]);
      const next = nextPlacementCompletion(completedIds, placementId, placementIds);
      const now = new Date().toISOString();
      if (current) {
        const updated: SavedMergedCuttingJob = {
          ...current,
          isCuttingComplete: next.complete,
          cuttingCompletedAt: next.complete ? now : undefined,
          updatedAt: now,
          completedPlacementIds: next.completedIds,
        };
        await repository.saveMergedJob(updated);
      } else {
        setMergedCompletionOverrides((existing) => ({ ...existing, [planKey]: next.completedIds }));
      }
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '재단 완료 상태를 저장하지 못했습니다.');
      setLoading(false);
    }
  }, [mergedCompletionOverrides, refresh]);

  const togglePiecePlacementComplete = useCallback(async (sourceKey: string, jobId: string | undefined, placementId: number, placementIds: readonly number[]) => {
    setLoading(true); setError(null);
    try {
      const loaded = await repository.load();
      const current = jobId ? loaded.document.jobs.find((job) => job.id === jobId) : undefined;
      const completedIds = resolvePlacementCompletionIds(current?.completedPlacementIds, pieceCompletionOverrides[sourceKey]);
      const next = nextPlacementCompletion(completedIds, placementId, placementIds);
      const now = new Date().toISOString();
      if (current) {
        const updated: SavedCuttingJob = {
          ...current,
          isCuttingComplete: next.complete,
          cuttingCompletedAt: next.complete ? now : undefined,
          updatedAt: now,
          completedPlacementIds: next.completedIds,
        };
        await repository.saveJob(updated);
      } else {
        setPieceCompletionOverrides((existing) => ({ ...existing, [sourceKey]: next.completedIds }));
      }
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '재단 완료 상태를 저장하지 못했습니다.');
      setLoading(false);
    }
  }, [pieceCompletionOverrides, refresh]);

  useFocusEffect(useCallback(() => { void refresh(); }, [refresh]));

  const mergedSourceIds = useMemo(() => new Set(currentPlan.mergedPlans.flatMap((plan) => plan.sourceIds)), [currentPlan.mergedPlans]);
  const independentPlans = useMemo(() => currentPlan.groupedPlans.filter((entry) => !mergedSourceIds.has(`${entry.groupId}-${entry.pieceId}`)), [currentPlan.groupedPlans, mergedSourceIds]);
  const pieceCount = currentPlan.groupedPlans.length;
  const newRollLength = independentPlans.reduce((sum, entry) => sum + (entry.plan.newRollResult?.usedLengthMm ?? 0), 0)
    + currentPlan.mergedPlans.reduce((sum, plan) => sum + plan.result.usedLengthMm, 0);
  const producedQuantity = independentPlans.reduce((sum, entry) => sum + producedForPiecePlan(entry), 0)
    + currentPlan.mergedPlans.reduce((sum, plan) => sum + plan.producedQuantity, 0);
  const newRollCount = independentPlans.reduce((sum, entry) => sum + (entry.plan.newRollResults?.length ?? (entry.plan.newRollResult ? 1 : 0)), 0)
    + currentPlan.mergedPlans.reduce((sum, plan) => sum + (plan.rollResults?.length ?? (plan.result.placements.length ? 1 : 0)), 0);
  const hasPlan = pieceCount > 0;
  const mergedPlanTabs = useMemo(() => currentPlan.mergedPlans.map((plan, index) => ({
    key: mergedPlanKey(plan.mergeGroupId, plan.sourceIds),
    label: majorGroupTabLabel(plan.groupNames, index),
    plan,
  })), [currentPlan.mergedPlans]);
  const activeMergedPlanKey = resolveActiveMergedPlanKey(mergedPlanTabs.map((tab) => tab.key), selectedMergedPlanKey);
  const activeMergedTab = mergedPlanTabs.find((tab) => tab.key === activeMergedPlanKey);
  const activeMergedPlan = activeMergedTab?.plan;
  useEffect(() => {
    if (selectedMergedPlanKey !== activeMergedPlanKey) setSelectedMergedPlanKey(activeMergedPlanKey);
  }, [activeMergedPlanKey, selectedMergedPlanKey]);
  const placementListKeys = useMemo(() => [
    ...currentPlan.mergedPlans.flatMap((plan) => groupPlacementsBySubgroup(plan.result.placements, currentPlan.subgroupNamesBySourceId).map((group) => JSON.stringify([mergedPlanKey(plan.mergeGroupId, plan.sourceIds), group.id]))),
    ...independentPlans.map((entry) => `piece:${entry.groupId}-${entry.pieceId}`),
  ], [currentPlan.mergedPlans, currentPlan.subgroupNamesBySourceId, independentPlans]);
  const allPlacementListsCollapsed = areAllPlacementListsCollapsed(placementListKeys, collapsedPlacementLists);

  const exportPreviewPdf = useCallback(async () => {
    setExportingPdf(true); setError(null); setNotice(null);
    try {
      const sections: PlanningPreviewSection[] = [];
      if (activeMergedPlan) {
        (activeMergedPlan.rollResults?.length ? activeMergedPlan.rollResults : [activeMergedPlan.result]).forEach((roll, index) => sections.push({
          title: `${activeMergedTab?.label ?? '대그룹'} 병합 ${index + 1}롤`,
          detail: `원단 폭 1,220mm · 길이 ${Math.round(roll.usedLengthMm).toLocaleString()}mm · ${roll.placements.length}개 조각`,
          layoutSvg: createLayoutSvgMarkup({ result: roll, rollWidthMm: 1_220, displayLengthMm: roll.usedLengthMm, showDimensions: true, gridIntervalMm: 100, ariaLabel: `${activeMergedTab?.label ?? '대그룹'} 병합 ${index + 1}롤 배치 도면` }),
        }));
      }
      independentPlans.forEach((entry) => {
        const result = entry.plan.newRollResult;
        if (!result) return;
        const sourceKey = `${entry.groupId}-${entry.pieceId}`;
        const displayName = currentPlan.pieceNamesBySourceId[sourceKey] ?? entry.pieceName;
        (entry.plan.newRollResults?.length ? entry.plan.newRollResults : [result]).forEach((roll, index) => sections.push({
          title: `${entry.groupName} · ${displayName} · ${index + 1}롤`,
          detail: `원단 폭 ${entry.request.rollWidthMm.toLocaleString()}mm · 길이 ${Math.round(roll.usedLengthMm).toLocaleString()}mm · ${roll.placements.length}개 조각`,
          layoutSvg: createLayoutSvgMarkup({ result: roll, rollWidthMm: entry.request.rollWidthMm, displayLengthMm: roll.usedLengthMm, sideMarginMm: entry.request.sideMarginMm, startEndMarginMm: entry.request.startEndMarginMm, showDimensions: true, gridIntervalMm: 100, ariaLabel: `${displayName} ${index + 1}롤 배치 도면` }),
        }));
      });
      if (sections.length === 0) throw new Error('PDF로 내보낼 새 롤 배치 도면이 없습니다.');
      const html = createPlanningPreviewHtml({ title: '필름 배치 미리보기', generatedAt: new Date().toLocaleString('ko-KR'), pieceCount, producedQuantity, newRollLengthMm: newRollLength, sections });
      if (Platform.OS === 'web') {
        await printHtmlOnWeb(html);
      } else {
        const file = await Print.printToFileAsync({ html });
        if (!await Sharing.isAvailableAsync()) throw new Error('이 기기에서는 PDF 파일 공유를 사용할 수 없습니다.');
        await Sharing.shareAsync(file.uri, { mimeType: 'application/pdf', dialogTitle: '배치 미리보기 PDF 공유' });
      }
      setNotice('배치 미리보기 PDF를 준비했습니다.');
    } catch (caught) {
      setError(caught instanceof Error ? `PDF를 내보내지 못했습니다. ${caught.message}` : 'PDF를 내보내지 못했습니다.');
    } finally { setExportingPdf(false); }
  }, [activeMergedPlan, activeMergedTab?.label, currentPlan.pieceNamesBySourceId, independentPlans, newRollLength, pieceCount, producedQuantity]);

  return <ScrollView style={styles.page} contentContainerStyle={styles.content}>
    <View style={styles.header}>
      <View style={styles.headerCopy}><Text style={styles.eyebrow}>BATCH PLANNING</Text><Text style={styles.title}>배치 계획</Text><Text style={styles.subtitle}>재단계산에서 입력·계산한 조각을 기준으로 배치 미리보기와 원단 사용 계획을 확인합니다.</Text></View>
      <View style={styles.headerActions}><TouchableOpacity accessibilityRole="button" accessibilityLabel="배치 계획 새로고침" onPress={() => void refresh()} disabled={loading} style={[styles.refreshButton, loading && styles.disabled]}><RefreshCw color="#2563eb" size={15} /><Text style={styles.refreshText}>새로고침</Text></TouchableOpacity><TouchableOpacity accessibilityRole="button" accessibilityLabel="재단 계산으로 이동" onPress={() => router.push('/input')} style={styles.inputButton}><Scissors color="#fff" size={15} /><Text style={styles.inputButtonText}>재단 계산</Text></TouchableOpacity></View>
    </View>
    {error && <View style={styles.error}><Text style={styles.errorText}>{error}</Text></View>}
    {notice && <View style={styles.notice}><Text style={styles.noticeText}>{notice}</Text></View>}
    {!hasPlan ? <View style={styles.empty}><Text style={styles.emptyIcon}>▦</Text><Text style={styles.emptyTitle}>{loading ? '배치 계획을 불러오는 중…' : '계산된 배치가 없습니다.'}</Text><Text style={styles.emptyBody}>재단계산 탭에서 조각별 폭·길이·수량을 입력하고 현재 조각 배치를 실행해 주세요.</Text><TouchableOpacity accessibilityRole="button" onPress={() => router.push('/input')} style={styles.emptyButton}><Text style={styles.emptyButtonText}>재단 계산으로 이동</Text></TouchableOpacity></View> : <>
      <View style={styles.summaryCard}><View style={styles.summaryHeader}><View><Text style={styles.sectionEyebrow}>CUTTING RESULT</Text><Text style={styles.sectionTitle}>재단 결과 · 원단 사용 계획</Text></View><Text style={styles.summaryStatus}>재단계산 결과</Text></View><View style={styles.metrics}><Metric label="계산 조각" value={`${pieceCount}개`} /><Metric label="생산 수량" value={`${producedQuantity}개`} /><Metric label="새 롤 수" value={`${newRollCount}롤`} /><Metric label="새 롤 사용 길이" value={`${Math.round(newRollLength).toLocaleString()}mm`} /></View><Text style={styles.summaryHint}>새 롤은 1롤당 최대 25m로 분할됩니다. 재단계산에서 저장된 결과를 기준으로 배치 도면과 배치목록을 확인합니다.</Text></View>
      <View style={styles.section}><View style={styles.sectionHeader}><View><Text style={styles.sectionEyebrow}>LAYOUT PREVIEW</Text><Text style={styles.sectionTitle}>배치 미리보기</Text></View><View style={styles.sectionHeaderActions}>{planningView === 'drawing' ? <TouchableOpacity accessibilityRole="button" accessibilityLabel="배치 미리보기 PDF 내보내기" disabled={exportingPdf} onPress={() => void exportPreviewPdf()} style={[styles.pdfButton, exportingPdf && styles.disabled]}><FileDown color="#fff" size={14} /><Text style={styles.pdfButtonText}>{exportingPdf ? '준비 중' : 'PDF 내보내기'}</Text></TouchableOpacity> : <TouchableOpacity accessibilityRole="button" accessibilityLabel={placementListKeys.length === 0 ? '배치목록 없음' : allPlacementListsCollapsed ? '배치목록 모두 펼치기' : '배치목록 모두 접기'} disabled={placementListKeys.length === 0} onPress={() => setCollapsedPlacementLists((current) => toggleAllPlacementLists(placementListKeys, current))} style={[styles.placementListsToggle, placementListKeys.length === 0 && styles.disabled]}><Text style={styles.placementListsToggleText}>{allPlacementListsCollapsed ? '모두 펼치기' : '모두 접기'}</Text></TouchableOpacity>}</View></View>
        <View style={styles.viewTabs} accessibilityRole="tablist">
          <TouchableOpacity accessibilityRole="tab" accessibilityLabel="병합롤 도면 탭" accessibilityState={{ selected: planningView === 'drawing' }} onPress={() => setPlanningView('drawing')} style={[styles.viewTab, planningView === 'drawing' && styles.viewTabActive]}><Text style={[styles.viewTabText, planningView === 'drawing' && styles.viewTabTextActive]}>병합롤 도면</Text></TouchableOpacity>
          <TouchableOpacity accessibilityRole="tab" accessibilityLabel="배치목록 탭" accessibilityState={{ selected: planningView === 'list' }} onPress={() => setPlanningView('list')} style={[styles.viewTab, planningView === 'list' && styles.viewTabActive]}><Text style={[styles.viewTabText, planningView === 'list' && styles.viewTabTextActive]}>배치목록</Text></TouchableOpacity>
        </View>
        <Text style={styles.viewHint}>{planningView === 'drawing' ? '도면은 별도 스크롤 없이 아래로 이어집니다.' : '소그룹별 조각을 확인하고 재단 완료를 체크합니다.'}</Text>
        {mergedPlanTabs.length > 0 && <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.mergedRollTabs} accessibilityLabel="대그룹 병합 롤 선택">
          {mergedPlanTabs.map((tab) => {
            const active = tab.key === activeMergedPlanKey;
            return <TouchableOpacity key={tab.key} accessibilityRole="tab" accessibilityLabel={`${tab.label} 병합 롤 보기`} accessibilityState={{ selected: active }} onPress={() => setSelectedMergedPlanKey(tab.key)} style={[styles.mergedRollTab, active && styles.mergedRollTabActive]}>
              <Text style={[styles.mergedRollTabLabel, active && styles.mergedRollTabLabelActive]}>{tab.label}</Text>
              <Text style={[styles.mergedRollTabMeta, active && styles.mergedRollTabMetaActive]}>{tab.plan.producedQuantity}개 · {Math.round(tab.plan.result.usedLengthMm).toLocaleString()}mm</Text>
            </TouchableOpacity>;
          })}
        </ScrollView>}
        {activeMergedPlan && (() => {
          const plan = activeMergedPlan;
          const job = findLatestMergedJob(plan, library.mergedJobs);
          const placementIds = plan.result.placements.map((placement) => placement.id);
          const planKey = mergedPlanKey(plan.mergeGroupId, plan.sourceIds);
          const completedPlacementIds = resolvePlacementCompletionIds(job?.completedPlacementIds, mergedCompletionOverrides[planKey]);
          const subgroupIds = groupPlacementsBySubgroup(plan.result.placements, currentPlan.subgroupNamesBySourceId).map((group) => group.id);
          const subgroupKey = (id: string) => JSON.stringify([planKey, id]);
          const listState = Object.fromEntries(subgroupIds.map((id) => [id, collapsedPlacementLists[subgroupKey(id)] === true]));
          const changeListState = (next: Record<string, boolean>) => setCollapsedPlacementLists((current) => ({ ...current, ...Object.fromEntries(Object.entries(next).map(([id, collapsed]) => [subgroupKey(id), collapsed])) }));
          const togglePlacement = (placementId: number) => void toggleMergedPlacementComplete(planKey, plan.mergeGroupId, job?.id, placementId, placementIds);
          return planningView === 'drawing'
            ? <MergedRollPreview key={`merged-${planKey}`} plan={plan} job={job} busy={loading} completedPlacementIds={completedPlacementIds} sourceLabels={currentPlan.pieceNamesBySourceId} sourceSubgroups={currentPlan.subgroupNamesBySourceId} onTogglePlacementComplete={togglePlacement} hidePlacementList hideLegend continuousPageView />
            : <MergedRollPlacementList key={`merged-list-${planKey}`} plan={plan} job={job} busy={loading} completedPlacementIds={completedPlacementIds} sourceLabels={currentPlan.pieceNamesBySourceId} sourceSubgroups={currentPlan.subgroupNamesBySourceId} onTogglePlacementComplete={togglePlacement} collapsedSubgroups={listState} onChangeCollapsedSubgroups={changeListState} />;
        })()}
        {independentPlans.map((entry) => {
          const sourceKey = `${entry.groupId}-${entry.pieceId}`;
          const displayName = currentPlan.pieceNamesBySourceId[sourceKey] ?? entry.pieceName;
          const job = findLatestPieceJob(entry.groupName, entry.pieceId, library.jobs, displayName);
          const placementListKey = `piece:${sourceKey}`;
          return <PiecePlanCard key={sourceKey} entry={entry} displayName={displayName} view={planningView} busy={loading} completedPlacementIds={resolvePlacementCompletionIds(job?.completedPlacementIds, pieceCompletionOverrides[sourceKey])} onTogglePlacementComplete={(placementId, placementIds) => void togglePiecePlacementComplete(sourceKey, job?.id, placementId, placementIds)} placementListCollapsed={collapsedPlacementLists[placementListKey] === true} onTogglePlacementList={() => setCollapsedPlacementLists((current) => ({ ...current, [placementListKey]: !(current[placementListKey] === true) }))} />;
        })}
      </View>
    </>}
  </ScrollView>;
}

function mergedPlanKey(mergeGroupId: string, sourceIds: readonly string[]): string {
  return `${mergeGroupId}::${sourceIds.join('|')}`;
}

function PiecePlanCard({ entry, displayName, view, busy = false, completedPlacementIds, onTogglePlacementComplete, placementListCollapsed, onTogglePlacementList }: { entry: GroupedPiecePlan; displayName?: string; view: PlanningView; busy?: boolean; completedPlacementIds?: readonly number[]; onTogglePlacementComplete(placementId: number, placementIds: readonly number[]): void; placementListCollapsed?: boolean; onTogglePlacementList?(): void }) {
  const result = entry.plan.newRollResult;
  const [selectedRollIndex, setSelectedRollIndex] = useState(0);
  const rolls = entry.plan.newRollResults?.length ? entry.plan.newRollResults : result ? [result] : [];
  const selectedRoll = rolls[Math.min(selectedRollIndex, rolls.length - 1)];
  const allowanceMeta = entry.request.cutAllowanceMm === undefined ? '' : ` · 입력 ${entry.request.sourcePieceWidthMm}×${entry.request.sourcePieceLengthMm} + 여유 ${entry.request.cutAllowanceMm}mm`;
  return <View style={styles.pieceCard}>
    <View style={styles.pieceHeader}><View><Text style={styles.pieceTitle}>{entry.groupName} · {displayName ?? entry.pieceName}</Text><Text style={styles.pieceMeta}>계산 {entry.request.pieceWidthMm}×{entry.request.pieceLengthMm}mm{allowanceMeta} · 필요 {entry.request.quantity}개</Text></View><Text style={styles.pieceStatus}>{producedForPiecePlan(entry)}개 생산</Text></View>
    {view === 'drawing' && rolls.length > 1 && <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rollTabs}>{rolls.map((roll, index) => <TouchableOpacity key={index} accessibilityRole="tab" accessibilityLabel={`${displayName ?? entry.pieceName} ${index + 1}롤 보기`} accessibilityState={{ selected: selectedRollIndex === index }} onPress={() => setSelectedRollIndex(index)} style={[styles.rollTab, selectedRollIndex === index && styles.rollTabActive]}><Text style={[styles.rollTabText, selectedRollIndex === index && styles.rollTabTextActive]}>{index + 1}롤 · {Math.round(roll.usedLengthMm).toLocaleString()}mm</Text></TouchableOpacity>)}</ScrollView>}
    {result ? view === 'drawing' ? <FilmLayoutPreview key={selectedRollIndex} result={selectedRoll ?? result} rollWidthMm={entry.request.rollWidthMm} sideMarginMm={entry.request.sideMarginMm} startEndMarginMm={entry.request.startEndMarginMm} completedPlacementIds={completedPlacementIds} pieceLabel={displayName ?? entry.pieceName} completionBusy={busy} onTogglePlacementComplete={(placementId) => onTogglePlacementComplete(placementId, result.placements.map((placement) => placement.id))} continuousPageView /> : <IndependentPlacementList result={result} rolls={rolls} completedPlacementIds={completedPlacementIds} pieceLabel={displayName ?? entry.pieceName} onTogglePlacementComplete={onTogglePlacementComplete} placementListCollapsed={placementListCollapsed} onTogglePlacementList={onTogglePlacementList} /> : <View style={styles.remnantOnly}><Text style={styles.remnantOnlyTitle}>자투리에서 전량 생산</Text><Text style={styles.remnantOnlyText}>새 원본 롤 사용 없이 저장된 자투리로 배치되었습니다.</Text></View>}
    {entry.plan.remnantUses.length > 0 && <Text style={styles.remnantLine}>자투리 {entry.plan.remnantUses.length}개 사용 · 새 롤 {Math.round(entry.plan.newRollResult?.usedLengthMm ?? 0).toLocaleString()}mm</Text>}
  </View>;
}

function IndependentPlacementList({ result, rolls, completedPlacementIds = [], pieceLabel, onTogglePlacementComplete, placementListCollapsed, onTogglePlacementList }: { result: NonNullable<GroupedPiecePlan['plan']['newRollResult']>; rolls: NonNullable<GroupedPiecePlan['plan']['newRollResult']>[]; completedPlacementIds?: readonly number[]; pieceLabel: string; onTogglePlacementComplete(placementId: number, placementIds: readonly number[]): void; placementListCollapsed?: boolean; onTogglePlacementList?(): void }) {
  const [localCollapsed, setLocalCollapsed] = useState(false);
  const collapsed = placementListCollapsed ?? localCollapsed;
  const toggleCollapsed = onTogglePlacementList ?? (() => setLocalCollapsed((value) => !value));
  const completed = new Set(completedPlacementIds);
  const rollNumberByPlacementId = new Map(rolls.flatMap((roll, index) => roll.placements.map((placement) => [placement.id, index + 1] as const)));
  const localYByPlacementId = new Map(rolls.flatMap((roll) => roll.placements.map((placement) => [placement.id, placement.y] as const)));
  return <View style={styles.placementList} accessibilityLabel="배치 목록">
    <TouchableOpacity accessibilityRole="button" accessibilityLabel={`배치 목록 ${collapsed ? '펼치기' : '접기'}`} onPress={toggleCollapsed} style={styles.placementListHeader}>
      <View><Text style={styles.placementListTitle}>배치 목록</Text><Text style={styles.placementListMeta}>{result.placements.length}개 조각 · 완료 {result.placements.filter((item) => completed.has(item.id)).length}개</Text></View><Text style={styles.placementListToggle}>{collapsed ? '▶' : '▼'}</Text>
    </TouchableOpacity>
    {!collapsed && result.placements.map((item) => <View key={item.id} style={[styles.placementRow, completed.has(item.id) && styles.placementRowDone]}><View style={styles.placementIndex}><Text style={styles.placementIndexText}>{item.id}</Text></View><View style={styles.placementCopy}><Text style={styles.placementName}>{pieceLabel}{item.rotated ? ' ↻' : ''}</Text><Text style={styles.placementMeta}>{rollNumberByPlacementId.get(item.id) ?? 1}롤 · {item.width}×{item.height}mm · X {Math.round(item.x)} · Y {Math.round(localYByPlacementId.get(item.id) ?? item.y)}mm</Text></View><TouchableOpacity accessibilityRole="checkbox" accessibilityLabel={`${pieceLabel} ${item.id}번 재단 완료`} accessibilityState={{ checked: completed.has(item.id) }} onPress={() => onTogglePlacementComplete(item.id, result.placements.map((placement) => placement.id))} style={[styles.placementCheckButton, completed.has(item.id) && styles.placementCheckButtonDone]}><Text style={[styles.placementCheckText, completed.has(item.id) && styles.placementCheckTextDone]}>{completed.has(item.id) ? '✓' : '○'}</Text></TouchableOpacity></View>)}
  </View>;
}

function producedForPiecePlan(entry: GroupedPiecePlan): number {
  return entry.plan.remnantUses.reduce((sum, use) => sum + use.producedQuantity, 0) + (entry.plan.newRollResult?.producedQuantity ?? 0);
}

function Metric({ label, value }: { label: string; value: string }) {
  return <View style={styles.metric}><Text style={styles.metricLabel}>{label}</Text><Text style={styles.metricValue}>{value}</Text></View>;
}

const styles = StyleSheet.create({
  viewTabs: { flexDirection: 'row', gap: 6, marginTop: 16, padding: 4, borderRadius: 10, backgroundColor: '#eff6ff' }, viewTab: { flex: 1, minHeight: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 8 }, viewTabActive: { backgroundColor: '#2563eb' }, viewTabText: { fontSize: 12, fontWeight: '800', color: '#1d4ed8' }, viewTabTextActive: { color: '#fff' }, viewHint: { marginTop: 9, fontSize: 11, color: '#64748b' },
  sectionHeaderActions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 }, pdfButton: { minHeight: 32, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingHorizontal: 10, borderRadius: 7, backgroundColor: '#2563eb' }, pdfButtonText: { fontSize: 10, fontWeight: '800', color: '#fff' }, placementListsToggle: { minHeight: 32, justifyContent: 'center', paddingHorizontal: 10, borderRadius: 7, backgroundColor: '#dbeafe' }, placementListsToggleText: { fontSize: 10, fontWeight: '800', color: '#1d4ed8' },
  mergedRollTabs: { gap: 7, paddingTop: 14, paddingBottom: 2 }, mergedRollTab: { minWidth: 104, minHeight: 48, justifyContent: 'center', paddingHorizontal: 12, borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 9, backgroundColor: '#f8fafc' }, mergedRollTabActive: { borderColor: '#2563eb', backgroundColor: '#eff6ff' }, mergedRollTabLabel: { fontSize: 11, fontWeight: '900', color: '#475569' }, mergedRollTabLabelActive: { color: '#1d4ed8' }, mergedRollTabMeta: { marginTop: 3, fontSize: 9, color: '#94a3b8' }, mergedRollTabMetaActive: { color: '#3b82f6' },
  page: { flex: 1, backgroundColor: '#f1f5f9' }, content: { width: '100%', maxWidth: 1180, alignSelf: 'center', padding: 24, paddingBottom: 88 },
  header: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16 }, headerCopy: { flex: 1, minWidth: 240 }, eyebrow: { fontSize: 11, letterSpacing: 1.8, fontWeight: '800', color: '#2563eb' }, title: { marginTop: 7, fontSize: 30, fontWeight: '800', color: '#0f172a' }, subtitle: { marginTop: 7, maxWidth: 700, fontSize: 14, lineHeight: 21, color: '#64748b' }, headerActions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 }, refreshButton: { minHeight: 40, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 12, borderWidth: 1, borderColor: '#bfdbfe', borderRadius: 9, backgroundColor: '#fff' }, refreshText: { fontSize: 11, fontWeight: '800', color: '#2563eb' }, inputButton: { minHeight: 40, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 12, borderRadius: 9, backgroundColor: '#2563eb' }, inputButtonText: { fontSize: 11, fontWeight: '800', color: '#fff' }, disabled: { opacity: 0.5 }, error: { marginTop: 18, padding: 12, borderRadius: 9, borderWidth: 1, borderColor: '#fecaca', backgroundColor: '#fff1f2' }, errorText: { fontSize: 12, color: '#991b1b' }, notice: { marginTop: 18, padding: 12, borderRadius: 9, borderWidth: 1, borderColor: '#bbf7d0', backgroundColor: '#f0fdf4' }, noticeText: { fontSize: 12, color: '#166534' }, empty: { marginTop: 22, minHeight: 320, alignItems: 'center', justifyContent: 'center', padding: 24, borderRadius: 18, backgroundColor: '#fff' }, emptyIcon: { fontSize: 40, color: '#93c5fd' }, emptyTitle: { marginTop: 10, fontSize: 18, fontWeight: '800', color: '#1e293b' }, emptyBody: { maxWidth: 480, marginTop: 7, fontSize: 12, lineHeight: 18, textAlign: 'center', color: '#64748b' }, emptyButton: { minHeight: 40, marginTop: 16, justifyContent: 'center', paddingHorizontal: 14, borderRadius: 8, backgroundColor: '#2563eb' }, emptyButtonText: { fontSize: 11, fontWeight: '800', color: '#fff' },
  summaryCard: { marginTop: 22, padding: 18, borderRadius: 16, borderWidth: 1, borderColor: '#bfdbfe', backgroundColor: '#fff' }, summaryHeader: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 10 }, sectionEyebrow: { fontSize: 10, letterSpacing: 1.4, fontWeight: '800', color: '#2563eb' }, sectionTitle: { marginTop: 4, fontSize: 21, fontWeight: '800', color: '#0f172a' }, summaryStatus: { paddingHorizontal: 9, paddingVertical: 5, borderRadius: 999, fontSize: 10, fontWeight: '800', color: '#1d4ed8', backgroundColor: '#eff6ff' }, metrics: { flexDirection: 'row', flexWrap: 'wrap', gap: 9, marginTop: 15 }, metric: { flex: 1, minWidth: 150, padding: 12, borderRadius: 10, borderWidth: 1, borderColor: '#e2e8f0', backgroundColor: '#f8fafc' }, metricLabel: { fontSize: 10, color: '#64748b' }, metricValue: { marginTop: 5, fontSize: 18, fontWeight: '800', color: '#0f172a' }, summaryHint: { marginTop: 12, fontSize: 11, lineHeight: 17, color: '#64748b' },
  section: { marginTop: 20, padding: 18, borderRadius: 16, backgroundColor: '#fff' }, sectionHeader: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-end', justifyContent: 'space-between', gap: 10 }, sectionHint: { fontSize: 11, color: '#64748b' }, pieceCard: { marginTop: 14, padding: 13, borderRadius: 12, borderWidth: 1, borderColor: '#dbeafe', backgroundColor: '#f8fbff' }, pieceHeader: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8 }, pieceTitle: { fontSize: 13, fontWeight: '800', color: '#1e3a8a' }, pieceMeta: { marginTop: 3, fontSize: 10, color: '#64748b' }, pieceStatus: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999, fontSize: 10, fontWeight: '800', color: '#0f766e', backgroundColor: '#ccfbf1' }, remnantOnly: { marginTop: 11, padding: 16, alignItems: 'center', borderRadius: 10, backgroundColor: '#ecfdf5' }, remnantOnlyTitle: { fontSize: 12, fontWeight: '800', color: '#047857' }, remnantOnlyText: { marginTop: 4, fontSize: 10, color: '#0f766e' }, remnantLine: { marginTop: 8, fontSize: 10, color: '#0f766e' }, placementList: { marginTop: 12, paddingTop: 11, borderTopWidth: 1, borderTopColor: '#dbeafe' }, placementListHeader: { minHeight: 42, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 9, borderRadius: 7, backgroundColor: '#eff6ff' }, placementListTitle: { fontSize: 11, fontWeight: '900', color: '#1d4ed8' }, placementListMeta: { marginTop: 2, fontSize: 9, color: '#64748b' }, placementListToggle: { fontSize: 12, fontWeight: '900', color: '#1d4ed8' }, placementRow: { minHeight: 38, flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 5, paddingHorizontal: 8, borderRadius: 7, backgroundColor: '#fff' }, placementRowDone: { backgroundColor: '#f0fdf4' }, placementIndex: { width: 23, height: 23, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: '#dbeafe' }, placementIndexText: { fontSize: 10, fontWeight: '800', color: '#1d4ed8' }, placementCopy: { flex: 1 }, placementName: { fontSize: 10, fontWeight: '800', color: '#334155' }, placementMeta: { marginTop: 2, fontSize: 9, color: '#64748b' }, placementCheckButton: { width: 29, height: 29, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 7, backgroundColor: '#fff' }, placementCheckButtonDone: { borderColor: '#16a34a', backgroundColor: '#dcfce7' }, placementCheckText: { fontSize: 17, fontWeight: '900', color: '#94a3b8' }, placementCheckTextDone: { color: '#15803d' }, placementDone: { fontSize: 16, fontWeight: '900', color: '#16a34a' },
  rollTabs: { flexDirection: 'row', gap: 6, marginTop: 10 }, rollTab: { minHeight: 30, justifyContent: 'center', paddingHorizontal: 10, borderRadius: 7, backgroundColor: '#e2e8f0' }, rollTabActive: { backgroundColor: '#2563eb' }, rollTabText: { fontSize: 10, fontWeight: '800', color: '#475569' }, rollTabTextActive: { color: '#fff' },
});
