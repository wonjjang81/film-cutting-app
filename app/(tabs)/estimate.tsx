import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform, ScrollView, StyleSheet, Switch, Text, TextInput, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as Clipboard from 'expo-clipboard';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { createAppLibraryRepository } from '../../src/features/library/libraryRepositoryFactory';
import type { LibraryDocument } from '../../src/features/library/models';
import { DEFAULT_CONSTRUCTION_COST_PER_M2, DEFAULT_MATERIAL_COST_PER_M } from '../../src/features/estimate/calculateEstimate';
import { calculateProjectEstimate, type ProjectEstimate } from '../../src/features/estimate/calculateProjectEstimate';
import { calculateCurrentGroupEstimate, CURRENT_GROUP_ESTIMATE_STORAGE_KEY, parseCurrentEstimateSnapshot, type CurrentEstimateSnapshot } from '../../src/features/estimate/currentGroupEstimate';
import { getEstimatePanelVisibility, selectEstimateSource, selectSavedProjectEstimateSource } from '../../src/features/estimate/estimateScreenModel';
import { buildEstimateGroupBreakdown } from '../../src/features/estimate/estimateBreakdownModel';
import { COMPANY_INFO_STORAGE_KEY, emptyCompanyInfo, LEGACY_COMPANY_NAME_STORAGE_KEY, parseCompanyInfo, type CompanyInfo } from '../../src/features/settings/companyInfo';
import { DIFFICULTY_PRICING } from '../../src/features/estimate/difficultyPricing';
import { buildSubgroupRoughEstimateLines, type SubgroupRoughEstimateLine } from '../../src/features/estimate/subgroupRoughEstimate';
import { CURRENT_PROJECT_CONTEXT_STORAGE_KEY, parseCurrentProjectContext } from '../../src/features/library/currentProjectContext';
import { buildFilmEstimateSubmission, CONSTRUCTION_MANAGER_CONTEXT_KEY, parseConstructionManagerContext, type ConstructionManagerContext } from '../../src/features/integration/constructionManager';

const repository = createAppLibraryRepository();
const emptyLibrary: LibraryDocument = { version: 1, presets: [], jobs: [], remnants: [], mergedJobs: [] };
type GroupMaterialRateText = Record<string, string>;

