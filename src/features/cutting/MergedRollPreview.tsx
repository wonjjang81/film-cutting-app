import * as React from 'react';
import Svg, { G, Rect, Text as SvgText } from 'react-native-svg';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { MergedGroupPlan } from '../remnants/planGroupedPieces';

const COLORS = ['#2563eb', '#0f766e', '#c2410c', '#7c3aed', '#be123c', '#0369a1'];

type Props = {
  plan: MergedGroupPlan;
};

function colorFor(sourceId: string, sourceIds: readonly string[]): string {
  const index = Math.max(0, sourceIds.indexOf(sourceId));
  return COLORS[index % COLORS.length] ?? '#2563eb';
}

export function MergedRollPreview({ plan }: Props) {
  const { result } = plan;
  const sourceIds = [...new Set(result.placements.map((placement) => placement.sourceId))];
  const [selectedId, setSelectedId] = React.useState<number | null>(null);
  const selected = result.placements.find((placement) => placement.id === selectedId) ?? null;
  const height = Math.max(240, Math.min(700, (result.usedLengthMm / 1220) * 520));
  const labelBySource = new Map(sourceIds.map((id, index) => [id, `${plan.groupNames[index] ?? `그룹 ${index + 1}`} · ${id}`]));

  return (
    <View style={styles.wrap} accessibilityLabel={`병합 ${plan.mergeGroupId} 롤 미리보기`}>
      <View style={styles.heading}>
        <View style={styles.copy}>
          <Text style={styles.title}>병합 롤 도면</Text>
          <Text style={styles.meta}>폭 1,220mm · 길이 {Math.round(result.usedLengthMm).toLocaleString()}mm · {result.producedQuantity}개</Text>
        </View>
        <Text style={styles.badge}>수율 {result.utilizationPercent}%</Text>
      </View>
      <View style={styles.legend}>
        {sourceIds.map((sourceId, index) => <View key={sourceId} style={styles.legendItem}><View style={[styles.dot, { backgroundColor: COLORS[index % COLORS.length] }]} /><Text style={styles.legendText}>{labelBySource.get(sourceId)}</Text></View>)}
      </View>
      <ScrollView horizontal style={styles.canvasScroll} contentContainerStyle={styles.canvasContent}>
        <View style={[styles.canvas, { height }]}>
          <Svg width="100%" height="100%" viewBox={`0 0 1220 ${Math.max(result.usedLengthMm, 1)}`} accessibilityLabel="병합 롤 배치 도면">
            <Rect x={0} y={0} width={1220} height={Math.max(result.usedLengthMm, 1)} fill="#f8fafc" stroke="#334155" strokeWidth={2} rx={4} />
            {result.placements.map((placement) => {
              const color = colorFor(placement.sourceId, sourceIds);
              const active = selectedId === placement.id;
              return <G key={placement.id} onPress={() => setSelectedId((current) => current === placement.id ? null : placement.id)} accessibilityLabel={`병합 제품 ${placement.id} 상세 보기`}>
                <Rect x={placement.x} y={placement.y} width={placement.width} height={placement.height} rx={3} fill={`${color}22`} stroke={active ? '#0f172a' : color} strokeWidth={active ? 5 : 2} />
                <SvgText x={placement.x + placement.width / 2} y={placement.y + placement.height / 2 + 5} textAnchor="middle" fontSize={Math.max(10, Math.min(22, placement.width / 18))} fontWeight="700" fill={color}>{placement.id}</SvgText>
              </G>;
            })}
          </Svg>
        </View>
      </ScrollView>
      {selected && <View style={styles.detail}>
        <Text style={styles.detailTitle}>제품 {selected.id} 상세</Text>
        <Text style={styles.detailText}>{labelBySource.get(selected.sourceId) ?? selected.sourceId} · {selected.width}×{selected.height}mm · {selected.rotated ? '90도 회전' : '기본 방향'} · 위치 ({selected.x}, {selected.y})mm</Text>
      </View>}
      <View style={styles.list}>
        {result.placements.map((placement) => <TouchableOpacity key={placement.id} accessibilityRole="button" accessibilityLabel={`병합 제품 ${placement.id} 선택`} onPress={() => setSelectedId((current) => current === placement.id ? null : placement.id)} style={[styles.item, selectedId === placement.id && styles.itemActive]}><View style={[styles.itemDot, { backgroundColor: colorFor(placement.sourceId, sourceIds) }]} /><Text style={styles.itemText}>#{placement.id} · {labelBySource.get(placement.sourceId) ?? placement.sourceId} · {placement.width}×{placement.height}mm{placement.rotated ? ' · 90°' : ''}</Text></TouchableOpacity>)}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 12, padding: 13, borderRadius: 12, borderWidth: 1, borderColor: '#99f6e4', backgroundColor: '#fff' },
  heading: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 },
  copy: { flex: 1 }, title: { fontSize: 12, fontWeight: '800', color: '#115e59' }, meta: { marginTop: 3, fontSize: 10, color: '#64748b' }, badge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999, fontSize: 10, fontWeight: '800', color: '#0f766e', backgroundColor: '#ccfbf1' },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 10 }, legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 }, dot: { width: 9, height: 9, borderRadius: 5 }, legendText: { maxWidth: 220, fontSize: 10, color: '#475569' },
  canvasScroll: { marginTop: 11, maxHeight: 400, borderRadius: 9, backgroundColor: '#f8fafc' }, canvasContent: { minWidth: '100%' }, canvas: { width: '100%', minWidth: 320, overflow: 'hidden', borderRadius: 9 },
  detail: { marginTop: 9, padding: 10, borderRadius: 8, backgroundColor: '#f1f5f9' }, detailTitle: { fontSize: 11, fontWeight: '800', color: '#334155' }, detailText: { marginTop: 3, fontSize: 10, lineHeight: 15, color: '#475569' },
  list: { gap: 5, marginTop: 10 }, item: { minHeight: 34, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 8, borderRadius: 7, backgroundColor: '#f8fafc' }, itemActive: { backgroundColor: '#e0f2fe' }, itemDot: { width: 7, height: 7, borderRadius: 4 }, itemText: { flex: 1, fontSize: 10, color: '#475569' },
});
