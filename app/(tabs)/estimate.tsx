import { useCallback, useState } from 'react';
import { Platform, ScrollView, StyleSheet, Switch, Text, TextInput, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

import { EstimateSummary } from '../../src/features/estimate/EstimateSummary';
import { asyncStorageLibraryAdapter } from '../../src/features/library/asyncStorageLibraryAdapter';
import { createLibraryRepository } from '../../src/features/library/libraryRepository';
import type { SavedCuttingJob } from '../../src/features/library/models';
import { calculateEstimate, DEFAULT_CONSTRUCTION_COST_PER_M2, DEFAULT_MATERIAL_COST_PER_M } from '../../src/features/estimate/calculateEstimate';

const repository = createLibraryRepository(asyncStorageLibraryAdapter);

export default function EstimateScreen() {
  const { width } = useWindowDimensions();
  const [job, setJob] = useState<SavedCuttingJob | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [materialCostText, setMaterialCostText] = useState(String(DEFAULT_MATERIAL_COST_PER_M));
  const [constructionCostText, setConstructionCostText] = useState(String(DEFAULT_CONSTRUCTION_COST_PER_M2));
  const [discountEnabled, setDiscountEnabled] = useState(false);
  const [discountText, setDiscountText] = useState('');

  const refresh = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const loaded = await repository.load();
      const nextJob = loaded.document.jobs[0] ?? null;
      setJob(nextJob);
      setMaterialCostText(String(nextJob?.materialCostPerM ?? DEFAULT_MATERIAL_COST_PER_M)); setConstructionCostText(String(nextJob?.constructionCostPerM2 ?? DEFAULT_CONSTRUCTION_COST_PER_M2)); setDiscountEnabled(false); setDiscountText('');
      if (loaded.warnings.length > 0) setError(loaded.warnings.join(' '));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '저장된 프로젝트를 불러오지 못했습니다.');
    } finally { setLoading(false); }
  }, []);
  const materialCost = positiveNumber(materialCostText, DEFAULT_MATERIAL_COST_PER_M);
  const constructionCost = positiveNumber(constructionCostText, DEFAULT_CONSTRUCTION_COST_PER_M2);
  const discountOverride = discountEnabled ? Math.min(100, Math.max(0, Number(discountText) || 0)) / 100 : undefined;
  const exportEstimatePdf = async () => {
    if (!job) return;
    const estimate = calculateEstimate(job, materialCost, constructionCost, discountOverride);
    const html = createEstimateHtml(job, estimate, materialCost, constructionCost);
    if (Platform.OS === 'web') await Print.printAsync({ html });
    else { const file = await Print.printToFileAsync({ html }); if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(file.uri, { mimeType: 'application/pdf', dialogTitle: '견적서 PDF 공유' }); }
  };
  useFocusEffect(useCallback(() => { void refresh(); }, [refresh]));

  return <ScrollView style={styles.page} contentContainerStyle={[styles.content, width < 420 && styles.contentSmall]}>
    <View style={styles.header}><View><Text style={styles.eyebrow}>ESTIMATE WORKSPACE</Text><Text style={styles.title}>자동 견적</Text><Text style={styles.description}>최근 저장된 프로젝트의 원단·시공 비용을 자동 계산합니다.</Text></View><TouchableOpacity accessibilityRole="button" accessibilityLabel="견적 새로고침" onPress={() => void refresh()} style={styles.refresh}><Text style={styles.refreshText}>새로고침</Text></TouchableOpacity></View>
    {error && <Text style={styles.error}>{error}</Text>}
    {loading ? <Text style={styles.empty}>견적을 불러오는 중입니다…</Text> : job ? <><View style={styles.controls}><Text style={styles.controlsTitle}>견적 조건</Text><View style={styles.controlGrid}><EstimateInput label="원단 단가" unit="원/m" value={materialCostText} onChangeText={setMaterialCostText} /><EstimateInput label="시공 단가" unit="원/m²" value={constructionCostText} onChangeText={setConstructionCostText} /></View><View style={styles.discountRow}><View style={styles.discountCopy}><Text style={styles.controlLabel}>사용자 할인율</Text><Text style={styles.controlHint}>{discountEnabled ? '입력한 할인율을 적용합니다.' : '면적 기준 자동 할인율을 적용합니다.'}</Text></View><Switch accessibilityLabel="사용자 할인율" value={discountEnabled} onValueChange={setDiscountEnabled} /><TextInput accessibilityLabel="할인율 퍼센트" editable={discountEnabled} value={discountText} onChangeText={(value) => setDiscountText(value.replace(/[^0-9.]/g, ''))} placeholder="0" keyboardType="numeric" style={[styles.discountInput, !discountEnabled && styles.disabledInput]} /><Text style={styles.percent}>%</Text></View><TouchableOpacity accessibilityRole="button" onPress={() => void exportEstimatePdf()} style={styles.pdfButton}><Text style={styles.pdfButtonText}>견적서 PDF·인쇄</Text></TouchableOpacity></View><EstimateSummary job={job} materialCostPerM={materialCost} constructionCostPerM2={constructionCost} discountRateOverride={discountOverride} /></> : <View style={styles.emptyCard}><Text style={styles.emptyTitle}>저장된 프로젝트가 없습니다.</Text><Text style={styles.emptyDescription}>재단 계산 탭에서 조건을 계산하면 프로젝트와 견적이 자동 저장됩니다.</Text></View>}
  </ScrollView>;
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#f1f5f9' }, content: { width: '100%', maxWidth: 980, alignSelf: 'center', paddingHorizontal: 20, paddingTop: 32, paddingBottom: 72 }, contentSmall: { paddingHorizontal: 12, paddingTop: 20 },
  header: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-end', justifyContent: 'space-between', gap: 14, marginBottom: 18 }, eyebrow: { fontSize: 11, letterSpacing: 1.8, fontWeight: '800', color: '#2563eb' }, title: { marginTop: 6, fontSize: 32, lineHeight: 40, fontWeight: '800', color: '#0f172a' }, description: { marginTop: 7, fontSize: 14, lineHeight: 21, color: '#64748b' }, refresh: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 15, borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 10, backgroundColor: '#fff' }, refreshText: { fontSize: 12, fontWeight: '800', color: '#334155' }, error: { marginBottom: 16, padding: 13, borderRadius: 10, borderWidth: 1, borderColor: '#fecaca', color: '#991b1b', backgroundColor: '#fff1f2' }, controls: { padding: 17, borderRadius: 16, backgroundColor: '#fff', borderWidth: 1, borderColor: '#e2e8f0' }, controlsTitle: { fontSize: 15, fontWeight: '800', color: '#1e293b' }, controlGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 12 }, control: { minWidth: 180, flex: 1 }, controlLabel: { marginBottom: 6, fontSize: 11, fontWeight: '700', color: '#475569' }, controlInputWrap: { flexDirection: 'row', alignItems: 'center', minHeight: 42, borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 9, backgroundColor: '#f8fafc' }, controlInput: { flex: 1, minHeight: 40, paddingHorizontal: 10, fontSize: 14, fontWeight: '700', color: '#0f172a' }, unit: { paddingRight: 10, fontSize: 10, color: '#64748b' }, discountRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 14 }, discountCopy: { flex: 1 }, controlHint: { marginTop: 3, fontSize: 10, color: '#64748b' }, discountInput: { width: 62, height: 40, paddingHorizontal: 8, borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 8, textAlign: 'center', color: '#0f172a' }, disabledInput: { opacity: 0.4, backgroundColor: '#f1f5f9' }, percent: { fontSize: 12, color: '#64748b' }, pdfButton: { minHeight: 42, alignItems: 'center', justifyContent: 'center', marginTop: 14, borderRadius: 9, backgroundColor: '#1e3a8a' }, pdfButtonText: { fontSize: 12, fontWeight: '800', color: '#fff' }, empty: { paddingVertical: 30, textAlign: 'center', color: '#64748b' }, emptyCard: { marginTop: 12, padding: 24, borderRadius: 18, borderWidth: 1, borderColor: '#e2e8f0', backgroundColor: '#fff' }, emptyTitle: { fontSize: 17, fontWeight: '800', color: '#1e293b' }, emptyDescription: { marginTop: 8, fontSize: 13, lineHeight: 20, color: '#64748b' },
});