export default function EstimateScreen() {
  const { width } = useWindowDimensions();
  const [currentSnapshot, setCurrentSnapshot] = useState<CurrentEstimateSnapshot | null>(null);
  const [library, setLibrary] = useState<LibraryDocument>(emptyLibrary);
  const [estimateMode, setEstimateMode] = useState<'project' | 'current'>('project');
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);
  const [company, setCompany] = useState<CompanyInfo>(emptyCompanyInfo);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [constructionManagerContext, setConstructionManagerContext] = useState<ConstructionManagerContext | null>(null);
  const [submittingToConstructionManager, setSubmittingToConstructionManager] = useState(false);
  const [materialCostText, setMaterialCostText] = useState(String(DEFAULT_MATERIAL_COST_PER_M));
  const [constructionCostText, setConstructionCostText] = useState(String(DEFAULT_CONSTRUCTION_COST_PER_M2));
  const [globalRateOverride, setGlobalRateOverride] = useState(false);
  const [groupMaterialRateText, setGroupMaterialRateText] = useState<GroupMaterialRateText>({});
  const [discountEnabled, setDiscountEnabled] = useState(false);
  const [discountText, setDiscountText] = useState('');
  const hasFocusedOnce = useRef(false);

  const loadCurrentSnapshot = useCallback(async () => {
    const raw = await AsyncStorage.getItem(CURRENT_GROUP_ESTIMATE_STORAGE_KEY);
    setCurrentSnapshot(parseCurrentEstimateSnapshot(raw));
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [loaded, projectContextRaw, cmContextRaw] = await Promise.all([repository.load(), AsyncStorage.getItem(CURRENT_PROJECT_CONTEXT_STORAGE_KEY), AsyncStorage.getItem(CONSTRUCTION_MANAGER_CONTEXT_KEY)]);
      setLibrary(loaded.document);
      const projectContext = parseCurrentProjectContext(projectContextRaw);
      setCurrentProjectId(projectContext?.id ?? null);
      try { setConstructionManagerContext(cmContextRaw ? parseConstructionManagerContext(JSON.parse(cmContextRaw)) : null); } catch { setConstructionManagerContext(null); }
      const companyRaw = await AsyncStorage.getItem(COMPANY_INFO_STORAGE_KEY); const legacyCompany = companyRaw ? null : await AsyncStorage.getItem(LEGACY_COMPANY_NAME_STORAGE_KEY); setCompany(parseCompanyInfo(companyRaw ?? (legacyCompany ? JSON.stringify(legacyCompany) : null)));
      setMaterialCostText(String(DEFAULT_MATERIAL_COST_PER_M)); setConstructionCostText(String(DEFAULT_CONSTRUCTION_COST_PER_M2)); setGlobalRateOverride(false); setGroupMaterialRateText({}); setDiscountEnabled(false); setDiscountText('');
      const activeProject = (loaded.document.projects ?? []).find((project) => project.id === projectContext?.id);
      setEstimateMode(activeProject && activeProject.jobIds.length > 0 ? 'project' : 'current');
      if (loaded.warnings.length > 0) setError(loaded.warnings.join(' '));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '저장된 프로젝트를 불러오지 못했습니다.');
    } finally { setLoading(false); }
  }, []);
  const materialCost = positiveNumber(materialCostText, DEFAULT_MATERIAL_COST_PER_M);
  const constructionCost = positiveNumber(constructionCostText, DEFAULT_CONSTRUCTION_COST_PER_M2);
  const discountOverride = discountEnabled ? Math.min(100, Math.max(0, Number(discountText) || 0)) / 100 : undefined;
  const currentEstimate = useMemo(() => {
    if (!currentSnapshot) return { jobs: [], mergedJobs: [] };
    try { return calculateCurrentGroupEstimate(currentSnapshot); } catch { return { jobs: [], mergedJobs: [] }; }
  }, [currentSnapshot]);
  const estimateJobs = currentEstimate.jobs;
  const estimateMergedJobs = currentEstimate.mergedJobs;
  const activeProject = (library.projects ?? []).find((project) => project.id === currentProjectId);
  const savedProjectSource = selectSavedProjectEstimateSource(activeProject, library.jobs, library.mergedJobs);
  const estimateSource = selectEstimateSource(estimateMode, savedProjectSource.jobs, savedProjectSource.mergedJobs, estimateJobs, estimateMergedJobs);
  const sourceJobs = estimateSource.jobs;
  const sourceMergedJobs = estimateSource.mergedJobs;
  const jobsWithGroupIds = useMemo(() => sourceJobs.map((job) => ({ ...job, groupId: job.groupId?.trim() || job.name.split(' · ')[0]?.trim() || undefined })), [sourceJobs]);
  const groupRateEntries = useMemo(() => {
    const groups = new Map<string, { id: string; label: string; jobCount: number }>();
    jobsWithGroupIds.forEach((job) => {
      const id = job.groupId?.trim();
      if (!id) return;
      const current = groups.get(id);
      groups.set(id, current ? { ...current, jobCount: current.jobCount + 1 } : { id, label: majorGroupLabel(id), jobCount: 1 });
    });
    return [...groups.values()];
  }, [jobsWithGroupIds]);
  const groupMaterialRates = useMemo(() => Object.fromEntries(groupRateEntries.flatMap(({ id }) => {
    const raw = groupMaterialRateText[id];
    if (raw === undefined || raw.trim() === '') return [];
    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed >= 0 ? [[id, parsed] as const] : [];
  })), [groupMaterialRateText, groupRateEntries]);
  const projectEstimate = calculateProjectEstimate(jobsWithGroupIds, materialCost, constructionCost, discountOverride, sourceMergedJobs, { rateMode: globalRateOverride ? 'global' : 'group', materialRatesByGroupId: groupMaterialRates });
  const subgroupRoughEstimates = useMemo(() => buildSubgroupRoughEstimateLines(jobsWithGroupIds, { materialCostPerM: materialCost, constructionCostPerM2: constructionCost, materialRatesByGroupId: groupMaterialRates, globalRateOverride }), [constructionCost, globalRateOverride, groupMaterialRates, jobsWithGroupIds, materialCost]);
  const hasEstimate = sourceJobs.length > 0 || sourceMergedJobs.length > 0;
  const estimatePanels = getEstimatePanelVisibility(hasEstimate);
  const exportEstimatePdf = async () => {
    if (!hasEstimate) return;
    const html = createGroupedEstimateHtml(projectEstimate, materialCost, constructionCost, company);
    if (Platform.OS === 'web') await Print.printAsync({ html });
    else { const file = await Print.printToFileAsync({ html }); if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(file.uri, { mimeType: 'application/pdf', dialogTitle: '견적서 PDF 공유' }); }
  };
  const copyEstimate = async () => { if (!hasEstimate) return; await Clipboard.setStringAsync(createGroupedEstimateText(projectEstimate, company)); };
  const submitToConstructionManager = async () => {
    if (!hasEstimate || !constructionManagerContext) return;
    setSubmittingToConstructionManager(true); setError(null);
    try {
      const payload = buildFilmEstimateSubmission({ context: constructionManagerContext, externalEntityId: activeProject?.id ?? currentProjectId ?? '', sourceUpdatedAt: activeProject?.updatedAt ?? new Date().toISOString(), materialCost: projectEstimate.materialCost, constructionCost: projectEstimate.constructionCost, discount: projectEstimate.discount, total: projectEstimate.total });
      const response = await fetch('/api/integrations/construction-manager/estimate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      if (!response.ok) throw new Error((await response.json().catch(() => null))?.error ?? '건설매니저 제출에 실패했습니다.');
      setError('건설매니저에 견적 검토본을 제출했습니다.');
    } catch (caught) { setError(caught instanceof Error ? caught.message : '건설매니저 제출에 실패했습니다.'); }
    finally { setSubmittingToConstructionManager(false); }
  };
  // Deep links on web can render before Expo Router emits its first focus event.
  // Load on mount as well so a direct /estimate visit never remains in a spinner.
  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => { void loadCurrentSnapshot().catch(() => undefined); }, [loadCurrentSnapshot]);
  useFocusEffect(useCallback(() => {
    if (hasFocusedOnce.current) { void refresh(); void loadCurrentSnapshot().catch(() => undefined); }
    hasFocusedOnce.current = true;
  }, [loadCurrentSnapshot, refresh]));

  return <ScrollView style={styles.page} contentContainerStyle={[styles.content, width < 420 && styles.contentSmall]}>
    <View style={styles.header}><View><Text style={styles.eyebrow}>ESTIMATE WORKSPACE</Text><Text style={styles.title}>자동 견적</Text><Text style={styles.description}>현재 입력된 그룹·조각의 원단·시공 비용을 자동 계산합니다.</Text></View><TouchableOpacity accessibilityRole="button" accessibilityLabel="견적 새로고침" onPress={() => void refresh()} style={styles.refresh}><Text style={styles.refreshText}>새로고침</Text></TouchableOpacity></View>
    {error && <Text style={styles.error}>{error}</Text>}
    {constructionManagerContext && <TouchableOpacity accessibilityRole="button" disabled={!hasEstimate || submittingToConstructionManager} onPress={() => void submitToConstructionManager()} style={[styles.pdfButton, (!hasEstimate || submittingToConstructionManager) && styles.disabledButton]}><Text style={styles.pdfButtonText}>{submittingToConstructionManager ? '건설매니저 제출 중…' : '건설매니저로 견적 제출'}</Text></TouchableOpacity>}
    {loading ? <Text style={styles.empty}>견적을 불러오는 중입니다…</Text> : <><View style={styles.controls}><Text style={styles.controlsTitle}>{estimateMode === 'project' && savedProjectSource.jobs.length > 0 ? '저장된 프로젝트 통합 견적' : '현재 그룹·조각 통합 견적'}</Text><Text style={styles.currentHint}>{estimateMode === 'project' && savedProjectSource.jobs.length > 0 ? '현재 선택된 프로젝트의 작업과 병합 롤만 하나의 통합 견적으로 계산합니다.' : '재단 계산 탭에 입력된 모든 유효 그룹·조각을 하나의 통합 견적으로 계산합니다.'}</Text>{savedProjectSource.jobs.length > 0 && <View style={styles.sourceSelector}><Text style={styles.controlLabel}>견적 기준</Text><View style={styles.sourceButtons}><TouchableOpacity accessibilityRole="button" accessibilityState={{ selected: estimateMode === 'project' }} onPress={() => setEstimateMode('project')} style={[styles.sourceButton, estimateMode === 'project' && styles.sourceButtonActive]}><Text style={[styles.sourceButtonText, estimateMode === 'project' && styles.sourceButtonTextActive]}>저장 프로젝트 ({savedProjectSource.jobs.length})</Text></TouchableOpacity><TouchableOpacity accessibilityRole="button" accessibilityState={{ selected: estimateMode === 'current' }} onPress={() => setEstimateMode('current')} style={[styles.sourceButton, estimateMode === 'current' && styles.sourceButtonActive]}><Text style={[styles.sourceButtonText, estimateMode === 'current' && styles.sourceButtonTextActive]}>현재 입력 ({estimateJobs.length})</Text></TouchableOpacity></View></View>}<View style={styles.controlGrid}><EstimateInput label="기본 원단 단가" unit="원/m" value={materialCostText} onChangeText={setMaterialCostText} /><EstimateInput label="기본 시공 단가" unit="원/m²" value={constructionCostText} onChangeText={setConstructionCostText} /></View>{groupRateEntries.length > 0 && <View style={styles.groupRates}><Text style={styles.controlLabel}>대그룹별 원단 단가</Text><Text style={styles.controlHint}>입력한 대그룹 원단 단가를 해당 대그룹의 모든 소그룹에 적용합니다.</Text>{groupRateEntries.map((group) => <View key={group.id} style={styles.groupRateRow}><View style={styles.groupRateCopy}><Text style={styles.groupRateLabel}>{group.label}</Text><Text style={styles.groupRateMeta}>{group.jobCount}개 작업</Text></View><View style={styles.groupRateInputWrap}><TextInput accessibilityLabel={`${group.label} 원단 단가`} value={groupMaterialRateText[group.id] ?? ''} onChangeText={(value) => setGroupMaterialRateText((current) => ({ ...current, [group.id]: value.replace(/[^0-9]/g, '') }))} placeholder={String(materialCost)} keyboardType="numeric" style={styles.groupRateInput} /><Text style={styles.unit}>원/m</Text></View></View>)}</View>}<PricePresetRow value={constructionCost} onChange={setConstructionCostText} /><View style={styles.overrideRow}><View style={styles.discountCopy}><Text style={styles.controlLabel}>전체 단가 덮어쓰기</Text><Text style={styles.controlHint}>{globalRateOverride ? '입력한 기본 단가를 모든 그룹에 적용합니다.' : '그룹별 개별 단가를 우선 적용합니다.'}</Text></View><Switch accessibilityLabel="전체 단가 덮어쓰기" value={globalRateOverride} onValueChange={setGlobalRateOverride} /></View><View style={styles.discountRow}><View style={styles.discountCopy}><Text style={styles.controlLabel}>할인 적용</Text><Text style={styles.controlHint}>{discountEnabled ? '입력한 할인율을 적용합니다.' : '면적 기준 자동 할인을 적용합니다.'}</Text></View><Switch accessibilityLabel="할인 적용" value={discountEnabled} onValueChange={setDiscountEnabled} /><TextInput accessibilityLabel="할인율 퍼센트" editable={discountEnabled} value={discountText} onChangeText={(value) => setDiscountText(value.replace(/[^0-9.]/g, ''))} placeholder="0" keyboardType="numeric" style={[styles.discountInput, !discountEnabled && styles.disabledInput]} /><Text style={styles.percent}>%</Text></View><View style={projectStyles.estimateActions}><TouchableOpacity accessibilityRole="button" disabled={!hasEstimate} onPress={() => void exportEstimatePdf()} style={[styles.pdfButton, !hasEstimate && styles.disabledButton]}><Text style={styles.pdfButtonText}>통합 견적 PDF·인쇄</Text></TouchableOpacity><TouchableOpacity accessibilityRole="button" disabled={!hasEstimate} onPress={() => void copyEstimate()} style={[projectStyles.copyButton, !hasEstimate && styles.disabledButton]}><Text style={projectStyles.copyButtonText}>견적 요약 복사</Text></TouchableOpacity></View></View>{subgroupRoughEstimates.length > 0 && <SubgroupRoughEstimateCard lines={subgroupRoughEstimates} />}{estimatePanels.showProjectSummary ? <><ProjectEstimateSummary estimate={projectEstimate} jobCount={projectEstimate.jobCount} company={company} /><ProjectEstimateBreakdown estimate={projectEstimate} /></> : <View style={styles.emptyCard}><Text style={styles.emptyTitle}>견적 대상 작업이 없습니다.</Text><Text style={styles.emptyDescription}>저장 프로젝트를 만들거나 재단 계산 탭에서 유효한 그룹·조각을 입력해 주세요.</Text></View>}</>}
  </ScrollView>;
}

