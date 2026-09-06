import { useCallback, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router, useFocusEffect } from 'expo-router';
import { RefreshCw, Scissors } from 'lucide-react-native';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { FilmLayoutPreview } from '../../src/features/cutting/FilmLayoutPreview';
import { MergedRollPreview } from '../../src/features/cutting/MergedRollPreview';
import { calculateCurrentGroupPlan, CURRENT_GROUP_ESTIMATE_STORAGE_KEY, parseCurrentEstimateSnapshot, type CurrentEstimatePlan } from '../../src/features/estimate/currentGroupEstimate';
import type { GroupedPiecePlan } from '../../src/features/remnants/planGroupedPieces';

const emptyPlan: CurrentEstimatePlan = { groupedPlans: [], mergedPlans: [] };

export default function PlanningScreen() {
  const [currentPlan, setCurrentPlan] = useState<CurrentEstimatePlan>(emptyPlan);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const raw = await AsyncStorage.getItem(CURRENT_GROUP_ESTIMATE_STORAGE_KEY);
      const snapshot = parseCurrentEstimateSnapshot(raw);
      setCurrentPlan(snapshot ? calculateCurrentGroupPlan(snapshot) : emptyPlan);
    } catch (caught) {
      setCurrentPlan(emptyPlan);
      setError(caught instanceof Error ? caught.message : '배치 계획을 불러오지 못했습니다.');
    } finally { setLoading(false); }
  }, []);

  useFocusEffect(useCallback(() => { void refresh(); }, [refresh]));

  const mergedSourceIds = useMemo(() => new Set(currentPlan.mergedPlans.flatMap((plan) => plan.sourceIds)), [currentPlan.mergedPlans]);
  const independentPlans = useMemo(() => currentPlan.groupedPlans.filter((entry) => !mergedSourceIds.has(`${entry.groupId}-${entry.pieceId}`)), [currentPlan.groupedPlans, mergedSourceIds]);
  const pieceCount = currentPlan.groupedPlans.length;
  const newRollLength = independentPlans.reduce((sum, entry) => sum + (entry.plan.newRollResult?.usedLengthMm ?? 0), 0)
    + currentPlan.mergedPlans.reduce((sum, plan) => sum + plan.result.usedLengthMm, 0);
  const producedQuantity = independentPlans.reduce((sum, entry) => sum + producedForPiecePlan(entry), 0)
    + currentPlan.mergedPlans.reduce((sum, plan) => sum + plan.producedQuantity, 0);
  const hasPlan = pieceCount > 0;

  return <ScrollView style={styles.page} contentContainerStyle={styles.content}>
    <View style={styles.header}>
      <View style={styles.headerCopy}><Text style={styles.eyebrow}>BATCH PLANNING</Text><Text style={styles.title}>배치 계획</Text><Text style={styles.subtitle}>재단계산에서 입력·계산한 조각을 기준으로 배치 미리보기와 원단 사용 계획을 확인합니다.</Text></View>
      <View style={styles.headerActions}><TouchableOpacity accessibilityRole="button" accessibilityLabel="배치 계획 새로고침" onPress={() => void refresh()} disabled={loading} style={[styles.refreshButton, loading && styles.disabled]}><RefreshCw color="#2563eb" size={15} /><Text style={styles.refreshText}>새로고침</Text></TouchableOpacity><TouchableOpacity accessibilityRole="button" accessibilityLabel="재단 계산으로 이동" onPress={() => router.push('/input')} style={styles.inputButton}><Scissors color="#fff" size={15} /><Text style={styles.inputButtonText}>재단 계산</Text></TouchableOpacity></View>
    </View>
    {error && <View style={styles.error}><Text style={styles.errorText}>{error}</Text></View>}
    {!hasPlan ? <View style={styles.empty}><Text style={styles.emptyIcon}>▦</Text><Text style={styles.emptyTitle}>{loading ? '배치 계획을 불러오는 중…' : '계산된 배치가 없습니다.'}</Text><Text style={styles.emptyBody}>재단계산 탭에서 조각별 폭·길이·수량을 입력하고 현재 조각 배치를 실행해 주세요.</Text><TouchableOpacity accessibilityRole="button" onPress={() => router.push('/input')} style={styles.emptyButton}><Text style={styles.emptyButtonText}>재단 계산으로 이동</Text></TouchableOpacity></View> : <>
      <View style={styles.summaryCard}><View style={styles.summaryHeader}><View><Text style={styles.sectionEyebrow}>MATERIAL PLAN</Text><Text style={styles.sectionTitle}>원단 사용 계획</Text></View><Text style={styles.summaryStatus}>임시 계산 결과</Text></View><View style={styles.metrics}><Metric label="계산 조각" value={`${pieceCount}개`} /><Metric label="생산 수량" value={`${producedQuantity}개`} /><Metric label="새 롤 사용 길이" value={`${Math.round(newRollLength).toLocaleString()}mm`} /></View><Text style={styles.summaryHint}>자투리 사용 여부와 재단 완료·작업 확정은 재단계산 탭의 기존 workflow에서 이어서 처리할 수 있습니다.</Text></View>
      <View style={styles.section}><View style={styles.sectionHeader}><View><Text style={styles.sectionEyebrow}>LAYOUT PREVIEW</Text><Text style={styles.sectionTitle}>배치 미리보기</Text></View><Text style={styles.sectionHint}>병합 롤은 한 번만 표시합니다.</Text></View>
        {currentPlan.mergedPlans.map((plan) => <MergedRollPreview key={`merged-${plan.mergeGroupId}`} plan={plan} />)}
        {independentPlans.map((entry) => <PiecePlanCard key={`${entry.groupId}-${entry.pieceId}`} entry={entry} />)}
      </View>
    </>}
  </ScrollView>;
}

