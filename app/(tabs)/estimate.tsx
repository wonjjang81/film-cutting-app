import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform, ScrollView, StyleSheet, Switch, Text, TextInput, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as Clipboard from 'expo-clipboard';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { createAppLibraryRepository } from '../../src/features/library/libraryRepositoryFactory';
import type { LibraryDocument, SavedCuttingJob } from '../../src/features/library/models';
import { DEFAULT_CONSTRUCTION_COST_PER_M2, DEFAULT_MATERIAL_COST_PER_M } from '../../src/features/estimate/calculateEstimate';
import { calculateProjectEstimate, type ProjectEstimate } from '../../src/features/estimate/calculateProjectEstimate';
import { calculateCurrentGroupEstimate, CURRENT_GROUP_ESTIMATE_STORAGE_KEY, parseCurrentEstimateSnapshot, type CurrentEstimateSnapshot } from '../../src/features/estimate/currentGroupEstimate';
import { getEstimatePanelVisibility, selectEstimateSource } from '../../src/features/estimate/estimateScreenModel';
import { COMPANY_INFO_STORAGE_KEY, emptyCompanyInfo, LEGACY_COMPANY_NAME_STORAGE_KEY, parseCompanyInfo, type CompanyInfo } from '../../src/features/settings/companyInfo';
import { DIFFICULTY_PRICING, normalizeDifficulty } from '../../src/features/estimate/difficultyPricing';

const repository = createAppLibraryRepository();
const emptyLibrary: LibraryDocument = { version: 1, presets: [], jobs: [], remnants: [], mergedJobs: [] };
type RateOverrides = Record<string, { materialCostPerM?: number; constructionCostPerM2?: number }>;
type GroupMaterialRateText = Record<string, string>;