function ProjectEstimateSummary({ estimate, jobCount, company }: { estimate: ProjectEstimate; jobCount: number; company: CompanyInfo }) {
  return <View style={projectStyles.card}><Text style={projectStyles.eyebrow}>AUTO ESTIMATE · PROJECT TOTAL</Text><Text style={projectStyles.title}>{company.companyName || '프로젝트 통합 견적'}</Text><Text style={projectStyles.meta}>입력 조각 {estimate.inputPieceCount.toLocaleString('ko-KR')}개 · 견적 항목 {jobCount}개 · 원단 {estimate.materialLengthM.toLocaleString('ko-KR', { maximumFractionDigits: 2 })}m · 사용 면적 {estimate.materialAreaM2.toLocaleString('ko-KR', { maximumFractionDigits: 3 })}m²</Text><Text style={projectStyles.total}>{estimate.total.toLocaleString('ko-KR')}원</Text><View style={projectStyles.rows}><View style={projectStyles.row}><Text style={projectStyles.label}>원단 비용</Text><Text style={projectStyles.value}>{estimate.materialCost.toLocaleString('ko-KR')}원</Text></View><View style={projectStyles.row}><Text style={projectStyles.label}>시공 비용</Text><Text style={projectStyles.value}>{estimate.constructionCost.toLocaleString('ko-KR')}원</Text></View><View style={projectStyles.row}><Text style={projectStyles.label}>시공비 범위</Text><Text style={projectStyles.value}>{estimate.constructionCostRange.min.toLocaleString('ko-KR')}~{estimate.constructionCostRange.max.toLocaleString('ko-KR')}원</Text></View><View style={projectStyles.row}><Text style={projectStyles.label}>최종 견적 범위</Text><Text style={projectStyles.value}>{estimate.totalRange.min.toLocaleString('ko-KR')}~{estimate.totalRange.max.toLocaleString('ko-KR')}원</Text></View><View style={projectStyles.row}><Text style={projectStyles.label}>할인</Text><Text style={projectStyles.value}>-{estimate.discount.toLocaleString('ko-KR')}원 ({Math.round(estimate.discountRate * 100)}%)</Text></View></View></View>;
}