function PiecePlanCard({ entry }: { entry: GroupedPiecePlan }) {
  const result = entry.plan.newRollResult;
  return <View style={styles.pieceCard}><View style={styles.pieceHeader}><View><Text style={styles.pieceTitle}>{entry.groupName} · {entry.pieceName}</Text><Text style={styles.pieceMeta}>{entry.request.pieceWidthMm}×{entry.request.pieceLengthMm}mm · 필요 {entry.request.quantity}개</Text></View><Text style={styles.pieceStatus}>{producedForPiecePlan(entry)}개 생산</Text></View>{result ? <FilmLayoutPreview result={result} rollWidthMm={entry.request.rollWidthMm} sideMarginMm={entry.request.sideMarginMm} startEndMarginMm={entry.request.startEndMarginMm} /> : <View style={styles.remnantOnly}><Text style={styles.remnantOnlyTitle}>자투리에서 전량 생산</Text><Text style={styles.remnantOnlyText}>새 원본 롤 사용 없이 저장된 자투리로 배치되었습니다.</Text></View>}{entry.plan.remnantUses.length > 0 && <Text style={styles.remnantLine}>자투리 {entry.plan.remnantUses.length}개 사용 · 새 롤 {Math.round(entry.plan.newRollResult?.usedLengthMm ?? 0).toLocaleString()}mm</Text>}</View>;
}

function producedForPiecePlan(entry: GroupedPiecePlan): number {
  return entry.plan.remnantUses.reduce((sum, use) => sum + use.producedQuantity, 0) + (entry.plan.newRollResult?.producedQuantity ?? 0);
}