export default function EstimateScreen() {
  const { width } = useWindowDimensions();
  const [currentSnapshot, setCurrentSnapshot] = useState<CurrentEstimateSnapshot | null>(null);
  const [library, setLibrary] = useState<LibraryDocument>(emptyLibrary);
  const [estimateMode, setEstimateMode] = useState<'project' | 'current'>('project');
  const [company, setCompany] = useState<CompanyInfo>(emptyCompanyInfo);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [materialCostText, setMaterialCostText] = useState(String(DEFAULT_MATERIAL_COST_PER_M));
  const [constructionCostText, setConstructionCostText] = useState(String(DEFAULT_CONSTRUCTION_COST_PER_M2));
  const [globalRateOverride, setGlobalRateOverride] = useState(false);
  const [rateOverrides, setRateOverrides] = useState<RateOverrides>({});
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
      const loaded = await repository.load();
      setLibrary(loaded.document);
      const companyRaw = await AsyncStorage.getItem(COMPANY_INFO_STORAGE_KEY); const legacyCompany = companyRaw ? null : await AsyncStorage.getItem(LEGACY_COMPANY_NAME_STORAGE_KEY); setCompany(parseCompanyInfo(companyRaw ?? (legacyCompany ? JSON.stringify(legacyCompany) : null)));
      setMaterialCostText(String(DEFAULT_MATERIAL_COST_PER_M)); setConstructionCostText(String(DEFAULT_CONSTRUCTION_COST_PER_M2)); setGlobalRateOverride(false); setRateOverrides({}); setGroupMaterialRateText({}); setDiscountEnabled(false); setDiscountText('');
      setEstimateMode(loaded.document.jobs.length > 0 ? 'project' : 'current');
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
  const estimateSource = selectEstimateSource(estimateMode, library.jobs, library.mergedJobs, estimateJobs, estimateMergedJobs);
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
  const materialRateOverridesByJobId = useMemo(() => Object.fromEntries(Object.entries(rateOverrides).flatMap(([id, override]) => override.materialCostPerM === undefined ? [] : [[id, override.materialCostPerM] as const])), [rateOverrides]);
  const jobsWithRateOverrides = useMemo(() => jobsWithGroupIds.map((job) => {
    const override = rateOverrides[job.id];
    if (!override) return job;
    return {
      ...job,
      ...(override.materialCostPerM === undefined ? {} : { materialCostPerM: override.materialCostPerM }),
      ...(override.constructionCostPerM2 === undefined ? {} : { constructionCostPerM2: override.constructionCostPerM2 }),
    };
  }), [jobsWithGroupIds, rateOverrides]);
  const projectEstimate = calculateProjectEstimate(jobsWithRateOverrides, materialCost, constructionCost, discountOverride, sourceMergedJobs, { rateMode: globalRateOverride ? 'global' : 'group', materialRatesByGroupId: groupMaterialRates, materialRatesByJobId: materialRateOverridesByJobId });
  const hasEstimate = sourceJobs.length > 0 || sourceMergedJobs.length > 0;
  const estimatePanels = getEstimatePanelVisibility(hasEstimate);
  const exportEstimatePdf = async () => {
    if (!hasEstimate) return;
    const html = createEstimateHtml(projectEstimate, materialCost, constructionCost, company);
    if (Platform.OS === 'web') await Print.printAsync({ html });
    else { const file = await Print.printToFileAsync({ html }); if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(file.uri, { mimeType: 'application/pdf', dialogTitle: '견적서 PDF 공유' }); }
  };
  const copyEstimate = async () => { if (!hasEstimate) return; await Clipboard.setStringAsync(createEstimateText(projectEstimate, company)); };
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
    {loading ? <Text style={styles.empty}>견적을 불러오는 중입니다…</Text> : <><View style={styles.controls}><Text style={styles.controlsTitle}>{estimateMode === 'project' && library.jobs.length > 0 ? '저장된 프로젝트 통합 견적' : '현재 그룹·조각 통합 견적'}</Text><Text style={styles.currentHint}>{estimateMode === 'project' && library.jobs.length > 0 ? '기존 앱처럼 저장된 전체 작업과 병합 롤을 하나의 통합 견적으로 계산합니다.' : '재단 계산 탭에 입력된 모든 유효 그룹·조각을 하나의 통합 견적으로 계산합니다.'}</Text>{library.jobs.length > 0 && <View style={styles.sourceSelector}><Text style={styles.controlLabel}>견적 기준</Text><View style={styles.sourceButtons}><TouchableOpacity accessibilityRole="button" accessibilityState={{ selected: estimateMode === 'project' }} onPress={() => setEstimateMode('project')} style={[styles.sourceButton, estimateMode === 'project' && styles.sourceButtonActive]}><Text style={[styles.sourceButtonText, estimateMode === 'project' && styles.sourceButtonTextActive]}>저장 프로젝트 ({library.jobs.length})</Text></TouchableOpacity><TouchableOpacity accessibilityRole="button" accessibilityState={{ selected: estimateMode === 'current' }} onPress={() => setEstimateMode('current')} style={[styles.sourceButton, estimateMode === 'current' && styles.sourceButtonActive]}><Text style={[styles.sourceButtonText, estimateMode === 'current' && styles.sourceButtonTextActive]}>현재 입력 ({estimateJobs.length})</Text></TouchableOpacity></View></View>}<View style={styles.controlGrid}><EstimateInput label="기본 원단 단가" unit="원/m" value={materialCostText} onChangeText={setMaterialCostText} /><EstimateInput label="기본 시공 단가" unit="원/m²" value={constructionCostText} onChangeText={setConstructionCostText} /></View>{groupRateEntries.length > 0 && <View style={styles.groupRates}><Text style={styles.controlLabel}>대그룹별 원단 단가</Text><Text style={styles.controlHint}>입력한 대그룹 단가가 해당 조각·병합롤에 적용됩니다. 조각별 수정값이 있으면 조각 단가가 우선합니다.</Text>{groupRateEntries.map((group) => <View key={group.id} style={styles.groupRateRow}><View style={styles.groupRateCopy}><Text style={styles.groupRateLabel}>{group.label}</Text><Text style={styles.groupRateMeta}>{group.jobCount}개 작업</Text></View><View style={styles.groupRateInputWrap}><TextInput accessibilityLabel={`${group.label} 원단 단가`} value={groupMaterialRateText[group.id] ?? ''} onChangeText={(value) => setGroupMaterialRateText((current) => ({ ...current, [group.id]: value.replace(/[^0-9]/g, '') }))} placeholder={String(materialCost)} keyboardType="numeric" style={styles.groupRateInput} /><Text style={styles.unit}>원/m</Text></View></View>)}</View>}<PricePresetRow value={constructionCost} onChange={setConstructionCostText} /><View style={styles.overrideRow}><View style={styles.discountCopy}><Text style={styles.controlLabel}>전체 단가 덮어쓰기</Text><Text style={styles.controlHint}>{globalRateOverride ? '입력한 기본 단가를 모든 그룹에 적용합니다.' : '그룹별 개별 단가를 우선 적용합니다.'}</Text></View><Switch accessibilityLabel="전체 단가 덮어쓰기" value={globalRateOverride} onValueChange={setGlobalRateOverride} /></View><View style={styles.discountRow}><View style={styles.discountCopy}><Text style={styles.controlLabel}>할인 적용</Text><Text style={styles.controlHint}>{discountEnabled ? '입력한 할인율을 적용합니다.' : '면적 기준 자동 할인을 적용합니다.'}</Text></View><Switch accessibilityLabel="할인 적용" value={discountEnabled} onValueChange={setDiscountEnabled} /><TextInput accessibilityLabel="할인율 퍼센트" editable={discountEnabled} value={discountText} onChangeText={(value) => setDiscountText(value.replace(/[^0-9.]/g, ''))} placeholder="0" keyboardType="numeric" style={[styles.discountInput, !discountEnabled && styles.disabledInput]} /><Text style={styles.percent}>%</Text></View><View style={projectStyles.estimateActions}><TouchableOpacity accessibilityRole="button" disabled={!hasEstimate} onPress={() => void exportEstimatePdf()} style={[styles.pdfButton, !hasEstimate && styles.disabledButton]}><Text style={styles.pdfButtonText}>통합 견적 PDF·인쇄</Text></TouchableOpacity><TouchableOpacity accessibilityRole="button" disabled={!hasEstimate} onPress={() => void copyEstimate()} style={[projectStyles.copyButton, !hasEstimate && styles.disabledButton]}><Text style={projectStyles.copyButtonText}>견적 요약 복사</Text></TouchableOpacity></View></View>{estimatePanels.showProjectSummary ? <><ProjectEstimateSummary estimate={projectEstimate} jobCount={projectEstimate.jobCount} company={company} /><ProjectEstimateBreakdown estimate={projectEstimate} rateOverrides={rateOverrides} globalRateOverride={globalRateOverride} onRateChange={(jobId, key, value) => setRateOverrides((current) => ({ ...current, [jobId]: { ...current[jobId], [key]: value === '' ? undefined : Math.max(0, Number(value)) } }))} onRateReset={(jobId) => setRateOverrides((current) => { const next = { ...current }; delete next[jobId]; return next; })} /></> : <View style={styles.emptyCard}><Text style={styles.emptyTitle}>견적 대상 작업이 없습니다.</Text><Text style={styles.emptyDescription}>저장 프로젝트를 만들거나 재단 계산 탭에서 유효한 그룹·조각을 입력해 주세요.</Text></View>}</>}
  </ScrollView>;
}

