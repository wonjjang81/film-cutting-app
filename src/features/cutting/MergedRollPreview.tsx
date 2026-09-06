import * as React from 'react';
import Svg, { G, Rect, Text as SvgText } from 'react-native-svg';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { MergedGroupPlan } from '../remnants/planGroupedPieces';
import type { SavedMergedCuttingJob } from '../library/models';
import { groupPlacementsBySubgroup } from './planningPlacementModel';
import { formatPlacementAnnotation } from './previewAnnotationModel';

const COLORS = ['#2563eb', '#0f766e', '#c2410c', '#7c3aed', '#be123c', '#0369a1'];

type Props = {
  plan: MergedGroupPlan;
  job?: SavedMergedCuttingJob;
  busy?: boolean;
  onToggleComplete?(): void;
  onTogglePlacementComplete?(placementId: number): void;
  compact?: boolean;
  hidePlacementList?: boolean;
  hideLegend?: boolean;
  sourceLabels?: Record<string, string>;
  sourceSubgroups?: Record<string, string>;
};

function colorFor(sourceId: string, sourceIds: readonly string[]): string {
  const index = Math.max(0, sourceIds.indexOf(sourceId));
  return COLORS[index % COLORS.length] ?? '#2563eb';
}

export function MergedRollPreview({ plan, job, busy = false, onToggleComplete, onTogglePlacementComplete, compact = false, hidePlacementList = false, hideLegend = false, sourceLabels, sourceSubgroups }: Props) {
  const { result } = plan;
  const sourceIds = [...new Set(result.placements.map((placement) => placement.sourceId))];
  const [selectedId, setSelectedId] = React.useState<number | null>(null);
  const [viewportWidth, setViewportWidth] = React.useState(640);
  const [zoom, setZoom] = React.useState(1);
  const selected = result.placements.find((placement) => placement.id === selectedId) ?? null;
  const safeLength = Math.max(result.usedLengthMm, 1);
  const baseHeight = Math.max(240, (viewportWidth / 1220) * safeLength);
  const height = baseHeight * zoom;
  const viewBoxWidth = 1220 / zoom;
  const viewBoxX = (1220 - viewBoxWidth) / 2;
  const completedPlacementIds = new Set(job?.completedPlacementIds ?? []);
  const labelBySource = new Map(sourceIds.map((id, index) => [id, sourceLabels?.[id] ?? `${plan.groupNames[index] ?? `그룹 ${index + 1}`} · ${id}`]));
  const renderCanvas = () => <View style={[styles.canvas, { height, width: viewportWidth }]}>
    <Svg width={viewportWidth} height={height} viewBox={`${viewBoxX} 0 ${viewBoxWidth} ${safeLength}`} accessibilityLabel="병합 롤 배치 도면">
      <Rect x={0} y={0} width={1220} height={safeLength} fill="#f8fafc" stroke="#334155" strokeWidth={2} rx={4} />
      {result.placements.map((placement) => {
        const color = colorFor(placement.sourceId, sourceIds);
        const active = selectedId === placement.id;
        const annotation = formatPlacementAnnotation(`${labelBySource.get(placement.sourceId) ?? '조각'} #${placement.id}`, placement.width, placement.height, placement.rotated);
        const labelFontSize = Math.max(11, Math.min(30, Math.min(placement.width, placement.height) * 0.2));
        const dimensionFontSize = Math.max(9, Math.min(22, labelFontSize * 0.62));
        const centerX = placement.x + placement.width / 2;
        const centerY = placement.y + placement.height / 2;
        return <G key={placement.id} onPress={() => setSelectedId((current) => current === placement.id ? null : placement.id)} accessibilityLabel={`병합 제품 ${placement.id} 상세 보기`}>
          <Rect x={placement.x} y={placement.y} width={placement.width} height={placement.height} rx={3} fill={`${color}22`} stroke={active ? '#0f172a' : color} strokeWidth={active ? 5 : 2} />
          <SvgText x={centerX} y={centerY - dimensionFontSize * 0.15} textAnchor="middle" fontSize={labelFontSize} fontWeight="900" fill={color}>{annotation.label}</SvgText>
          <SvgText x={centerX} y={centerY + labelFontSize * 0.9} textAnchor="middle" fontSize={dimensionFontSize} fontWeight="700" fill="#334155">{annotation.dimensions}</SvgText>
          {completedPlacementIds.has(placement.id) && <G><Rect x={placement.x + placement.width * 0.18} y={placement.y + placement.height * 0.18} width={placement.width * 0.64} height={placement.height * 0.64} fill="none" stroke="#dc2626" strokeWidth={Math.max(3, placement.width / 45)} transform={`rotate(0 ${placement.x + placement.width / 2} ${placement.y + placement.height / 2})`} /><SvgText x={placement.x + placement.width / 2} y={placement.y + placement.height / 2} textAnchor="middle" fontSize={Math.max(12, Math.min(32, placement.width / 10))} fontWeight="900" fill="#dc2626">×</SvgText></G>}
        </G>;
      })}
    </Svg>
  </View>;

  return (
    <View style={styles.wrap} accessibilityLabel={`병합 ${plan.mergeGroupId} 롤 미리보기`}>
      <View style={styles.heading}>
        <View style={styles.copy}>
          <Text style={styles.title}>병합 롤 도면</Text>
          <Text style={styles.meta}>새 롤 폭 1,220mm · 길이 {Math.round(result.usedLengthMm).toLocaleString()}mm · 총 생산 {plan.producedQuantity}개 (새 롤 {result.producedQuantity}개)</Text>
        </View>
        <Text style={styles.badge}>수율 {result.utilizationPercent}%</Text>
      </View>
      {!hideLegend && <View style={styles.legend}>
        {sourceIds.map((sourceId, index) => <View key={sourceId} style={styles.legendItem}><View style={[styles.dot, { backgroundColor: COLORS[index % COLORS.length] }]} /><Text style={styles.legendText}>{labelBySource.get(sourceId)}</Text></View>)}
      </View>}
      {result.placements.length > 0 ? <>
        <View style={styles.zoomRow} accessibilityLabel="병합 도면 확대 축소">
          <Text style={styles.zoomLabel}>확대/축소</Text>
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="병합 도면 축소" onPress={() => setZoom((value) => Math.max(0.75, Math.round((value - 0.1) * 10) / 10))} style={styles.zoomButton}><Text style={styles.zoomButtonText}>−</Text></TouchableOpacity>
          <Text style={styles.zoomValue}>{Math.round(zoom * 100)}%</Text>
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="병합 도면 확대" onPress={() => setZoom((value) => Math.min(1.5, Math.round((value + 0.1) * 10) / 10))} style={styles.zoomButton}><Text style={styles.zoomButtonText}>＋</Text></TouchableOpacity>
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="병합 도면 화면 폭 맞춤" onPress={() => setZoom(1)} style={styles.zoomFitButton}><Text style={styles.zoomFitText}>폭 맞춤</Text></TouchableOpacity>
        </View>
        <View style={styles.canvasFrame} onLayout={(event) => {
          const nextWidth = event.nativeEvent.layout.width;
          if (nextWidth > 0 && Math.abs(nextWidth - viewportWidth) > 1) setViewportWidth(nextWidth);
        }}>
          <ScrollView nestedScrollEnabled style={styles.canvasVerticalScroll} contentContainerStyle={styles.canvasVerticalContent} showsVerticalScrollIndicator>
            {renderCanvas()}
          </ScrollView>
        </View>
      </> : <View style={styles.noNewRoll}><Text style={styles.noNewRollText}>새 원본 롤 사용 없음 · 자투리 롤에서 전량 생산</Text></View>}
      {!compact && plan.remnantUses.length > 0 && <View style={styles.remnantSection}>
        <Text style={styles.remnantTitle}>자투리 롤 사용 도면</Text>
        {plan.remnantUses.map((use) => {
          const remnantHeight = Math.max(180, Math.min(460, (use.lengthMm / Math.max(use.widthMm, 1)) * 320));
          return <View key={use.remnantId} style={styles.remnantCard}>
            <Text style={styles.remnantMeta}>{use.remnantId} · 실제 {use.widthMm}×{use.lengthMm}mm · {use.producedQuantity}개 · 새 롤 {Math.round(use.savedNewRollLengthMm).toLocaleString()}mm 절감</Text>
            <Svg width="100%" height={remnantHeight} viewBox={`0 0 ${Math.max(use.widthMm, 1)} ${Math.max(use.result.usedLengthMm, 1)}`} accessibilityLabel={`${use.remnantId} 자투리 배치 도면`}>
              <Rect x={0} y={0} width={use.widthMm} height={Math.max(use.result.usedLengthMm, 1)} fill="#f0fdfa" stroke="#0f766e" strokeWidth={2} rx={4} />
              {use.placements.map((placement) => {
                const annotation = formatPlacementAnnotation(`${labelBySource.get(placement.sourceId) ?? '조각'} #${placement.id}`, placement.width, placement.height, placement.rotated);
                const centerX = placement.x + placement.width / 2;
                const centerY = placement.y + placement.height / 2;
                const labelFontSize = Math.max(10, Math.min(24, Math.min(placement.width, placement.height) * 0.2));
                return <G key={placement.id}>
                <Rect x={placement.x} y={placement.y} width={placement.width} height={placement.height} rx={3} fill={`${colorFor(placement.sourceId, sourceIds)}22`} stroke={colorFor(placement.sourceId, sourceIds)} strokeWidth={2} />
                <SvgText x={centerX} y={centerY} textAnchor="middle" fontSize={labelFontSize} fontWeight="900" fill={colorFor(placement.sourceId, sourceIds)}>{annotation.label}</SvgText>
                <SvgText x={centerX} y={centerY + labelFontSize * 0.9} textAnchor="middle" fontSize={Math.max(8, labelFontSize * 0.6)} fontWeight="700" fill="#334155">{annotation.dimensions}</SvgText>
              </G>;
              })}
            </Svg>
          </View>;
        })}
      </View>}
      {!compact && selected && <View style={styles.detail}>
        <Text style={styles.detailTitle}>제품 {selected.id} 상세</Text>
        <Text style={styles.detailText}>{labelBySource.get(selected.sourceId) ?? selected.sourceId} · {selected.width}×{selected.height}mm{selected.rotated ? ' · ↻' : ''} · 위치 ({selected.x}, {selected.y})mm</Text>
      </View>}
      {!compact && onToggleComplete && <TouchableOpacity accessibilityRole="button" accessibilityLabel="병합 롤 재단 완료 상태 변경" disabled={busy} onPress={onToggleComplete} style={[styles.completeButton, job?.isCuttingComplete && styles.completeButtonDone, busy && styles.disabled]}><Text style={[styles.completeButtonText, job?.isCuttingComplete && styles.completeButtonTextDone]}>{job?.isCuttingComplete ? '병합 롤 재단 완료 해제' : '병합 롤 재단 완료'}</Text></TouchableOpacity>}
      {!compact && !hidePlacementList && <MergedRollPlacementList plan={plan} job={job} busy={busy} sourceLabels={sourceLabels} sourceSubgroups={sourceSubgroups} onTogglePlacementComplete={onTogglePlacementComplete} />}
    </View>
  );
}

