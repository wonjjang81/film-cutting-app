import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform, ScrollView, StyleSheet, Switch, Text, TextInput, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as Clipboard from 'expo-clipboard';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { createAppLibraryRepository } from '../../src/features/library/libraryRepositoryFactory';
import type { SavedCuttingJob, SavedMergedCuttingJob } from '../../src/features/library/models';
import { CONSTRUCTION_PRICE_MAX, CONSTRUCTION_PRICE_MIN, DEFAULT_CONSTRUCTION_COST_PER_M2, DEFAULT_MATERIAL_COST_PER_M } from '../../src/features/estimate/calculateEstimate';
import { calculateProjectEstimate, type ProjectEstimate } from '../../src/features/estimate/calculateProjectEstimate';
import { createDirectEstimateJob, DIRECT_ESTIMATE_INPUT_STORAGE_KEY, DIRECT_ESTIMATE_ROLL_WIDTH_MM, parseDirectEstimateInput } from '../../src/features/estimate/directEstimate';
import { getEstimatePanelVisibility } from '../../src/features/estimate/estimateScreenModel';
import { COMPANY_INFO_STORAGE_KEY, emptyCompanyInfo, LEGACY_COMPANY_NAME_STORAGE_KEY, parseCompanyInfo, type CompanyInfo } from '../../src/features/settings/companyInfo';

const repository = createAppLibraryRepository();