function ProjectEstimateSummary({ estimate, jobCount, company }: { estimate: ProjectEstimate; jobCount: number; company: CompanyInfo }) {
  return <View style={projectStyles.card}><Text style={projectStyles.eyebrow}>AUTO ESTIMATE · PROJECT TOTAL</Text><Text style={projectStyles.title}>{company.companyName || '프로젝트 통합 견적'}</Text><Text style={projectStyles.meta}>입력 조각 {estimate.inputPieceCount.toLocaleString('ko-KR')}개 · 견적 항목 {jobCount}개 · 원단 {estimate.materialLengthM.toLocaleString('ko-KR', { maximumFractionDigits: 2 })}m · 사용 면적 {estimate.materialAreaM2.toLocaleString('ko-KR', { maximumFractionDigits: 3 })}m²</Text><Text style={projectStyles.total}>{estimate.total.toLocaleString('ko-KR')}원</Text><View style={projectStyles.rows}><View style={projectStyles.row}><Text style={projectStyles.label}>원단 비용</Text><Text style={projectStyles.value}>{estimate.materialCost.toLocaleString('ko-KR')}원</Text></View><View style={projectStyles.row}><Text style={projectStyles.label}>시공 비용</Text><Text style={projectStyles.value}>{estimate.constructionCost.toLocaleString('ko-KR')}원</Text></View><View style={projectStyles.row}><Text style={projectStyles.label}>시공비 범위</Text><Text style={projectStyles.value}>{estimate.constructionCostRange.min.toLocaleString('ko-KR')}~{estimate.constructionCostRange.max.toLocaleString('ko-KR')}원</Text></View><View style={projectStyles.row}><Text style={projectStyles.label}>최종 견적 범위</Text><Text style={projectStyles.value}>{estimate.totalRange.min.toLocaleString('ko-KR')}~{estimate.totalRange.max.toLocaleString('ko-KR')}원</Text></View><View style={projectStyles.row}><Text style={projectStyles.label}>할인</Text><Text style={projectStyles.value}>-{estimate.discount.toLocaleString('ko-KR')}원 ({Math.round(estimate.discountRate * 100)}%)</Text></View></View></View>;
}