/**
 * The merged-roll piece list lives in the material-plan section so it has the
 * same placement-list position as a single-piece calculation.
 */
export function MergedRollPlacementList({ plan, job, busy = false, sourceLabels, sourceSubgroups, onTogglePlacementComplete }: Pick<Props, 'plan' | 'job' | 'busy' | 'sourceLabels' | 'sourceSubgroups' | 'onTogglePlacementComplete'>) {
  const sourceIds = [...new Set(plan.result.placements.map((placement) => placement.sourceId))];
  const [selectedId, setSelectedId] = React.useState<number | null>(null);
  const [collapsedGroups, setCollapsedGroups] = React.useState<Record<string, boolean>>({});
  const completedPlacementIds = new Set(job?.completedPlacementIds ?? []);
  const labelBySource = new Map(sourceIds.map((id, index) => [id, sourceLabels?.[id] ?? `${plan.groupNames[index] ?? `그룹 ${index + 1}`} · ${id}`]));
  const placementGroups = groupPlacementsBySubgroup(plan.result.placements, sourceSubgroups ?? {});
  return <View style={styles.listSection}>
    <Text style={styles.listTitle}>배치 목록</Text>
    <Text style={styles.listSubtitle}>총 {plan.result.placements.length}개 조각 · 소그룹 {placementGroups.length}개 · 병합 롤</Text>
    <View style={styles.list}>
      {placementGroups.map((group) => {
        const collapsed = collapsedGroups[group.id] === true;
        const completedCount = group.items.filter((placement) => completedPlacementIds.has(placement.id)).length;
        return <View key={group.id} style={styles.subgroupBlock}>
          <TouchableOpacity accessibilityRole="button" accessibilityLabel={`${group.title} 소그룹 ${collapsed ? '펼치기' : '접기'}`} onPress={() => setCollapsedGroups((current) => ({ ...current, [group.id]: !collapsed }))} style={styles.subgroupHeader}>
            <View><Text style={styles.subgroupTitle}>{group.title}</Text><Text style={styles.subgroupMeta}>{group.items.length}개 조각 · 완료 {completedCount}개</Text></View><Text style={styles.subgroupToggle}>{collapsed ? '▶' : '▼'}</Text>
          </TouchableOpacity>
          {!collapsed && group.items.map((placement) => {
            const completed = completedPlacementIds.has(placement.id);
            return <View key={placement.id} style={[styles.item, selectedId === placement.id && styles.itemActive, completed && styles.itemDone]}>
              <TouchableOpacity accessibilityRole="button" accessibilityLabel={`병합 조각 ${placement.id} 선택`} onPress={() => setSelectedId((current) => current === placement.id ? null : placement.id)} style={styles.itemMain}><View style={[styles.itemDot, { backgroundColor: colorFor(placement.sourceId, sourceIds) }]} /><Text style={styles.itemText}>#{placement.id} · {labelBySource.get(placement.sourceId) ?? placement.sourceId} · {placement.width}×{placement.height}mm{placement.rotated ? ' · ↻' : ''}</Text></TouchableOpacity>
              <TouchableOpacity accessibilityRole="checkbox" accessibilityLabel={`병합 조각 ${placement.id} 재단 완료`} accessibilityState={{ checked: completed, disabled: !onTogglePlacementComplete || busy }} disabled={!onTogglePlacementComplete || busy} onPress={() => onTogglePlacementComplete?.(placement.id)} style={[styles.checkButton, completed && styles.checkButtonDone]}><Text style={[styles.checkText, completed && styles.checkTextDone]}>{completed ? '✓' : ''}</Text></TouchableOpacity>
            </View>;
          })}
        </View>;
      })}
    </View>
  </View>;
}