export default function EstimateScreen() {
  const { width } = useWindowDimensions();
  const [jobs, setJobs] = useState<SavedCuttingJob[]>([]);
  const [mergedJobs, setMergedJobs] = useState<SavedMergedCuttingJob[]>([]);
  const [company, setCompany] = useState<CompanyInfo>(emptyCompanyInfo);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [materialCostText, setMaterialCostText] = useState(String(DEFAULT_MATERIAL_COST_PER_M));
  const [constructionCostText, setConstructionCostText] = useState(String(DEFAULT_CONSTRUCTION_COST_PER_M2));
  const [discountEnabled, setDiscountEnabled] = useState(false);
  const [discountText, setDiscountText] = useState('');
  const [pieceWidthText, setPieceWidthText] = useState('0');
  const [pieceLengthText, setPieceLengthText] = useState('0');
  const [quantityText, setQuantityText] = useState('1');
  const hasFocusedOnce = useRef(false);

  const loadRecentDirectInput = useCallback(async () => {
    const raw = await AsyncStorage.getItem(DIRECT_ESTIMATE_INPUT_STORAGE_KEY);
    const recent = parseDirectEstimateInput(raw);
    if (!recent) return;
    setPieceWidthText(String(recent.pieceWidthMm)); setPieceLengthText(String(recent.pieceLengthMm)); setQuantityText(String(recent.quantity));
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const loaded = await repository.load();
      const nextJob = loaded.document.jobs[0] ?? null;
      setJobs(loaded.document.jobs);
      setMergedJobs(loaded.document.mergedJobs);
      const companyRaw = await AsyncStorage.getItem(COMPANY_INFO_STORAGE_KEY); const legacyCompany = companyRaw ? null : await AsyncStorage.getItem(LEGACY_COMPANY_NAME_STORAGE_KEY); setCompany(parseCompanyInfo(companyRaw ?? (legacyCompany ? JSON.stringify(legacyCompany) : null)));
      setMaterialCostText(String(nextJob?.materialCostPerM ?? DEFAULT_MATERIAL_COST_PER_M)); setConstructionCostText(String(nextJob?.constructionCostPerM2 ?? DEFAULT_CONSTRUCTION_COST_PER_M2)); setDiscountEnabled(false); setDiscountText('');
      if (loaded.warnings.length > 0) setError(loaded.warnings.join(' '));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '저장된 프로젝트를 불러오지 못했습니다.');
    } finally { setLoading(false); }
  }, []);
  const materialCost = positiveNumber(materialCostText, DEFAULT_MATERIAL_COST_PER_M);
  const constructionCost = positiveNumber(constructionCostText, DEFAULT_CONSTRUCTION_COST_PER_M2);
  const discountOverride = discountEnabled ? Math.min(100, Math.max(0, Number(discountText) || 0)) / 100 : 0;
  const directEstimateJob = useMemo(() => {
    const pieceWidthMm = Number(pieceWidthText);
    const pieceLengthMm = Number(pieceLengthText);
    const quantity = Number(quantityText);
    if (!Number.isFinite(pieceWidthMm) || !Number.isFinite(pieceLengthMm) || !Number.isFinite(quantity) || pieceWidthMm <= 0 || pieceLengthMm <= 0 || quantity <= 0 || !Number.isInteger(quantity)) return null;
    try { return createDirectEstimateJob({ pieceWidthMm, pieceLengthMm, quantity }); } catch { return null; }
  }, [pieceLengthText, pieceWidthText, quantityText]);
  const estimateJobs = jobs.length > 0 ? jobs : directEstimateJob ? [directEstimateJob] : [];
  const estimateMergedJobs = jobs.length > 0 ? mergedJobs : [];
  const projectEstimate = calculateProjectEstimate(estimateJobs, materialCost, constructionCost, discountOverride, estimateMergedJobs);
  const estimatePanels = getEstimatePanelVisibility(jobs.length > 0, Boolean(directEstimateJob));
  const hasSavedProject = jobs.length > 0;
  const exportEstimatePdf = async () => {
    if (estimateJobs.length === 0) return;
    const html = createEstimateHtml(projectEstimate, materialCost, constructionCost, company);
    if (Platform.OS === 'web') await Print.printAsync({ html });
    else { const file = await Print.printToFileAsync({ html }); if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(file.uri, { mimeType: 'application/pdf', dialogTitle: '견적서 PDF 공유' }); }
  };
  const copyEstimate = async () => { if (estimateJobs.length === 0) return; await Clipboard.setStringAsync(createEstimateText(projectEstimate, company)); };
  // Deep links on web can render before Expo Router emits its first focus event.
  // Load on mount as well so a direct /estimate visit never remains in a spinner.
  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => { void loadRecentDirectInput().catch(() => undefined); }, [loadRecentDirectInput]);
  useFocusEffect(useCallback(() => {
    if (hasFocusedOnce.current) { void refresh(); void loadRecentDirectInput().catch(() => undefined); }
    hasFocusedOnce.current = true;
  }, [loadRecentDirectInput, refresh]));

  return <ScrollView style={styles.page} contentContainerStyle={[styles.content, width < 420 && styles.contentSmall]}>
    <View style={styles.header}><View><Text style={styles.eyebrow}>ESTIMATE WORKSPACE</Text><Text style={styles.title}>자동 견적</Text><Text style={styles.description}>최근 저장된 프로젝트의 원단·시공 비용을 자동 계산합니다.</Text></View><TouchableOpacity accessibilityRole="button" accessibilityLabel="견적 새로고침" onPress={() => void refresh()} style={styles.refresh}><Text style={styles.refreshText}>새로고침</Text></TouchableOpacity></View>
    {error && <Text style={styles.error}>{error}</Text>}
    {loading ? <Text style={styles.empty}>견적을 불러오는 중입니다…</Text> : <><View style={styles.directCard}><View style={styles.directHeader}><View><Text style={styles.directEyebrow}>QUICK ESTIMATE</Text><Text style={styles.directTitle}>프로젝트 없이 자동견적</Text><Text style={styles.directDescription}>재단 규격만 입력하면 저장 없이 원단 사용량과 견적을 바로 계산합니다.</Text></View><Text style={styles.rollBadge}>원본롤 폭 {DIRECT_ESTIMATE_ROLL_WIDTH_MM.toLocaleString()}mm</Text></View><View style={styles.controlGrid}><EstimateInput label="재단 폭" unit="mm" value={pieceWidthText} onChangeText={setPieceWidthText} /><EstimateInput label="재단 길이" unit="mm" value={pieceLengthText} onChangeText={setPieceLengthText} /><EstimateInput label="필요 수량" unit="개" value={quantityText} onChangeText={setQuantityText} /></View><Text style={styles.directHint}>{directEstimateJob ? '입력값이 변경되면 자동으로 다시 계산됩니다.' : '재단 폭과 길이를 0보다 크게 입력하면 자동 계산됩니다.'}</Text></View><View style={styles.controls}><Text style={styles.controlsTitle}>{hasSavedProject ? '프로젝트 견적 조건' : '견적 조건'}</Text><View style={styles.controlGrid}><EstimateInput label="원단 단가" unit="원/m" value={materialCostText} onChangeText={setMaterialCostText} /><EstimateInput label="시공 단가" unit="원/m²" value={constructionCostText} onChangeText={setConstructionCostText} /></View><PricePresetRow value={constructionCost} onChange={setConstructionCostText} /><View style={styles.discountRow}><View style={styles.discountCopy}><Text style={styles.controlLabel}>할인 적용</Text><Text style={styles.controlHint}>{discountEnabled ? '입력한 할인율을 적용합니다.' : '할인 미적용 상태입니다.'}</Text></View><Switch accessibilityLabel="할인 적용" value={discountEnabled} onValueChange={setDiscountEnabled} /><TextInput accessibilityLabel="할인율 퍼센트" editable={discountEnabled} value={discountText} onChangeText={(value) => setDiscountText(value.replace(/[^0-9.]/g, ''))} placeholder="0" keyboardType="numeric" style={[styles.discountInput, !discountEnabled && styles.disabledInput]} /><Text style={styles.percent}>%</Text></View><View style={projectStyles.estimateActions}><TouchableOpacity accessibilityRole="button" disabled={estimateJobs.length === 0} onPress={() => void exportEstimatePdf()} style={[styles.pdfButton, estimateJobs.length === 0 && styles.disabledButton]}><Text style={styles.pdfButtonText}>통합 견적 PDF·인쇄</Text></TouchableOpacity><TouchableOpacity accessibilityRole="button" disabled={estimateJobs.length === 0} onPress={() => void copyEstimate()} style={[projectStyles.copyButton, estimateJobs.length === 0 && styles.disabledButton]}><Text style={projectStyles.copyButtonText}>견적 요약 복사</Text></TouchableOpacity></View></View>{estimatePanels.showProjectSummary ? <><ProjectEstimateSummary estimate={projectEstimate} jobCount={projectEstimate.jobCount} company={company} /><ProjectEstimateBreakdown estimate={projectEstimate} /></> : <View style={styles.emptyCard}><Text style={styles.emptyTitle}>견적을 계산할 규격을 입력해 주세요.</Text><Text style={styles.emptyDescription}>저장된 프로젝트가 없어도 위의 재단 폭·길이·수량만 입력하면 자동견적을 확인할 수 있습니다.</Text></View>}</>}
  </ScrollView>;
}