function ProjectEstimateBreakdown({ estimate }: { estimate: ProjectEstimate }) {
  const groups = buildEstimateGroupBreakdown(estimate);
  return <View style={projectStyles.breakdown}>
    <Text style={projectStyles.breakdownTitle}>작업별 견적 내역</Text>
    <Text style={projectStyles.breakdownHint}>대그룹별 합계와 소그룹별 금액을 표시합니다.</Text>
    {groups.map((group) => <View key={group.id} style={projectStyles.majorGroupCard}>
      <View style={projectStyles.majorGroupRow}><View style={projectStyles.breakdownCopy}><Text style={projectStyles.majorGroupName}>{group.label}</Text><Text style={projectStyles.breakdownMeta}>소그룹 {group.subgroups.length}개 · 조각 종류 {group.pieceCount}개 · 입력 수량 {group.inputQuantity.toLocaleString('ko-KR')}개</Text></View><AmountSummary materialCost={group.amounts.materialCost} constructionCost={group.amounts.constructionCost} subtotal={group.amounts.subtotal} emphasis /></View>
      <View style={projectStyles.subgroupList}>{group.subgroups.map((subgroup) => <View key={subgroup.id} style={projectStyles.subgroupEstimateRow}><View style={projectStyles.breakdownCopy}><Text style={projectStyles.subgroupEstimateName}>소그룹 {subgroup.name}</Text><Text style={projectStyles.breakdownMeta}>조각 종류 {subgroup.pieceCount}개 · 입력 수량 {subgroup.inputQuantity.toLocaleString('ko-KR')}개{subgroup.siteCount ? ` · ${subgroup.siteCount}개소` : ''}</Text><Text style={projectStyles.breakdownMeta}>원단 {subgroup.amounts.materialLengthM.toLocaleString('ko-KR', { maximumFractionDigits: 2 })}m · 사용 면적 {subgroup.amounts.materialAreaM2.toLocaleString('ko-KR', { maximumFractionDigits: 3 })}m²</Text></View><AmountSummary materialCost={subgroup.amounts.materialCost} constructionCost={subgroup.amounts.constructionCost} subtotal={subgroup.amounts.subtotal} /></View>)}</View>
    </View>)}
  </View>;
}

