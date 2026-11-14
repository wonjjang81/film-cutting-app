import { useState } from 'react';
import { Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { GroupedPieceRequest, MergedGroupPlan } from '../remnants/planGroupedPieces';
import { hasCutGroups, packCutGroups } from './cutGroupLayout';

export function CutGroupPanel({ plan, requests, labels, disabled, onApply }: {
  plan: MergedGroupPlan; requests: readonly GroupedPieceRequest[]; labels: Record<string, string>; disabled: boolean;
  onApply(next: MergedGroupPlan): void;
}) {
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<number[]>([]);
  const [groups, setGroups] = useState<number[][]>([]);
  const [candidate, setCandidate] = useState<{ base: MergedGroupPlan; next: MergedGroupPlan }>();
  const [error, setError] = useState('');
  const available = plan.result.placements;
  const assigned = new Set(groups.flat());
  const preview = candidate?.base === plan && !picked.length ? candidate.next : undefined;
  const mm = (value: number) => `${value.toLocaleString('ko-KR', { maximumFractionDigits: 2 })}mm`;
  const edit = (next: number[][]) => { setGroups(next); setCandidate(undefined); setError(''); };
  const action = (name: string, press: () => void, off = false) => <TouchableOpacity accessibilityRole="button" accessibilityLabel={name} disabled={off} onPress={press} style={[styles.button, off && styles.disabled]}><Text style={styles.buttonText}>{name}</Text></TouchableOpacity>;
  const start = () => {
    const current = new Map<number, number[]>();
    for (const piece of available) if (piece.cutGroup !== undefined) {
      const group = current.get(piece.cutGroup) ?? [];
      group.push(piece.id);
      current.set(piece.cutGroup, group);
    }
    edit([...current].sort((a,b) => a[0] - b[0]).map(([, ids]) => ids));
    setPicked([]); setOpen(true);
  };
  return <View style={styles.wrapper}>
    {action('그룹화 배치', start, disabled || !available.length)}
    {hasCutGroups(plan) && <Text style={styles.hint}>그룹화 배치 적용 중 · 구간을 유지하도록 개별 이동과 빈 공간 재배치를 제한합니다.</Text>}
    {disabled && available.length > 0 && <Text style={styles.hint}>배치를 불러오는 중이거나 재단 완료 조각이 있으면 그룹화할 수 없습니다.</Text>}
    <Modal visible={open} transparent onRequestClose={() => setOpen(false)}>
      <View style={styles.shade}><View style={styles.card} accessibilityViewIsModal>
        <Text style={styles.title}>그룹화 배치</Text>
        <Text style={styles.hint}>현재 병합 롤의 새 원단 조각만 선택할 수 있습니다. 자투리는 그대로 두고, 미선택 조각은 마지막에 배치합니다.</Text>
        <ScrollView style={styles.scroll}>
          {groups.map((ids, index) => <View key={ids.join(',')} style={styles.group}>
            <Text style={styles.title}>그룹 {index + 1} · {ids.length}개</Text>
            <Text style={styles.hint}>{ids.map(id => `#${id}`).join(', ')}</Text>
            <View style={styles.actions}>
              {action(`그룹 ${index + 1} 위로`, () => edit(groups.map((group,i) => i === index - 1 ? ids : i === index ? groups[index - 1]! : group)), index === 0)}
              {action(`그룹 ${index + 1} 해제`, () => edit(groups.filter((_, i) => i !== index)))}
            </View>
          </View>)}
          {available.filter(piece => !assigned.has(piece.id)).map(piece => <TouchableOpacity key={piece.id} accessibilityRole="checkbox" accessibilityState={{ checked: picked.includes(piece.id) }} accessibilityLabel={`그룹에 조각 ${piece.id} 선택`} onPress={() => setPicked(current => current.includes(piece.id) ? current.filter(id => id !== piece.id) : [...current, piece.id])} style={styles.piece}>
            <Text>{picked.includes(piece.id) ? '☑' : '☐'} #{piece.id} · {piece.pieceName ?? labels[piece.sourceId] ?? piece.sourceId} · {piece.width}×{piece.height}mm</Text>
          </TouchableOpacity>)}
        </ScrollView>
        <View style={styles.actions}>
          {action(`그룹 만들기 (${picked.length}개)`, () => { edit([...groups, picked]); setPicked([]); }, !picked.length || disabled)}
          {action('사용 길이 비교', () => {
            setCandidate(undefined); setError('');
            try { setCandidate({ base: plan, next: packCutGroups(plan, requests, groups) }); }
            catch (cause) { setError(cause instanceof Error ? cause.message : '그룹화 배치에 실패했습니다.'); }
          }, !groups.length || !!picked.length || disabled)}
        </View>
        {!!error && <Text style={styles.error}>{error}</Text>}
        {preview && <Text accessibilityLiveRegion="polite" style={styles.hint}>현재 {mm(plan.result.usedLengthMm)} → 그룹화 {mm(preview.result.usedLengthMm)} · 차이 {mm(preview.result.usedLengthMm - plan.result.usedLengthMm)} · {preview.rollResults?.length ?? 1}롤</Text>}
        <View style={styles.actions}>
          {action('그룹화 적용', () => { if (preview && !disabled) { onApply(preview); setOpen(false); } }, !preview || disabled)}
          {action('닫기', () => setOpen(false))}
        </View>
      </View></View>
    </Modal>
  </View>;
}

const styles = StyleSheet.create({
  wrapper: { alignItems: 'flex-start', gap: 6, paddingVertical: 8 },
  shade: { flex: 1, backgroundColor: '#0007', justifyContent: 'center', alignItems: 'center', padding: 16 },
  card: { width: '100%', maxWidth: 580, maxHeight: '90%', backgroundColor: '#fff', borderRadius: 14, padding: 16, gap: 8 },
  scroll: { flexGrow: 0, minHeight: 0 },
  title: { fontSize: 14, fontWeight: '800', color: '#1e293b' },
  hint: { fontSize: 12, color: '#475569', lineHeight: 18 },
  error: { fontSize: 12, color: '#b91c1c' },
  group: { backgroundColor: '#f5f3ff', padding: 10, marginBottom: 6, gap: 4, borderRadius: 7 },
  piece: { paddingVertical: 10, borderBottomWidth: 1, borderColor: '#e2e8f0' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  button: { padding: 9, borderRadius: 7, backgroundColor: '#ede9fe' },
  buttonText: { color: '#5b21b6', fontSize: 12, fontWeight: '800' },
  disabled: { opacity: 0.45 },
});
