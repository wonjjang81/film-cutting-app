import { StyleSheet, Text, View } from 'react-native';

import type { SavedCuttingJob } from '../library/models';
import { calculateEstimate, DEFAULT_CONSTRUCTION_COST_PER_M2, DEFAULT_MATERIAL_COST_PER_M } from './calculateEstimate';

export function EstimateSummary({ job, compact = false, materialCostPerM, constructionCostPerM2, discountRateOverride }: { job: SavedCuttingJob; compact?: boolean; materialCostPerM?: number; constructionCostPerM2?: number; discountRateOverride?: number }) {
  const estimate = calculateEstimate(job, materialCostPerM, constructionCostPerM2, discountRateOverride);
  return <View style={[styles.card, compact && styles.compactCard]} accessibilityLabel="자동 견적 결과">
    <View style={styles.header}><View><Text style={styles.eyebrow}>AUTO ESTIMATE</Text><Text style={styles.title}>자동 견적</Text></View><Text style={styles.total}>{estimate.total.toLocaleString('ko-KR')}원</Text></View>
    <Text style={styles.caption}>{job.name} · 신규 원단 {(materialCostPerM ?? DEFAULT_MATERIAL_COST_PER_M).toLocaleString('ko-KR')}원/m · 시공 {(constructionCostPerM2 ?? DEFAULT_CONSTRUCTION_COST_PER_M2).toLocaleString('ko-KR')}원/m²</Text>
    <View style={styles.rows}>
      <EstimateRow label="신규 원단" value={`${estimate.materialLengthM.toLocaleString('ko-KR', { maximumFractionDigits: 2 })}m · ${estimate.materialCost.toLocaleString('ko-KR')}원`} />
      <EstimateRow label="시공 면적" value={`${estimate.productAreaM2.toLocaleString('ko-KR', { maximumFractionDigits: 3 })}m² · ${estimate.constructionCost.toLocaleString('ko-KR')}원`} />
      <EstimateRow label="소계" value={`${estimate.subtotal.toLocaleString('ko-KR')}원`} />
      <EstimateRow label={`할인 (${Math.round(estimate.discountRate * 100)}%)`} value={`-${estimate.discount.toLocaleString('ko-KR')}원`} />
    </View>
  </View>;
}

function EstimateRow({ label, value }: { label: string; value: string }) {
  return <View style={styles.row}><Text style={styles.rowLabel}>{label}</Text><Text style={styles.rowValue}>{value}</Text></View>;
}

const styles = StyleSheet.create({
  card: { marginTop: 22, padding: 22, borderRadius: 20, backgroundColor: '#0f172a', shadowColor: '#0f172a', shadowOpacity: 0.12, shadowRadius: 20, shadowOffset: { width: 0, height: 8 }, elevation: 3 },
  compactCard: { marginTop: 16 },
  header: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 },
  eyebrow: { fontSize: 10, letterSpacing: 1.7, fontWeight: '800', color: '#93c5fd' },
  title: { marginTop: 5, fontSize: 22, fontWeight: '800', color: '#fff' },
  total: { fontSize: 25, fontWeight: '900', color: '#bfdbfe' },
  caption: { marginTop: 12, fontSize: 11, lineHeight: 17, color: '#cbd5e1' },
  rows: { gap: 9, marginTop: 16, paddingTop: 14, borderTopWidth: 1, borderTopColor: '#334155' },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  rowLabel: { fontSize: 12, color: '#cbd5e1' },
  rowValue: { flex: 1, fontSize: 12, fontWeight: '700', textAlign: 'right', color: '#f8fafc' },
});