function ProjectEstimateBreakdown({ estimate, rateOverrides, globalRateOverride, onRateChange, onRateReset }: { estimate: ProjectEstimate; rateOverrides: RateOverrides; globalRateOverride: boolean; onRateChange(jobId: string, key: 'materialCostPerM' | 'constructionCostPerM2', value: string): void; onRateReset(jobId: string): void }) {
  const rows = [
    ...estimate.jobs.map(({ job, estimate: detail, rates }) => ({ id: job.id, job, name: job.name, product: `${job.brand}${job.productNumber ? ` · ${job.productNumber}` : ''}`, detail, rates, sourceDetails: undefined })),
    ...estimate.mergedJobs.map(({ job, estimate: detail, rates, sourceDetails }) => ({ id: job.id, job: undefined, name: job.name, product: `병합 ${job.mergeGroupId}`, detail, rates, sourceDetails })),
  ];
  const pieceMeta = (job: SavedCuttingJob) => `입력 ${job.input.quantity.toLocaleString('ko-KR')}개 · ${job.input.pieceWidthMm.toLocaleString('ko-KR')}×${job.input.pieceLengthMm.toLocaleString('ko-KR')}mm`;
  const difficultyMeta = (job: SavedCuttingJob) => {
    if (job.difficulty === undefined) return '난이도 기본';
    const difficulty = normalizeDifficulty(job.difficulty);
    const pricing = DIFFICULTY_PRICING[difficulty];
    return `난이도 ${pricing.label} · 기준 ${pricing.min.toLocaleString('ko-KR')}~${pricing.max.toLocaleString('ko-KR')}원/m²`;
  };
  return <View style={projectStyles.breakdown}><Text style={projectStyles.breakdownTitle}>작업별 견적 내역</Text><Text style={projectStyles.breakdownHint}>소그룹별 난이도 기준과 단가를 확인하고 필요한 항목만 수정할 수 있습니다.</Text>{rows.map((row) => <View key={row.id}><View style={projectStyles.breakdownRow}><View style={projectStyles.breakdownCopy}><Text style={projectStyles.breakdownName}>{row.name}</Text><Text style={projectStyles.breakdownMeta}>{row.product} · {row.job ? pieceMeta(row.job) : '병합 롤'} · {row.detail.materialLengthM.toLocaleString('ko-KR', { maximumFractionDigits: 2 })}m · {row.detail.materialAreaM2.toLocaleString('ko-KR', { maximumFractionDigits: 3 })}m²</Text>{row.sourceDetails ? <Text style={projectStyles.breakdownMeta}>그룹·조각 {row.sourceDetails.length}개 · 입력 {row.sourceDetails.reduce((sum, source) => sum + source.job.input.quantity, 0).toLocaleString('ko-KR')}개</Text> : null}<Text style={projectStyles.breakdownRate}>{row.job ? `${difficultyMeta(row.job)} · ` : ''}원단 {row.rates.materialCostPerM.toLocaleString('ko-KR')}원/m · 시공 {row.rates.constructionCostPerM2.toLocaleString('ko-KR')}원/m²{row.rates.mixed ? ' · 혼합 단가' : ''}</Text></View><View><Text style={projectStyles.breakdownCost}>원단 {row.detail.materialCost.toLocaleString('ko-KR')}원</Text><Text style={projectStyles.breakdownCost}>시공 {row.detail.constructionCost.toLocaleString('ko-KR')}원</Text></View></View>{row.sourceDetails ? <View style={projectStyles.rateEditorWrap}>{row.sourceDetails.map((source) => <View key={`${row.id}-${source.job.id}`} style={projectStyles.sourceRow}><View style={projectStyles.breakdownCopy}><Text style={projectStyles.sourceTitle}>↳ {source.job.name}</Text><Text style={projectStyles.breakdownMeta}>{pieceMeta(source.job)} · {difficultyMeta(source.job)} · 배분 길이 {source.estimate.materialLengthM.toLocaleString('ko-KR', { maximumFractionDigits: 2 })}m</Text><RateEditor job={source.job} rates={source.rates} disabled={globalRateOverride} hasOverride={Boolean(rateOverrides[source.job.id])} onChange={onRateChange} onReset={onRateReset} /></View><View><Text style={projectStyles.breakdownCost}>소계 {source.estimate.subtotal.toLocaleString('ko-KR')}원</Text></View></View>)}</View> : row.job ? <RateEditor job={row.job} rates={row.rates} disabled={globalRateOverride} hasOverride={Boolean(rateOverrides[row.job.id])} onChange={onRateChange} onReset={onRateReset} /> : null}</View>)}</View>;
}