function SubgroupRoughEstimateCard({ lines }: { lines: readonly SubgroupRoughEstimateLine[] }) {
  const totals = lines.reduce((sum, line) => ({ areaM2: sum.areaM2 + line.areaM2, materialLengthM: sum.materialLengthM + line.materialLengthM, total: sum.total + line.total }), { areaM2: 0, materialLengthM: 0, total: 0 });
  return <View style={projectStyles.roughCard}><Text style={projectStyles.roughEyebrow}>ROUGH ESTIMATE</Text><Text style={projectStyles.roughTitle}>소그룹 전체치수 개산견적</Text><Text style={projectStyles.roughHint}>전면·양측면·상·하면과 개소 수를 기준으로 한 참고값입니다. 실제 재단 배치 견적과 별도로 확인하세요.</Text><View style={projectStyles.roughTotals}><Text style={projectStyles.roughTotalValue}>{totals.total.toLocaleString('ko-KR')}원</Text><Text style={projectStyles.roughTotalMeta}>{totals.areaM2.toLocaleString('ko-KR', { maximumFractionDigits: 2 })}m² · 원단 환산 {totals.materialLengthM.toLocaleString('ko-KR', { maximumFractionDigits: 2 })}m</Text></View>{lines.map((line) => <View key={line.id} style={projectStyles.roughLine}><View style={projectStyles.breakdownCopy}><Text style={projectStyles.subgroupEstimateName}>{majorGroupLabel(line.groupId)} · {line.subgroupName}</Text><Text style={projectStyles.breakdownMeta}>{line.dimensions.widthMm}×{line.dimensions.heightMm}×{line.dimensions.depthMm}mm · 문 {line.dimensions.doorCount}개 · {line.siteCount}개소</Text><Text style={projectStyles.breakdownMeta}>{line.areaM2.toLocaleString('ko-KR', { maximumFractionDigits: 2 })}m² · 원단 {line.materialLengthM.toLocaleString('ko-KR', { maximumFractionDigits: 2 })}m</Text></View><Text style={projectStyles.roughLineAmount}>{line.total.toLocaleString('ko-KR')}원</Text></View>)}</View>;
}

function AmountSummary({ materialCost, constructionCost, subtotal, emphasis = false }: { materialCost: number; constructionCost: number; subtotal: number; emphasis?: boolean }) {
  return <View style={projectStyles.amountSummary}><Text style={projectStyles.breakdownCost}>원단 {materialCost.toLocaleString('ko-KR')}원</Text><Text style={projectStyles.breakdownCost}>시공 {constructionCost.toLocaleString('ko-KR')}원</Text><Text style={[projectStyles.subtotalCost, emphasis && projectStyles.subtotalCostEmphasis]}>합계 {subtotal.toLocaleString('ko-KR')}원</Text></View>;
}