const styles = StyleSheet.create({
  wrap: { marginTop: 12, padding: 13, borderRadius: 12, borderWidth: 1, borderColor: '#99f6e4', backgroundColor: '#fff' },
  heading: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 },
  copy: { flex: 1 }, title: { fontSize: 12, fontWeight: '800', color: '#115e59' }, meta: { marginTop: 3, fontSize: 10, color: '#64748b' }, badge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999, fontSize: 10, fontWeight: '800', color: '#0f766e', backgroundColor: '#ccfbf1' },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 10 }, legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 }, dot: { width: 9, height: 9, borderRadius: 5 }, legendText: { maxWidth: 220, fontSize: 10, color: '#475569' },
  zoomRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10, marginBottom: 2 }, zoomLabel: { marginRight: 2, fontSize: 10, fontWeight: '800', color: '#475569' }, zoomButton: { width: 30, height: 30, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 7, backgroundColor: '#fff' }, zoomButtonText: { fontSize: 18, lineHeight: 20, color: '#0f172a' }, zoomValue: { minWidth: 42, textAlign: 'center', fontSize: 10, fontWeight: '800', color: '#0f766e' }, zoomFitButton: { minHeight: 30, paddingHorizontal: 9, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#99f6e4', borderRadius: 7, backgroundColor: '#f0fdfa' }, zoomFitText: { fontSize: 10, fontWeight: '800', color: '#0f766e' }, canvasFrame: { width: '100%', marginTop: 9, overflow: 'hidden', borderRadius: 9, backgroundColor: '#f8fafc' }, canvasVerticalScroll: { width: '100%', maxHeight: 400, borderRadius: 9, backgroundColor: '#f8fafc' }, canvasVerticalContent: { minHeight: 240, alignItems: 'center' }, canvas: { overflow: 'hidden', borderRadius: 9 },
  noNewRoll: { marginTop: 11, minHeight: 72, alignItems: 'center', justifyContent: 'center', borderRadius: 9, backgroundColor: '#ecfdf5' }, noNewRollText: { fontSize: 11, fontWeight: '800', color: '#047857' },
  detail: { marginTop: 9, padding: 10, borderRadius: 8, backgroundColor: '#f1f5f9' }, detailTitle: { fontSize: 11, fontWeight: '800', color: '#334155' }, detailText: { marginTop: 3, fontSize: 10, lineHeight: 15, color: '#475569' },
  remnantSection: { marginTop: 12, gap: 8 }, remnantTitle: { fontSize: 11, fontWeight: '800', color: '#0f766e' }, remnantCard: { padding: 9, borderRadius: 8, borderWidth: 1, borderColor: '#99f6e4', backgroundColor: '#f0fdfa' }, remnantMeta: { marginBottom: 6, fontSize: 10, lineHeight: 15, color: '#0f766e' },
  listSection: { marginTop: 12, paddingTop: 11, borderTopWidth: 1, borderTopColor: '#ccfbf1' }, listTitle: { fontSize: 12, fontWeight: '800', color: '#115e59' }, listSubtitle: { marginTop: 3, fontSize: 10, color: '#64748b' }, list: { gap: 7, marginTop: 8 }, subgroupBlock: { gap: 5 }, subgroupHeader: { minHeight: 42, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 9, borderRadius: 7, backgroundColor: '#ecfeff' }, subgroupTitle: { fontSize: 11, fontWeight: '900', color: '#0f766e' }, subgroupMeta: { marginTop: 2, fontSize: 9, color: '#0f766e' }, subgroupToggle: { fontSize: 12, fontWeight: '900', color: '#0f766e' }, item: { minHeight: 38, flexDirection: 'row', alignItems: 'center', gap: 6, paddingLeft: 8, paddingRight: 5, borderRadius: 7, backgroundColor: '#f8fafc' }, itemMain: { minHeight: 36, flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 }, itemActive: { backgroundColor: '#e0f2fe' }, itemDone: { backgroundColor: '#f0fdf4' }, itemDot: { width: 7, height: 7, borderRadius: 4 }, itemText: { flex: 1, fontSize: 10, color: '#475569' }, checkButton: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 7, backgroundColor: '#fff' }, checkButtonDone: { borderColor: '#16a34a', backgroundColor: '#dcfce7' }, checkText: { fontSize: 16, fontWeight: '900', color: '#94a3b8' }, checkTextDone: { color: '#15803d' },
  completeButton: { minHeight: 40, alignItems: 'center', justifyContent: 'center', marginTop: 10, borderRadius: 8, backgroundColor: '#047857' }, completeButtonDone: { backgroundColor: '#dcfce7' }, completeButtonText: { fontSize: 11, fontWeight: '800', color: '#fff' }, completeButtonTextDone: { color: '#166534' }, disabled: { opacity: 0.45 },
});