function RateEditor({ job, rates, disabled, hasOverride, onChange, onReset }: { job: SavedCuttingJob; rates: { materialCostPerM: number; constructionCostPerM2: number }; disabled: boolean; hasOverride: boolean; onChange(jobId: string, key: 'materialCostPerM' | 'constructionCostPerM2', value: string): void; onReset(jobId: string): void }) {
  return <View style={projectStyles.rateEditor}><View style={projectStyles.rateField}><Text style={projectStyles.rateLabel}>원단 단가</Text><TextInput accessibilityLabel={`${job.name} 원단 단가`} editable={!disabled} keyboardType="numeric" value={String(rates.materialCostPerM)} onChangeText={(value) => onChange(job.id, 'materialCostPerM', value.replace(/[^0-9]/g, ''))} style={[projectStyles.rateInput, disabled && projectStyles.rateInputDisabled]} /><Text style={projectStyles.rateUnit}>원/m</Text></View><View style={projectStyles.rateField}><Text style={projectStyles.rateLabel}>시공 단가</Text><TextInput accessibilityLabel={`${job.name} 시공 단가`} editable={!disabled} keyboardType="numeric" value={String(rates.constructionCostPerM2)} onChangeText={(value) => onChange(job.id, 'constructionCostPerM2', value.replace(/[^0-9]/g, ''))} style={[projectStyles.rateInput, disabled && projectStyles.rateInputDisabled]} /><Text style={projectStyles.rateUnit}>원/m²</Text></View>{hasOverride && <TouchableOpacity accessibilityRole="button" accessibilityLabel={`${job.name} 기본 단가 복원`} onPress={() => onReset(job.id)} style={projectStyles.resetRate}><Text style={projectStyles.resetRateText}>기본값</Text></TouchableOpacity>}</View>;
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
  card: { marginTop: 18, padding: 18, borderRadius: 16, backgroundColor: '#0f172a' }, eyebrow: { fontSize: 10, letterSpacing: 1.4, fontWeight: '800', color: '#93c5fd' }, title: { marginTop: 5, fontSize: 20, fontWeight: '800', color: '#fff' }, meta: { marginTop: 4, fontSize: 11, color: '#cbd5e1' }, total: { marginTop: 14, fontSize: 28, fontWeight: '900', color: '#bfdbfe' }, rows: { gap: 7, marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#334155' }, row: { flexDirection: 'row', justifyContent: 'space-between' }, label: { fontSize: 11, color: '#cbd5e1' }, value: { fontSize: 11, fontWeight: '800', color: '#f8fafc' }, breakdown: { marginTop: 14, padding: 16, borderRadius: 16, borderWidth: 1, borderColor: '#e2e8f0', backgroundColor: '#fff' }, breakdownTitle: { fontSize: 14, fontWeight: '800', color: '#1e293b' }, breakdownHint: { marginTop: 4, marginBottom: 4, fontSize: 10, color: '#64748b' }, rateEditorWrap: { marginLeft: 0 }, rateEditor: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginTop: 7 }, rateField: { flexDirection: 'row', alignItems: 'center', gap: 3 }, rateLabel: { fontSize: 9, color: '#64748b' }, rateInput: { width: 70, height: 30, paddingHorizontal: 5, borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 6, backgroundColor: '#fff', color: '#0f172a', fontSize: 10, textAlign: 'right' }, rateInputDisabled: { opacity: 0.45, backgroundColor: '#f1f5f9' }, rateUnit: { fontSize: 8, color: '#64748b' }, resetRate: { minHeight: 28, justifyContent: 'center', paddingHorizontal: 7, borderRadius: 6, backgroundColor: '#eff6ff' }, resetRateText: { fontSize: 9, fontWeight: '700', color: '#1d4ed8' }, breakdownRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' }, sourceRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 10, paddingVertical: 8, paddingLeft: 10, borderBottomWidth: 1, borderBottomColor: '#f1f5f9', backgroundColor: '#f8fafc' }, breakdownCopy: { flex: 1 }, breakdownName: { fontSize: 12, fontWeight: '800', color: '#334155' }, sourceTitle: { fontSize: 11, fontWeight: '800', color: '#475569' }, breakdownMeta: { marginTop: 3, fontSize: 10, color: '#64748b' }, breakdownRate: { marginTop: 3, fontSize: 10, color: '#1d4ed8' }, breakdownCost: { fontSize: 10, fontWeight: '700', textAlign: 'right', color: '#334155' }, estimateActions: { flexDirection: 'row', gap: 8, marginTop: 14 }, copyButton: { minHeight: 42, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 13, borderRadius: 9, borderWidth: 1, borderColor: '#bfdbfe', backgroundColor: '#eff6ff' }, copyButtonText: { fontSize: 11, fontWeight: '800', color: '#1d4ed8' },
});