function PricePresetRow({ value, onChange }: { value: number; onChange(value: string): void }) {
  const presets = [
    { label: '하', value: DIFFICULTY_PRICING.low.defaultRate },
    { label: '중', value: DIFFICULTY_PRICING.medium.defaultRate },
    { label: '상', value: DIFFICULTY_PRICING.high.defaultRate },
  ];
  return <View style={styles.pricePresetRow}>{presets.map((preset) => { const difficulty = preset.label === '하' ? DIFFICULTY_PRICING.low : preset.label === '상' ? DIFFICULTY_PRICING.high : DIFFICULTY_PRICING.medium; return <TouchableOpacity key={preset.label} accessibilityRole="button" accessibilityLabel={`시공 단가 ${preset.label}`} onPress={() => onChange(String(preset.value))} style={[styles.pricePreset, value === preset.value && styles.pricePresetActive]}><Text style={[styles.pricePresetLabel, value === preset.value && styles.pricePresetLabelActive]}>{preset.label}</Text><Text style={[styles.pricePresetValue, value === preset.value && styles.pricePresetLabelActive]}>{preset.value.toLocaleString('ko-KR')}원</Text><Text style={styles.pricePresetRange}>{difficulty.min.toLocaleString('ko-KR')}~{difficulty.max.toLocaleString('ko-KR')}</Text></TouchableOpacity>; })}</View>;
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#f1f5f9' }, content: { width: '100%', maxWidth: 980, alignSelf: 'center', paddingHorizontal: 20, paddingTop: 32, paddingBottom: 72 }, contentSmall: { paddingHorizontal: 12, paddingTop: 20 },
  header: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-end', justifyContent: 'space-between', gap: 14, marginBottom: 18 }, eyebrow: { fontSize: 11, letterSpacing: 1.8, fontWeight: '800', color: '#2563eb' }, title: { marginTop: 6, fontSize: 32, lineHeight: 40, fontWeight: '800', color: '#0f172a' }, description: { marginTop: 7, fontSize: 14, lineHeight: 21, color: '#64748b' }, refresh: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 15, borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 10, backgroundColor: '#fff' }, refreshText: { fontSize: 12, fontWeight: '800', color: '#334155' }, error: { marginBottom: 16, padding: 13, borderRadius: 10, borderWidth: 1, borderColor: '#fecaca', color: '#991b1b', backgroundColor: '#fff1f2' }, controls: { padding: 17, borderRadius: 16, backgroundColor: '#fff', borderWidth: 1, borderColor: '#e2e8f0' }, controlsTitle: { fontSize: 15, fontWeight: '800', color: '#1e293b' }, controlGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 12 }, control: { minWidth: 180, flex: 1 }, controlLabel: { marginBottom: 6, fontSize: 11, fontWeight: '700', color: '#475569' }, controlInputWrap: { flexDirection: 'row', alignItems: 'center', minHeight: 42, borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 9, backgroundColor: '#f8fafc' }, controlInput: { flex: 1, minHeight: 40, paddingHorizontal: 10, fontSize: 14, fontWeight: '700', color: '#0f172a' }, unit: { paddingRight: 10, fontSize: 10, color: '#64748b' }, pricePresetRow: { flexDirection: 'row', gap: 8, marginTop: 12 }, pricePreset: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 9, borderWidth: 1, borderColor: '#cbd5e1', backgroundColor: '#f8fafc' }, pricePresetActive: { borderColor: '#2563eb', backgroundColor: '#eff6ff' }, pricePresetLabel: { fontSize: 10, color: '#64748b' }, pricePresetLabelActive: { color: '#1d4ed8', fontWeight: '800' }, pricePresetValue: { marginTop: 2, fontSize: 11, fontWeight: '700', color: '#334155' }, pricePresetRange: { marginTop: 2, fontSize: 8, color: '#94a3b8' }, discountRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 14 }, discountCopy: { flex: 1 }, controlHint: { marginTop: 3, fontSize: 10, color: '#64748b' }, discountInput: { width: 62, height: 40, paddingHorizontal: 8, borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 8, textAlign: 'center', color: '#0f172a' }, disabledInput: { opacity: 0.4, backgroundColor: '#f1f5f9' }, percent: { fontSize: 12, color: '#64748b' }, pdfButton: { minHeight: 42, alignItems: 'center', justifyContent: 'center', marginTop: 14, borderRadius: 9, backgroundColor: '#1e3a8a' }, pdfButtonText: { fontSize: 12, fontWeight: '800', color: '#fff' }, empty: { paddingVertical: 30, textAlign: 'center', color: '#64748b' }, emptyCard: { marginTop: 12, padding: 24, borderRadius: 18, borderWidth: 1, borderColor: '#e2e8f0', backgroundColor: '#fff' }, emptyTitle: { fontSize: 17, fontWeight: '800', color: '#1e293b' }, emptyDescription: { marginTop: 8, fontSize: 13, lineHeight: 20, color: '#64748b' },
  currentHint: { marginTop: 6, fontSize: 11, lineHeight: 17, color: '#64748b' }, sourceSelector: { marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#e2e8f0' }, sourceButtons: { flexDirection: 'row', gap: 7, marginTop: 7 }, sourceButton: { flex: 1, minHeight: 38, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8, borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 8, backgroundColor: '#f8fafc' }, sourceButtonActive: { borderColor: '#2563eb', backgroundColor: '#eff6ff' }, sourceButtonText: { fontSize: 10, fontWeight: '700', color: '#64748b' }, sourceButtonTextActive: { color: '#1d4ed8', fontWeight: '800' }, groupRates: { marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#e2e8f0' }, groupRateRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 8, padding: 9, borderRadius: 8, borderWidth: 1, borderColor: '#dbeafe', backgroundColor: '#f8fbff' }, groupRateCopy: { flex: 1 }, groupRateLabel: { fontSize: 11, fontWeight: '800', color: '#1e3a8a' }, groupRateMeta: { marginTop: 2, fontSize: 9, color: '#64748b' }, groupRateInputWrap: { flexDirection: 'row', alignItems: 'center', minHeight: 34, borderWidth: 1, borderColor: '#bfdbfe', borderRadius: 7, backgroundColor: '#fff' }, groupRateInput: { width: 82, height: 32, paddingHorizontal: 7, color: '#0f172a', fontSize: 11, textAlign: 'right' }, overrideRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#e2e8f0' }, disabledButton: { opacity: 0.45 },
});