function ProjectEstimateSummary({ estimate, jobCount, company }: { estimate: ProjectEstimate; jobCount: number; company: CompanyInfo }) {
  return <View style={projectStyles.card}><Text style={projectStyles.eyebrow}>AUTO ESTIMATE · PROJECT TOTAL</Text><Text style={projectStyles.title}>{company.companyName || '프로젝트 통합 견적'}</Text><Text style={projectStyles.meta}>{jobCount}개 생산 단위 · 원단 {estimate.materialLengthM.toLocaleString('ko-KR', { maximumFractionDigits: 2 })}m · 사용 면적 {estimate.materialAreaM2.toLocaleString('ko-KR', { maximumFractionDigits: 3 })}m²</Text><Text style={projectStyles.total}>{estimate.total.toLocaleString('ko-KR')}원</Text><View style={projectStyles.rows}><View style={projectStyles.row}><Text style={projectStyles.label}>원단 비용</Text><Text style={projectStyles.value}>{estimate.materialCost.toLocaleString('ko-KR')}원</Text></View><View style={projectStyles.row}><Text style={projectStyles.label}>시공 비용</Text><Text style={projectStyles.value}>{estimate.constructionCost.toLocaleString('ko-KR')}원</Text></View><View style={projectStyles.row}><Text style={projectStyles.label}>시공비 범위</Text><Text style={projectStyles.value}>{estimate.constructionCostRange.min.toLocaleString('ko-KR')}~{estimate.constructionCostRange.max.toLocaleString('ko-KR')}원</Text></View><View style={projectStyles.row}><Text style={projectStyles.label}>최종 견적 범위</Text><Text style={projectStyles.value}>{estimate.totalRange.min.toLocaleString('ko-KR')}~{estimate.totalRange.max.toLocaleString('ko-KR')}원</Text></View><View style={projectStyles.row}><Text style={projectStyles.label}>할인</Text><Text style={projectStyles.value}>-{estimate.discount.toLocaleString('ko-KR')}원 ({Math.round(estimate.discountRate * 100)}%)</Text></View></View></View>;
}