function EstimateInput({ label, unit, value, onChangeText }: { label: string; unit: string; value: string; onChangeText(value: string): void }) { return <View style={styles.control}><Text style={styles.controlLabel}>{label}</Text><View style={styles.controlInputWrap}><TextInput accessibilityLabel={label} value={value} onChangeText={(text) => onChangeText(text.replace(/[^0-9]/g, ''))} keyboardType="numeric" style={styles.controlInput} /><Text style={styles.unit}>{unit}</Text></View></View>; }
function positiveNumber(value: string, fallback: number): number { const parsed = Number(value); return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback; }
function createEstimateHtml(job: SavedCuttingJob, estimate: ReturnType<typeof calculateEstimate>, materialCost: number, constructionCost: number): string { const esc = (value: string) => value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char] ?? char)); return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>필름 견적서</title><style>body{font-family:sans-serif;padding:24px;color:#111827}table{border-collapse:collapse;width:100%;margin-top:16px}th,td{border:1px solid #cbd5e1;padding:8px;text-align:left}th{background:#f1f5f9}h1{margin-bottom:4px}.total{font-size:24px;font-weight:800;color:#1d4ed8}</style></head><body><h1>필름 견적서</h1><p>${esc(job.name)} · ${esc(job.brand)} ${esc(job.productNumber)}</p><p class="total">총액 ${estimate.total.toLocaleString('ko-KR')}원</p><table><tbody><tr><th>원단 단가</th><td>${materialCost.toLocaleString('ko-KR')}원/m</td></tr><tr><th>시공 단가</th><td>${constructionCost.toLocaleString('ko-KR')}원/m²</td></tr><tr><th>원단 비용</th><td>${estimate.materialCost.toLocaleString('ko-KR')}원</td></tr><tr><th>시공 비용</th><td>${estimate.constructionCost.toLocaleString('ko-KR')}원</td></tr><tr><th>할인</th><td>${Math.round(estimate.discountRate * 100)}% · -${estimate.discount.toLocaleString('ko-KR')}원</td></tr><tr><th>소계</th><td>${estimate.subtotal.toLocaleString('ko-KR')}원</td></tr></tbody></table></body></html>`; }