const projectStyles = StyleSheet.create({
  roughCard: { marginTop: 14, padding: 16, borderWidth: 1, borderColor: '#bae6fd', borderRadius: 14, backgroundColor: '#f0f9ff' }, roughEyebrow: { fontSize: 9, letterSpacing: 1.2, fontWeight: '900', color: '#0284c7' }, roughTitle: { marginTop: 4, fontSize: 16, fontWeight: '900', color: '#0c4a6e' }, roughHint: { marginTop: 5, fontSize: 10, lineHeight: 16, color: '#64748b' }, roughTotals: { marginTop: 12, marginBottom: 4, padding: 12, borderRadius: 10, backgroundColor: '#fff' }, roughTotalValue: { fontSize: 22, fontWeight: '900', color: '#0369a1' }, roughTotalMeta: { marginTop: 3, fontSize: 10, color: '#475569' }, roughLine: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#bae6fd' }, roughLineAmount: { flexShrink: 0, fontSize: 12, fontWeight: '900', color: '#0c4a6e' },
  majorGroupCard: { marginTop: 12, overflow: 'hidden', borderWidth: 1, borderColor: '#bfdbfe', borderRadius: 12, backgroundColor: '#fff' },
  majorGroupRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 10, padding: 12, backgroundColor: '#eff6ff' },
  majorGroupName: { fontSize: 13, fontWeight: '900', color: '#1e3a8a' },
  subgroupList: { paddingHorizontal: 12 },
  subgroupEstimateRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 10, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: '#e2e8f0' },
  subgroupEstimateName: { fontSize: 12, fontWeight: '800', color: '#334155' },
  amountSummary: { minWidth: 116, alignItems: 'flex-end', justifyContent: 'center' },
  subtotalCost: { marginTop: 3, fontSize: 11, fontWeight: '900', textAlign: 'right', color: '#0f172a' },
  subtotalCostEmphasis: { fontSize: 13, color: '#1d4ed8' },
  card: { marginTop: 18, padding: 18, borderRadius: 16, backgroundColor: '#0f172a' }, eyebrow: { fontSize: 10, letterSpacing: 1.4, fontWeight: '800', color: '#93c5fd' }, title: { marginTop: 5, fontSize: 20, fontWeight: '800', color: '#fff' }, meta: { marginTop: 4, fontSize: 11, color: '#cbd5e1' }, total: { marginTop: 14, fontSize: 28, fontWeight: '900', color: '#bfdbfe' }, rows: { gap: 7, marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#334155' }, row: { flexDirection: 'row', justifyContent: 'space-between' }, label: { fontSize: 11, color: '#cbd5e1' }, value: { fontSize: 11, fontWeight: '800', color: '#f8fafc' }, breakdown: { marginTop: 14, padding: 16, borderRadius: 16, borderWidth: 1, borderColor: '#e2e8f0', backgroundColor: '#fff' }, breakdownTitle: { fontSize: 14, fontWeight: '800', color: '#1e293b' }, breakdownHint: { marginTop: 4, marginBottom: 4, fontSize: 10, color: '#64748b' }, rateEditorWrap: { marginLeft: 0 }, rateEditor: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginTop: 7 }, rateField: { flexDirection: 'row', alignItems: 'center', gap: 3 }, rateLabel: { fontSize: 9, color: '#64748b' }, rateInput: { width: 70, height: 30, paddingHorizontal: 5, borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 6, backgroundColor: '#fff', color: '#0f172a', fontSize: 10, textAlign: 'right' }, rateInputDisabled: { opacity: 0.45, backgroundColor: '#f1f5f9' }, rateUnit: { fontSize: 8, color: '#64748b' }, resetRate: { minHeight: 28, justifyContent: 'center', paddingHorizontal: 7, borderRadius: 6, backgroundColor: '#eff6ff' }, resetRateText: { fontSize: 9, fontWeight: '700', color: '#1d4ed8' }, breakdownRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' }, sourceRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 10, paddingVertical: 8, paddingLeft: 10, borderBottomWidth: 1, borderBottomColor: '#f1f5f9', backgroundColor: '#f8fafc' }, breakdownCopy: { flex: 1 }, breakdownName: { fontSize: 12, fontWeight: '800', color: '#334155' }, sourceTitle: { fontSize: 11, fontWeight: '800', color: '#475569' }, breakdownMeta: { marginTop: 3, fontSize: 10, color: '#64748b' }, breakdownRate: { marginTop: 3, fontSize: 10, color: '#1d4ed8' }, breakdownCost: { fontSize: 10, fontWeight: '700', textAlign: 'right', color: '#334155' }, estimateActions: { flexDirection: 'row', gap: 8, marginTop: 14 }, copyButton: { minHeight: 42, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 13, borderRadius: 9, borderWidth: 1, borderColor: '#bfdbfe', backgroundColor: '#eff6ff' }, copyButtonText: { fontSize: 11, fontWeight: '800', color: '#1d4ed8' },
});