function ProjectEstimateBreakdown({ estimate }: { estimate: ProjectEstimate }) {
  const rows = [
    ...estimate.jobs.map(({ job, estimate: detail }) => ({ id: job.id, name: job.name, product: `${job.brand}${job.productNumber ? ` · ${job.productNumber}` : ''}`, detail })),
    ...estimate.mergedJobs.map(({ job, estimate: detail }) => ({ id: job.id, name: job.name, product: `병합 ${job.mergeGroupId}`, detail })),
  ];
  return <View style={projectStyles.breakdown}><Text style={projectStyles.breakdownTitle}>작업별 견적 내역</Text>{rows.map((row) => <View key={row.id} style={projectStyles.breakdownRow}><View style={projectStyles.breakdownCopy}><Text style={projectStyles.breakdownName}>{row.name}</Text><Text style={projectStyles.breakdownMeta}>{row.product} · {row.detail.materialLengthM.toLocaleString('ko-KR', { maximumFractionDigits: 2 })}m · {row.detail.materialAreaM2.toLocaleString('ko-KR', { maximumFractionDigits: 3 })}m²</Text></View><View><Text style={projectStyles.breakdownCost}>원단 {row.detail.materialCost.toLocaleString('ko-KR')}원</Text><Text style={projectStyles.breakdownCost}>시공 {row.detail.constructionCost.toLocaleString('ko-KR')}원</Text></View></View>)}</View>;
}

function PricePresetRow({ value, onChange }: { value: number; onChange(value: string): void }) {
  const presets = [{ label: '최저', value: CONSTRUCTION_PRICE_MIN }, { label: '기본', value: DEFAULT_CONSTRUCTION_COST_PER_M2 }, { label: '최고', value: CONSTRUCTION_PRICE_MAX }];
  return <View style={styles.pricePresetRow}>{presets.map((preset) => <TouchableOpacity key={preset.label} accessibilityRole="button" accessibilityLabel={`시공 단가 ${preset.label}`} onPress={() => onChange(String(preset.value))} style={[styles.pricePreset, value === preset.value && styles.pricePresetActive]}><Text style={[styles.pricePresetLabel, value === preset.value && styles.pricePresetLabelActive]}>{preset.label}</Text><Text style={[styles.pricePresetValue, value === preset.value && styles.pricePresetLabelActive]}>{preset.value.toLocaleString('ko-KR')}원</Text></TouchableOpacity>)}</View>;
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#f1f5f9' }, content: { width: '100%', maxWidth: 980, alignSelf: 'center', paddingHorizontal: 20, paddingTop: 32, paddingBottom: 72 }, contentSmall: { paddingHorizontal: 12, paddingTop: 20 },
  header: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-end', justifyContent: 'space-between', gap: 14, marginBottom: 18 }, eyebrow: { fontSize: 11, letterSpacing: 1.8, fontWeight: '800', color: '#2563eb' }, title: { marginTop: 6, fontSize: 32, lineHeight: 40, fontWeight: '800', color: '#0f172a' }, description: { marginTop: 7, fontSize: 14, lineHeight: 21, color: '#64748b' }, refresh: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 15, borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 10, backgroundColor: '#fff' }, refreshText: { fontSize: 12, fontWeight: '800', color: '#334155' }, error: { marginBottom: 16, padding: 13, borderRadius: 10, borderWidth: 1, borderColor: '#fecaca', color: '#991b1b', backgroundColor: '#fff1f2' }, controls: { padding: 17, borderRadius: 16, backgroundColor: '#fff', borderWidth: 1, borderColor: '#e2e8f0' }, controlsTitle: { fontSize: 15, fontWeight: '800', color: '#1e293b' }, controlGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 12 }, control: { minWidth: 180, flex: 1 }, controlLabel: { marginBottom: 6, fontSize: 11, fontWeight: '700', color: '#475569' }, controlInputWrap: { flexDirection: 'row', alignItems: 'center', minHeight: 42, borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 9, backgroundColor: '#f8fafc' }, controlInput: { flex: 1, minHeight: 40, paddingHorizontal: 10, fontSize: 14, fontWeight: '700', color: '#0f172a' }, unit: { paddingRight: 10, fontSize: 10, color: '#64748b' }, pricePresetRow: { flexDirection: 'row', gap: 8, marginTop: 12 }, pricePreset: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 9, borderWidth: 1, borderColor: '#cbd5e1', backgroundColor: '#f8fafc' }, pricePresetActive: { borderColor: '#2563eb', backgroundColor: '#eff6ff' }, pricePresetLabel: { fontSize: 10, color: '#64748b' }, pricePresetLabelActive: { color: '#1d4ed8', fontWeight: '800' }, pricePresetValue: { marginTop: 2, fontSize: 11, fontWeight: '700', color: '#334155' }, discountRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 14 }, discountCopy: { flex: 1 }, controlHint: { marginTop: 3, fontSize: 10, color: '#64748b' }, discountInput: { width: 62, height: 40, paddingHorizontal: 8, borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 8, textAlign: 'center', color: '#0f172a' }, disabledInput: { opacity: 0.4, backgroundColor: '#f1f5f9' }, percent: { fontSize: 12, color: '#64748b' }, pdfButton: { minHeight: 42, alignItems: 'center', justifyContent: 'center', marginTop: 14, borderRadius: 9, backgroundColor: '#1e3a8a' }, pdfButtonText: { fontSize: 12, fontWeight: '800', color: '#fff' }, empty: { paddingVertical: 30, textAlign: 'center', color: '#64748b' }, emptyCard: { marginTop: 12, padding: 24, borderRadius: 18, borderWidth: 1, borderColor: '#e2e8f0', backgroundColor: '#fff' }, emptyTitle: { fontSize: 17, fontWeight: '800', color: '#1e293b' }, emptyDescription: { marginTop: 8, fontSize: 13, lineHeight: 20, color: '#64748b' },
  directCard: { marginBottom: 14, padding: 17, borderRadius: 16, borderWidth: 1, borderColor: '#bfdbfe', backgroundColor: '#eff6ff' }, directHeader: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }, directEyebrow: { fontSize: 10, letterSpacing: 1.3, fontWeight: '800', color: '#2563eb' }, directTitle: { marginTop: 4, fontSize: 18, fontWeight: '800', color: '#1e3a8a' }, directDescription: { marginTop: 5, fontSize: 11, lineHeight: 17, color: '#1d4ed8' }, rollBadge: { paddingHorizontal: 9, paddingVertical: 6, borderRadius: 999, backgroundColor: '#dbeafe', fontSize: 10, fontWeight: '800', color: '#1d4ed8' }, directHint: { marginTop: 10, fontSize: 10, color: '#1e40af' }, disabledButton: { opacity: 0.45 },
});

