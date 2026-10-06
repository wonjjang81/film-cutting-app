import { useState } from 'react';
import { Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { ProjectEstimate } from './calculateProjectEstimate';
import { INSTALLATION_LABOR_REFERENCES, type InstallationMode } from './installationLabor';
import { buildEstimateGroupBreakdown } from './estimateBreakdownModel';

const number = (value: number) => value.toLocaleString('ko-KR', { maximumFractionDigits: 4 });

export function InstallationLaborPanel({ estimate, mode, disabled, onChangeMode, onChangePart }: {
  estimate: ProjectEstimate; mode: InstallationMode; disabled: boolean;
  onChangeMode(mode: InstallationMode): void; onChangePart(id: string, part: string): void;
}) {
  const [selectingId, setSelectingId] = useState<string | null>(null);
  const lines = estimate.installationLaborLines ?? [];
  const materialCosts = new Map(buildEstimateGroupBreakdown(estimate).flatMap((group) => group.subgroups.map((subgroup) => [subgroup.id, subgroup.amounts.materialCost] as const)));
  const siteCounts = new Map(buildEstimateGroupBreakdown(estimate).flatMap((group) => group.subgroups.map((subgroup) => [subgroup.id, subgroup.siteCount ?? 1] as const)));
  const billed = estimate.constructionCost / 250_000;
  return <View style={styles.card}>
    <Text style={styles.title}>부위별 품수 · 인건비</Text>
    <View style={styles.buttons}>{(['whole', 'standalone'] as const).map((value) => <TouchableOpacity key={value} disabled={disabled} accessibilityRole="button" accessibilityState={{ selected: mode === value, disabled }} onPress={() => onChangeMode(value)} style={[styles.button, mode === value && styles.active]}><Text style={[styles.buttonText, mode === value && styles.activeText]}>{value === 'whole' ? '전체시공' : '단독시공'}</Text></TouchableOpacity>)}</View>
    {disabled ? <Text style={styles.warning}>전체 단가 덮어쓰기 중에는 기본 원/m² 단가를 사용합니다. 덮어쓰기를 끄면 부위별 계산을 적용합니다.</Text> : <>
      <Text style={styles.total}>시공비 {estimate.constructionCost.toLocaleString('ko-KR')}원 · 자재비 {estimate.materialCost.toLocaleString('ko-KR')}원</Text>
      <Text style={styles.hint}>시공품수 {number(billed)}품</Text>
      {lines.some((line) => (line.minimumSupplement ?? 0) > 0) && <Text style={styles.warning}>전체 합산 인건비가 0.5품 미만이므로 총 125,000원으로 보정했습니다.</Text>}
      {lines.map((line) => <View key={line.id} style={styles.line}>
        <View style={styles.row}><View style={styles.copy}><Text style={styles.name}>{line.subgroupName} · {siteCounts.get(line.id) ?? 1}개소</Text></View><TouchableOpacity accessibilityRole="button" accessibilityLabel={`${line.subgroupName} 시공 부위 선택`} onPress={() => setSelectingId(line.id)} style={styles.select}><Text style={styles.buttonText}>{line.part ?? '부위 선택'} ⌄</Text></TouchableOpacity></View>
        <Text style={styles.hint}>시공비 {line.constructionCost.toLocaleString('ko-KR')}원 · 자재비 {(materialCosts.get(line.id) ?? 0).toLocaleString('ko-KR')}원</Text>
        <Text style={styles.hint}>시공품수 {number(line.constructionCost / 250_000)}품</Text>
        {line.calculation ? <>
          {line.calculation.unavailable && <Text style={styles.warning}>표에서는 드레스룸 단독시공을 권장하지 않습니다. 다른 공정과 병행 여부를 확인해 주세요.</Text>}
          {line.part === '샷시 (내부)' && <Text style={styles.warning}>유리 실리콘 재코킹 인건비 별도</Text>}
        </> : null}
      </View>)}
      <Text style={styles.hint}>표의 현장 변수 예비 0.5~1품은 별도이며 자동 가산하지 않습니다.</Text>
    </>}
    <Modal visible={selectingId !== null} transparent animationType="fade" onRequestClose={() => setSelectingId(null)}><View style={styles.backdrop}><View style={styles.dialog}>
      <View style={styles.row}><Text style={styles.title}>시공 부위 선택</Text><TouchableOpacity accessibilityRole="button" onPress={() => setSelectingId(null)}><Text>닫기</Text></TouchableOpacity></View>
      <ScrollView style={styles.options}>{[{ name: '', label: '미선택 · 기존 단가 적용' }, ...INSTALLATION_LABOR_REFERENCES.map((part) => ({ name: part.name, label: part.name }))].map((part) => <TouchableOpacity key={part.name} accessibilityRole="button" onPress={() => { if (selectingId) onChangePart(selectingId, part.name); setSelectingId(null); }} style={styles.option}><Text>{part.label}</Text></TouchableOpacity>)}</ScrollView>
    </View></View></Modal>
  </View>;
}

const styles = StyleSheet.create({
  card: { marginVertical: 12, padding: 14, borderWidth: 1, borderColor: '#bae6fd', borderRadius: 12, backgroundColor: '#f0f9ff', gap: 7 },
  title: { fontSize: 14, fontWeight: '800', color: '#0c4a6e' }, hint: { fontSize: 11, lineHeight: 17, color: '#64748b' },
  buttons: { flexDirection: 'row', gap: 8 }, button: { flex: 1, padding: 10, borderRadius: 8, borderWidth: 1, borderColor: '#cbd5e1', alignItems: 'center' }, active: { backgroundColor: '#0369a1', borderColor: '#0369a1' }, buttonText: { fontSize: 12, fontWeight: '700', color: '#075985' }, activeText: { color: '#fff' },
  total: { fontSize: 16, fontWeight: '800', color: '#0c4a6e' }, line: { paddingVertical: 10, borderTopWidth: 1, borderColor: '#bae6fd', gap: 4 }, row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8 }, copy: { flexGrow: 1 }, name: { fontSize: 13, fontWeight: '800', color: '#0f172a' }, select: { padding: 8, borderWidth: 1, borderColor: '#7dd3fc', borderRadius: 8, backgroundColor: '#fff' }, formula: { fontSize: 11, lineHeight: 18, color: '#075985' }, warning: { fontSize: 11, lineHeight: 17, color: '#b45309' },
  backdrop: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 16, backgroundColor: 'rgba(0,0,0,0.4)' }, dialog: { width: '100%', maxWidth: 450, maxHeight: '80%', padding: 16, borderRadius: 12, backgroundColor: '#fff' }, options: { maxHeight: 420, marginTop: 10 }, option: { padding: 13, borderBottomWidth: 1, borderColor: '#e2e8f0' },
});