function EstimateInput({ label, unit, value, onChangeText }: { label: string; unit: string; value: string; onChangeText(value: string): void }) { return <View style={styles.control}><Text style={styles.controlLabel}>{label}</Text><View style={styles.controlInputWrap}><TextInput accessibilityLabel={label} value={value} onChangeText={(text) => onChangeText(text.replace(/[^0-9]/g, ''))} keyboardType="numeric" style={styles.controlInput} /><Text style={styles.unit}>{unit}</Text></View></View>; }
function positiveNumber(value: string, fallback: number): number { const parsed = Number(value); return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback; }
function majorGroupLabel(groupId: string): string {
  const numericId = groupId.match(/^group-(\d+)(?:-|$)/)?.[1];
  return numericId ? `대그룹 ID ${numericId}` : `대그룹 ${groupId}`;
}
function createEstimateHtml(estimate: ProjectEstimate, materialCost: number, constructionCost: number, company: CompanyInfo): string {
  const esc = (value: string) => value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char] ?? char));
  const companyLine = [company.companyName, company.managerName, company.phone, company.email, company.address].filter(Boolean).map(esc).join(' · ');
  const estimateRows = [...estimate.jobs.map(({ job, estimate: detail, rates }) => ({ name: job.name, product: `${job.brand}${job.productNumber ? ` · ${job.productNumber}` : ''}`, detail, rates, sourceDetails: undefined })), ...estimate.mergedJobs.map(({ job, estimate: detail, rates, sourceDetails }) => ({ name: job.name, product: `병합 ${job.mergeGroupId}`, detail, rates, sourceDetails }))];
  const rows = estimateRows.flatMap((row) => [
    `<tr><td>${esc(row.name)}</td><td>${esc(row.product)}</td><td>${row.rates.materialCostPerM.toLocaleString('ko-KR')}원/m</td><td>${row.rates.constructionCostPerM2.toLocaleString('ko-KR')}원/m²</td><td>${row.detail.materialLengthM.toLocaleString('ko-KR')}m</td><td>${row.detail.materialAreaM2.toLocaleString('ko-KR', { maximumFractionDigits: 3 })}m²</td><td>${row.detail.materialCost.toLocaleString('ko-KR')}원</td><td>${row.detail.constructionCost.toLocaleString('ko-KR')}원</td><td>${row.detail.subtotal.toLocaleString('ko-KR')}원</td></tr>`,
    ...(row.sourceDetails?.map((source) => `<tr><td>↳ ${esc(source.job.name)}</td><td>그룹별 배분</td><td>${source.rates.materialCostPerM.toLocaleString('ko-KR')}원/m</td><td>${source.rates.constructionCostPerM2.toLocaleString('ko-KR')}원/m²</td><td>${source.estimate.materialLengthM.toLocaleString('ko-KR')}m</td><td>${source.estimate.materialAreaM2.toLocaleString('ko-KR', { maximumFractionDigits: 3 })}m²</td><td>${source.estimate.materialCost.toLocaleString('ko-KR')}원</td><td>${source.estimate.constructionCost.toLocaleString('ko-KR')}원</td><td>${source.estimate.subtotal.toLocaleString('ko-KR')}원</td></tr>`) ?? []),
  ]).join('');
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>필름 통합 견적서</title><style>body{font-family:sans-serif;padding:24px;color:#111827}table{border-collapse:collapse;width:100%;margin-top:16px}th,td{border:1px solid #cbd5e1;padding:8px;text-align:left;font-size:12px}th{background:#f1f5f9}h1{margin-bottom:4px}.total{font-size:24px;font-weight:800;color:#1d4ed8}</style></head><body><h1>필름 통합 견적서</h1><p>${companyLine}</p><p class="total">총액 ${estimate.total.toLocaleString('ko-KR')}원</p><p>입력 조각 ${estimate.inputPieceCount.toLocaleString('ko-KR')}개 · 견적 항목 ${estimate.jobCount}개</p><table><thead><tr><th>작업</th><th>제품</th><th>원단 단가</th><th>시공 단가</th><th>길이</th><th>사용 면적</th><th>원단비</th><th>시공비</th><th>소계</th></tr></thead><tbody>${rows}</tbody></table><table><tbody><tr><th>입력 기본 원단 단가</th><td>${materialCost.toLocaleString('ko-KR')}원/m</td></tr><tr><th>입력 기본 시공 단가</th><td>${constructionCost.toLocaleString('ko-KR')}원/m²</td></tr><tr><th>원단 비용</th><td>${estimate.materialCost.toLocaleString('ko-KR')}원</td></tr><tr><th>시공 비용</th><td>${estimate.constructionCost.toLocaleString('ko-KR')}원</td></tr><tr><th>시공비 범위</th><td>${estimate.constructionCostRange.min.toLocaleString('ko-KR')}~${estimate.constructionCostRange.max.toLocaleString('ko-KR')}원</td></tr><tr><th>할인</th><td>${Math.round(estimate.discountRate * 100)}% · -${estimate.discount.toLocaleString('ko-KR')}원</td></tr><tr><th>소계</th><td>${estimate.subtotal.toLocaleString('ko-KR')}원</td></tr></tbody></table><p>${esc(company.note)}</p></body></html>`;
}
function createEstimateText(estimate: ProjectEstimate, company: CompanyInfo): string { const contact = [company.companyName, company.managerName, company.phone, company.email].filter(Boolean).join(' · '); const details = [...estimate.jobs.map(({ job, estimate: detail, rates }) => `- ${job.name}: 단가 원단 ${rates.materialCostPerM.toLocaleString('ko-KR')}원/m·시공 ${rates.constructionCostPerM2.toLocaleString('ko-KR')}원/m² · 원단 ${detail.materialLengthM.toFixed(2)}m/${detail.materialCost.toLocaleString('ko-KR')}원 · 시공 ${detail.constructionCost.toLocaleString('ko-KR')}원`), ...estimate.mergedJobs.map(({ job, estimate: detail, rates, sourceDetails }) => [`- ${job.name}: 혼합 단가 원단 ${rates.materialCostPerM.toLocaleString('ko-KR')}원/m·시공 ${rates.constructionCostPerM2.toLocaleString('ko-KR')}원/m² · 원단 ${detail.materialLengthM.toFixed(2)}m/${detail.materialCost.toLocaleString('ko-KR')}원 · 시공 ${detail.constructionCost.toLocaleString('ko-KR')}원`, ...(sourceDetails?.map((source) => `  · ${source.job.name}: 원단 ${source.rates.materialCostPerM.toLocaleString('ko-KR')}원/m · 시공 ${source.rates.constructionCostPerM2.toLocaleString('ko-KR')}원/m²`) ?? [])].join('\n'))].join('\n'); return `[필름 통합 견적서]\n${contact}\n\n입력 조각 ${estimate.inputPieceCount}개 · 작업 ${estimate.jobCount}건\n\n[작업별 내역]\n${details}\n\n원단 비용: ${estimate.materialCost.toLocaleString('ko-KR')}원\n시공 비용: ${estimate.constructionCost.toLocaleString('ko-KR')}원\n시공비 범위: ${estimate.constructionCostRange.min.toLocaleString('ko-KR')}~${estimate.constructionCostRange.max.toLocaleString('ko-KR')}원\n할인: -${estimate.discount.toLocaleString('ko-KR')}원\n총액: ${estimate.total.toLocaleString('ko-KR')}원${company.note ? `\n\n${company.note}` : ''}`; }