function Metric({ label, value }: { label: string; value: string }) {
  return <View style={styles.metric}><Text style={styles.metricLabel}>{label}</Text><Text style={styles.metricValue}>{value}</Text></View>;
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#f1f5f9' }, content: { width: '100%', maxWidth: 1180, alignSelf: 'center', padding: 24, paddingBottom: 88 },
  header: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16 }, headerCopy: { flex: 1, minWidth: 240 }, eyebrow: { fontSize: 11, letterSpacing: 1.8, fontWeight: '800', color: '#2563eb' }, title: { marginTop: 7, fontSize: 30, fontWeight: '800', color: '#0f172a' }, subtitle: { marginTop: 7, maxWidth: 700, fontSize: 14, lineHeight: 21, color: '#64748b' }, headerActions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 }, refreshButton: { minHeight: 40, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 12, borderWidth: 1, borderColor: '#bfdbfe', borderRadius: 9, backgroundColor: '#fff' }, refreshText: { fontSize: 11, fontWeight: '800', color: '#2563eb' }, inputButton: { minHeight: 40, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 12, borderRadius: 9, backgroundColor: '#2563eb' }, inputButtonText: { fontSize: 11, fontWeight: '800', color: '#fff' }, disabled: { opacity: 0.5 }, error: { marginTop: 18, padding: 12, borderRadius: 9, borderWidth: 1, borderColor: '#fecaca', backgroundColor: '#fff1f2' }, errorText: { fontSize: 12, color: '#991b1b' }, empty: { marginTop: 22, minHeight: 320, alignItems: 'center', justifyContent: 'center', padding: 24, borderRadius: 18, backgroundColor: '#fff' }, emptyIcon: { fontSize: 40, color: '#93c5fd' }, emptyTitle: { marginTop: 10, fontSize: 18, fontWeight: '800', color: '#1e293b' }, emptyBody: { maxWidth: 480, marginTop: 7, fontSize: 12, lineHeight: 18, textAlign: 'center', color: '#64748b' }, emptyButton: { minHeight: 40, marginTop: 16, justifyContent: 'center', paddingHorizontal: 14, borderRadius: 8, backgroundColor: '#2563eb' }, emptyButtonText: { fontSize: 11, fontWeight: '800', color: '#fff' },
  summaryCard: { marginTop: 22, padding: 18, borderRadius: 16, borderWidth: 1, borderColor: '#bfdbfe', backgroundColor: '#fff' }, summaryHeader: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 10 }, sectionEyebrow: { fontSize: 10, letterSpacing: 1.4, fontWeight: '800', color: '#2563eb' }, sectionTitle: { marginTop: 4, fontSize: 21, fontWeight: '800', color: '#0f172a' }, summaryStatus: { paddingHorizontal: 9, paddingVertical: 5, borderRadius: 999, fontSize: 10, fontWeight: '800', color: '#1d4ed8', backgroundColor: '#eff6ff' }, metrics: { flexDirection: 'row', flexWrap: 'wrap', gap: 9, marginTop: 15 }, metric: { flex: 1, minWidth: 150, padding: 12, borderRadius: 10, borderWidth: 1, borderColor: '#e2e8f0', backgroundColor: '#f8fafc' }, metricLabel: { fontSize: 10, color: '#64748b' }, metricValue: { marginTop: 5, fontSize: 18, fontWeight: '800', color: '#0f172a' }, summaryHint: { marginTop: 12, fontSize: 11, lineHeight: 17, color: '#64748b' },
  section: { marginTop: 20, padding: 18, borderRadius: 16, backgroundColor: '#fff' }, sectionHeader: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-end', justifyContent: 'space-between', gap: 10 }, sectionHint: { fontSize: 11, color: '#64748b' }, pieceCard: { marginTop: 14, padding: 13, borderRadius: 12, borderWidth: 1, borderColor: '#dbeafe', backgroundColor: '#f8fbff' }, pieceHeader: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8 }, pieceTitle: { fontSize: 13, fontWeight: '800', color: '#1e3a8a' }, pieceMeta: { marginTop: 3, fontSize: 10, color: '#64748b' }, pieceStatus: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999, fontSize: 10, fontWeight: '800', color: '#0f766e', backgroundColor: '#ccfbf1' }, remnantOnly: { marginTop: 11, padding: 16, alignItems: 'center', borderRadius: 10, backgroundColor: '#ecfdf5' }, remnantOnlyTitle: { fontSize: 12, fontWeight: '800', color: '#047857' }, remnantOnlyText: { marginTop: 4, fontSize: 10, color: '#0f766e' }, remnantLine: { marginTop: 8, fontSize: 10, color: '#0f766e' },
});