function EstimateInput({ label, unit, value, onChangeText }: { label: string; unit: string; value: string; onChangeText(value: string): void }) { return <View style={styles.control}><Text style={styles.controlLabel}>{label}</Text><View style={styles.controlInputWrap}><TextInput accessibilityLabel={label} value={value} onChangeText={(text) => onChangeText(text.replace(/[^0-9]/g, ''))} keyboardType="numeric" style={styles.controlInput} /><Text style={styles.unit}>{unit}</Text></View></View>; }
function positiveNumber(value: string, fallback: number): number { const parsed = Number(value); return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback; }
function majorGroupLabel(groupId: string): string {
  const numericId = groupId.match(/^group-(\d+)(?:-|$)/)?.[1];
  return numericId ? `대그룹 ID ${numericId}` : `대그룹 ${groupId}`;
}
function createGroupedEstimateHtml(estimate: ProjectEstimate, materialCost: number, constructionCost: number, company: CompanyInfo): string {
  const esc = (value: string) => value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char] ?? char));
  const companyLine = [company.companyName, company.managerName, company.phone, company.email, company.address].filter(Boolean).map(esc).join(' · ');
  const groups = buildEstimateGroupBreakdown(estimate);
  const rows = groups.flatMap((group) => [
    `<tr class="major"><td>${esc(group.label)}</td><td>소그룹 ${group.subgroups.length}개 · 조각 종류 ${group.pieceCount}개</td><td>${group.inputQuantity.toLocaleString('ko-KR')}개</td><td>${group.amounts.materialLengthM.toLocaleString('ko-KR', { maximumFractionDigits: 2 })}m</td><td>${group.amounts.materialAreaM2.toLocaleString('ko-KR', { maximumFractionDigits: 3 })}m²</td><td>${group.amounts.materialCost.toLocaleString('ko-KR')}원</td><td>${group.amounts.constructionCost.toLocaleString('ko-KR')}원</td><td>${group.amounts.subtotal.toLocaleString('ko-KR')}원</td></tr>`,
    ...group.subgroups.map((subgroup) => `<tr><td>↳ 소그룹 ${esc(subgroup.name)}</td><td>조각 종류 ${subgroup.pieceCount}개${subgroup.siteCount ? ` · ${subgroup.siteCount}개소` : ''}</td><td>${subgroup.inputQuantity.toLocaleString('ko-KR')}개</td><td>${subgroup.amounts.materialLengthM.toLocaleString('ko-KR', { maximumFractionDigits: 2 })}m</td><td>${subgroup.amounts.materialAreaM2.toLocaleString('ko-KR', { maximumFractionDigits: 3 })}m²</td><td>${subgroup.amounts.materialCost.toLocaleString('ko-KR')}원</td><td>${subgroup.amounts.constructionCost.toLocaleString('ko-KR')}원</td><td>${subgroup.amounts.subtotal.toLocaleString('ko-KR')}원</td></tr>`),
  ]).join('');
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>필름 통합 견적서</title><style>body{font-family:sans-serif;padding:24px;color:#111827}table{border-collapse:collapse;width:100%;margin-top:16px}th,td{border:1px solid #cbd5e1;padding:8px;text-align:left;font-size:12px}th{background:#f1f5f9}.major td{background:#eff6ff;font-weight:700}h1{margin-bottom:4px}.total{font-size:24px;font-weight:800;color:#1d4ed8}</style></head><body><h1>필름 통합 견적서</h1><p>${companyLine}</p><p class="total">총액 ${estimate.total.toLocaleString('ko-KR')}원</p><p>입력 조각 ${estimate.inputPieceCount.toLocaleString('ko-KR')}개 · 대그룹 ${groups.length}개</p><table><thead><tr><th>구분</th><th>구성</th><th>입력 수량</th><th>원단 길이</th><th>사용 면적</th><th>원단비</th><th>시공비</th><th>합계</th></tr></thead><tbody>${rows}</tbody></table><table><tbody><tr><th>입력 기본 원단 단가</th><td>${materialCost.toLocaleString('ko-KR')}원/m</td></tr><tr><th>입력 기본 시공 단가</th><td>${constructionCost.toLocaleString('ko-KR')}원/m²</td></tr><tr><th>원단 비용</th><td>${estimate.materialCost.toLocaleString('ko-KR')}원</td></tr><tr><th>시공 비용</th><td>${estimate.constructionCost.toLocaleString('ko-KR')}원</td></tr><tr><th>시공비 범위</th><td>${estimate.constructionCostRange.min.toLocaleString('ko-KR')}~${estimate.constructionCostRange.max.toLocaleString('ko-KR')}원</td></tr><tr><th>할인</th><td>${Math.round(estimate.discountRate * 100)}% · -${estimate.discount.toLocaleString('ko-KR')}원</td></tr><tr><th>소계</th><td>${estimate.subtotal.toLocaleString('ko-KR')}원</td></tr></tbody></table><p>${esc(company.note)}</p></body></html>`;
}
function createGroupedEstimateText(estimate: ProjectEstimate, company: CompanyInfo): string {
  const contact = [company.companyName, company.managerName, company.phone, company.email].filter(Boolean).join(' · ');
  const groups = buildEstimateGroupBreakdown(estimate);
  const details = groups.map((group) => [
    `- ${group.label}: 원단 ${group.amounts.materialCost.toLocaleString('ko-KR')}원 · 시공 ${group.amounts.constructionCost.toLocaleString('ko-KR')}원 · 합계 ${group.amounts.subtotal.toLocaleString('ko-KR')}원`,
    ...group.subgroups.map((subgroup) => `  · 소그룹 ${subgroup.name}: 입력 수량 ${subgroup.inputQuantity.toLocaleString('ko-KR')}개 · 원단 ${subgroup.amounts.materialCost.toLocaleString('ko-KR')}원 · 시공 ${subgroup.amounts.constructionCost.toLocaleString('ko-KR')}원 · 합계 ${subgroup.amounts.subtotal.toLocaleString('ko-KR')}원`),
  ].join('\n')).join('\n');
  return `[필름 통합 견적서]\n${contact}\n\n입력 조각 ${estimate.inputPieceCount}개 · 대그룹 ${groups.length}개\n\n[대그룹·소그룹별 내역]\n${details}\n\n원단 비용: ${estimate.materialCost.toLocaleString('ko-KR')}원\n시공 비용: ${estimate.constructionCost.toLocaleString('ko-KR')}원\n시공비 범위: ${estimate.constructionCostRange.min.toLocaleString('ko-KR')}~${estimate.constructionCostRange.max.toLocaleString('ko-KR')}원\n할인: -${estimate.discount.toLocaleString('ko-KR')}원\n총액: ${estimate.total.toLocaleString('ko-KR')}원${company.note ? `\n\n${company.note}` : ''}`;
}