const projectStyles = StyleSheet.create({
  card: { marginTop: 18, padding: 18, borderRadius: 16, backgroundColor: '#0f172a' }, eyebrow: { fontSize: 10, letterSpacing: 1.4, fontWeight: '800', color: '#93c5fd' }, title: { marginTop: 5, fontSize: 20, fontWeight: '800', color: '#fff' }, meta: { marginTop: 4, fontSize: 11, color: '#cbd5e1' }, total: { marginTop: 14, fontSize: 28, fontWeight: '900', color: '#bfdbfe' }, rows: { gap: 7, marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#334155' }, row: { flexDirection: 'row', justifyContent: 'space-between' }, label: { fontSize: 11, color: '#cbd5e1' }, value: { fontSize: 11, fontWeight: '800', color: '#f8fafc' }, breakdown: { marginTop: 14, padding: 16, borderRadius: 16, borderWidth: 1, borderColor: '#e2e8f0', backgroundColor: '#fff' }, breakdownTitle: { fontSize: 14, fontWeight: '800', color: '#1e293b' }, breakdownRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' }, breakdownCopy: { flex: 1 }, breakdownName: { fontSize: 12, fontWeight: '800', color: '#334155' }, breakdownMeta: { marginTop: 3, fontSize: 10, color: '#64748b' }, breakdownCost: { fontSize: 10, fontWeight: '700', textAlign: 'right', color: '#334155' }, estimateActions: { flexDirection: 'row', gap: 8, marginTop: 14 }, copyButton: { minHeight: 42, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 13, borderRadius: 9, borderWidth: 1, borderColor: '#bfdbfe', backgroundColor: '#eff6ff' }, copyButtonText: { fontSize: 11, fontWeight: '800', color: '#1d4ed8' },
});

function EstimateInput({ label, unit, value, onChangeText }: { label: string; unit: string; value: string; onChangeText(value: string): void }) { return <View style={styles.control}><Text style={styles.controlLabel}>{label}</Text><View style={styles.controlInputWrap}><TextInput accessibilityLabel={label} value={value} onChangeText={(text) => onChangeText(text.replace(/[^0-9]/g, ''))} keyboardType="numeric" style={styles.controlInput} /><Text style={styles.unit}>{unit}</Text></View></View>; }
function positiveNumber(value: string, fallback: number): number { const parsed = Number(value); return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback; }
function createEstimateHtml(estimate: ProjectEstimate, materialCost: number, constructionCost: number, company: CompanyInfo): string {
  const esc = (value: string) => value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char] ?? char));
  const companyLine = [company.companyName, company.managerName, company.phone, company.email, company.address].filter(Boolean).map(esc).join(' · ');
  const rows = [...estimate.jobs.map(({ job, estimate: detail }) => ({ name: job.name, product: `${job.brand}${job.productNumber ? ` · ${job.productNumber}` : ''}`, detail })), ...estimate.mergedJobs.map(({ job, estimate: detail }) => ({ name: job.name, product: `병합 ${job.mergeGroupId}`, detail }))].map((row) => `<tr><td>${esc(row.name)}</td><td>${esc(row.product)}</td><td>${row.detail.materialLengthM.toLocaleString('ko-KR')}m</td><td>${row.detail.materialAreaM2.toLocaleString('ko-KR', { maximumFractionDigits: 3 })}m²</td><td>${row.detail.materialCost.toLocaleString('ko-KR')}원</td><td>${row.detail.constructionCost.toLocaleString('ko-KR')}원</td><td>${row.detail.subtotal.toLocaleString('ko-KR')}원</td></tr>`).join('');
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>필름 통합 견적서</title><style>body{font-family:sans-serif;padding:24px;color:#111827}table{border-collapse:collapse;width:100%;margin-top:16px}th,td{border:1px solid #cbd5e1;padding:8px;text-align:left;font-size:12px}th{background:#f1f5f9}h1{margin-bottom:4px}.total{font-size:24px;font-weight:800;color:#1d4ed8}</style></head><body><h1>필름 통합 견적서</h1><p>${companyLine}</p><p class="total">총액 ${estimate.total.toLocaleString('ko-KR')}원</p><table><thead><tr><th>작업</th><th>제품</th><th>길이</th><th>사용 면적</th><th>원단비</th><th>시공비</th><th>소계</th></tr></thead><tbody>${rows}</tbody></table><table><tbody><tr><th>원단 단가</th><td>${materialCost.toLocaleString('ko-KR')}원/m</td></tr><tr><th>시공 단가</th><td>${constructionCost.toLocaleString('ko-KR')}원/m²</td></tr><tr><th>원단 비용</th><td>${estimate.materialCost.toLocaleString('ko-KR')}원</td></tr><tr><th>시공 비용</th><td>${estimate.constructionCost.toLocaleString('ko-KR')}원</td></tr><tr><th>시공비 범위</th><td>${estimate.constructionCostRange.min.toLocaleString('ko-KR')}~${estimate.constructionCostRange.max.toLocaleString('ko-KR')}원</td></tr><tr><th>할인</th><td>${Math.round(estimate.discountRate * 100)}% · -${estimate.discount.toLocaleString('ko-KR')}원</td></tr><tr><th>소계</th><td>${estimate.subtotal.toLocaleString('ko-KR')}원</td></tr></tbody></table><p>${esc(company.note)}</p></body></html>`;
}
function createEstimateText(estimate: ProjectEstimate, company: CompanyInfo): string { const contact = [company.companyName, company.managerName, company.phone, company.email].filter(Boolean).join(' · '); const details = [...estimate.jobs.map(({ job, estimate: detail }) => `- ${job.name}: 원단 ${detail.materialLengthM.toFixed(2)}m/${detail.materialCost.toLocaleString('ko-KR')}원 · 시공 ${detail.constructionCost.toLocaleString('ko-KR')}원`), ...estimate.mergedJobs.map(({ job, estimate: detail }) => `- ${job.name}: 원단 ${detail.materialLengthM.toFixed(2)}m/${detail.materialCost.toLocaleString('ko-KR')}원 · 시공 ${detail.constructionCost.toLocaleString('ko-KR')}원`)].join('\n'); return `[필름 통합 견적서]\n${contact}\n\n작업 ${estimate.jobCount}건\n\n[작업별 내역]\n${details}\n\n원단 비용: ${estimate.materialCost.toLocaleString('ko-KR')}원\n시공 비용: ${estimate.constructionCost.toLocaleString('ko-KR')}원\n시공비 범위: ${estimate.constructionCostRange.min.toLocaleString('ko-KR')}~${estimate.constructionCostRange.max.toLocaleString('ko-KR')}원\n할인: -${estimate.discount.toLocaleString('ko-KR')}원\n총액: ${estimate.total.toLocaleString('ko-KR')}원${company.note ? `\n\n${company.note}` : ''}`; }
