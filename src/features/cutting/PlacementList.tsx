import { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View, type LayoutChangeEvent, type GestureResponderEvent } from 'react-native';
import type { ContinuousRollResult, Placement } from './optimizeContinuousRollLayout';
import { adjustManualPlacement, rotateManualPlacement } from './manualPlacement';

type Props = {
  result: ContinuousRollResult;
  rollWidthMm: number;
  sideMarginMm: number;
  startEndMarginMm: number;
  onPlacementsChange?: (placements: Placement[]) => void;
  onCheckedIdsChange?: (ids: number[]) => void;
  checkedPlacementIds?: readonly number[];
};

/** A compact production list: rows are the legacy "group" unit in the new roll planner. */
export function PlacementList({ result, rollWidthMm, sideMarginMm, startEndMarginMm, onPlacementsChange, onCheckedIdsChange, checkedPlacementIds = [] }: Props) {
  const [manual, setManual] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [placements, setPlacements] = useState<Placement[]>(result.placements);
  const [automaticPlacements, setAutomaticPlacements] = useState<Placement[]>(result.placements);
  const [checkedIds, setCheckedIds] = useState<Set<number>>(new Set());
  const [manualError, setManualError] = useState<string | null>(null);
  const [canvasWidth, setCanvasWidth] = useState(0);
  const dragRef = useRef<{ id: number; startX: number; startY: number; originX: number; originY: number } | null>(null);
  // Keep per-piece checks while the operator nudges coordinates; reset only for a new plan.
  useEffect(() => { setPlacements(result.placements); setAutomaticPlacements(result.placements); setSelectedId(null); setManual(false); const next = new Set(checkedPlacementIds.filter((id) => result.placements.some((placement) => placement.id === id))); setCheckedIds(next); onCheckedIdsChange?.([...next]); }, [result.usedLengthMm, result.producedQuantity, result.normalCount, result.rotatedCount, onCheckedIdsChange]);

  const groups = useMemo(() => {
    const sorted = [...placements].sort((a, b) => a.y - b.y || a.x - b.x || a.id - b.id);
    return result.rowSequence.map((row, index) => ({
      id: index + 1,
      row,
      items: sorted.filter((item) => item.y >= row.startY - 0.01 && item.y < row.endY - 0.01),
    })).filter((group) => group.items.length > 0);
  }, [placements, result.rowSequence]);

  const updatePlacement = (id: number, patch: Partial<Placement>) => {
    const current = placements.find((item) => item.id === id);
    if (!current) return;
    const adjusted = adjustManualPlacement(current, patch, placements, { rollWidthMm, usedLengthMm: result.usedLengthMm, sideMarginMm, startEndMarginMm });
    if (!adjusted.placement) { setManualError(adjusted.error ?? '배치할 수 없는 위치입니다.'); return; }
    setManualError(null);
    const next = placements.map((item) => item.id === id ? adjusted.placement! : item);
    setPlacements(next); onPlacementsChange?.(next);
  };
  const nudge = (axis: 'x' | 'y', amount: number) => {
    if (selectedId === null) return;
    const item = placements.find((candidate) => candidate.id === selectedId);
    if (!item) return;
    const maxX = Math.max(sideMarginMm, rollWidthMm - sideMarginMm - item.width);
    const maxY = Math.max(startEndMarginMm, result.usedLengthMm - startEndMarginMm - item.height);
    const value = axis === 'x'
      ? Math.min(maxX, Math.max(sideMarginMm, item.x + amount))
      : Math.min(maxY, Math.max(startEndMarginMm, item.y + amount));
    updatePlacement(selectedId, { [axis]: value });
  };
  const rotateSelected = () => {
    if (selectedId === null) return;
    const current = placements.find((item) => item.id === selectedId);
    if (!current) return;
    const adjusted = rotateManualPlacement(current, placements, { rollWidthMm, usedLengthMm: result.usedLengthMm, sideMarginMm, startEndMarginMm });
    if (!adjusted.placement) { setManualError(adjusted.error ?? '회전할 수 없는 조각입니다.'); return; }
    setManualError(null);
    const next = placements.map((item) => item.id === selectedId ? adjusted.placement! : item);
    setPlacements(next); onPlacementsChange?.(next);
  };
  const reset = () => { setPlacements(automaticPlacements); setManualError(null); onPlacementsChange?.(automaticPlacements); };
  const toggleChecked = (id: number) => {
    setCheckedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id); else next.add(id);
      onCheckedIdsChange?.([...next]);
      return next;
    });
  };
  const toggleAll = () => {
    const complete = checkedIds.size !== placements.length;
    const next = complete ? new Set(placements.map((item) => item.id)) : new Set<number>();
    setCheckedIds(next); onCheckedIdsChange?.([...next]);
  };

  const canvasHeight = Math.max(260, Math.min(620, (result.usedLengthMm / rollWidthMm) * Math.max(canvasWidth, 320)));
  const placementAt = (x: number, y: number) => [...placements].reverse().find((item) => x >= item.x && x <= item.x + item.width && y >= item.y && y <= item.y + item.height);
  const beginDrag = (event: GestureResponderEvent) => {
    if (!manual || canvasWidth <= 0) return;
    const { locationX, locationY } = event.nativeEvent;
    const scale = canvasWidth / rollWidthMm;
    const item = placementAt(locationX / scale, locationY / scale);
    if (!item) return;
    setSelectedId(item.id); setManualError(null);
    dragRef.current = { id: item.id, startX: locationX, startY: locationY, originX: item.x, originY: item.y };
  };
  const dragPlacement = (event: GestureResponderEvent) => {
    const drag = dragRef.current;
    if (!drag || canvasWidth <= 0) return;
    const scale = canvasWidth / rollWidthMm;
    const { locationX, locationY } = event.nativeEvent;
    updatePlacement(drag.id, { x: drag.originX + (locationX - drag.startX) / scale, y: drag.originY + (locationY - drag.startY) / scale });
  };
  const endDrag = () => { dragRef.current = null; };

  return <View style={styles.wrap}>
    <View style={styles.heading}><View><Text style={styles.title}>배치 목록</Text><Text style={styles.subtitle}>총 {placements.length}개 · {groups.length}개 그룹(행 패턴)</Text></View><TouchableOpacity accessibilityRole="button" onPress={() => setManual((value) => !value)} style={[styles.modeButton, manual && styles.modeButtonActive]}><Text style={[styles.modeText, manual && styles.modeTextActive]}>{manual ? '수동 배치 닫기' : '수동 배치'}</Text></TouchableOpacity></View>
    {manual && <View style={styles.manualBar}><Text style={styles.manualHelp}>목록에서 제품을 선택한 뒤 5mm 단위로 위치를 조정합니다. 겹침·롤 밖 배치는 차단됩니다.</Text><View style={styles.nudgeRow}><TouchableOpacity accessibilityLabel="왼쪽 이동" onPress={() => nudge('x', -5)} style={styles.nudge}><Text>←</Text></TouchableOpacity><TouchableOpacity accessibilityLabel="위로 이동" onPress={() => nudge('y', -5)} style={styles.nudge}><Text>↑</Text></TouchableOpacity><TouchableOpacity accessibilityLabel="아래로 이동" onPress={() => nudge('y', 5)} style={styles.nudge}><Text>↓</Text></TouchableOpacity><TouchableOpacity accessibilityLabel="오른쪽 이동" onPress={() => nudge('x', 5)} style={styles.nudge}><Text>→</Text></TouchableOpacity><TouchableOpacity accessibilityRole="button" accessibilityLabel="선택 조각 90도 회전" onPress={rotateSelected} style={{ minHeight: 32, justifyContent: 'center', paddingHorizontal: 9, borderRadius: 7, backgroundColor: '#0f766e' }}><Text style={{ fontSize: 10, fontWeight: '800', color: '#fff' }}>↻ 90°</Text></TouchableOpacity><TouchableOpacity accessibilityRole="button" onPress={reset} style={styles.reset}><Text style={styles.resetText}>자동 배치로 복원</Text></TouchableOpacity></View>{manualError && <Text style={{ marginTop: 7, fontSize: 10, fontWeight: '700', color: '#b91c1c' }}>{manualError}</Text>}</View>}
    <View style={styles.checkBar}><Text style={styles.checkText}>재단 완료 {checkedIds.size}/{placements.length}</Text><TouchableOpacity accessibilityRole="button" onPress={toggleAll} style={styles.checkAll}><Text style={styles.checkAllText}>{checkedIds.size === placements.length ? '전체 해제' : '전체 완료'}</Text></TouchableOpacity></View>
    {manual && <View style={styles.canvasWrap}><Text style={styles.canvasHint}>도면의 조각을 손가락·마우스로 끌어 5mm 단위로 이동할 수 있습니다.</Text><View accessibilityLabel="수동 배치 캔버스" onLayout={(event: LayoutChangeEvent) => setCanvasWidth(event.nativeEvent.layout.width)} onStartShouldSetResponder={() => true} onResponderGrant={beginDrag} onResponderMove={dragPlacement} onResponderRelease={endDrag} onResponderTerminate={endDrag} style={[styles.canvas, { height: canvasHeight }]}>{placements.map((item) => <View key={item.id} pointerEvents="none" style={[styles.canvasPiece, { left: `${(item.x / rollWidthMm) * 100}%`, top: `${(item.y / result.usedLengthMm) * 100}%`, width: `${(item.width / rollWidthMm) * 100}%`, height: `${(item.height / result.usedLengthMm) * 100}%` }, item.rotated && styles.canvasPieceRotated, selectedId === item.id && styles.canvasPieceSelected]}><Text style={styles.canvasPieceText}>{item.id}</Text></View>)}</View></View>}
    {groups.map((group) => <View key={group.id} style={styles.group}><View style={styles.groupHeading}><Text style={styles.groupTitle}>그룹 {group.id}</Text><Text style={styles.groupMeta}>{group.items.length}개 · Y {Math.round(group.row.startY)}–{Math.round(group.row.endY)}mm · {group.row.pattern}</Text></View>{group.items.map((item) => <View key={item.id} style={[styles.item, selectedId === item.id && styles.itemSelected]}><TouchableOpacity accessibilityLabel={`제품 ${item.id} 재단 완료`} accessibilityRole="checkbox" accessibilityState={{ checked: checkedIds.has(item.id) }} onPress={() => toggleChecked(item.id)} style={[styles.check, checkedIds.has(item.id) && styles.checkDone]}><Text style={[styles.checkMark, checkedIds.has(item.id) && styles.checkMarkDone]}>{checkedIds.has(item.id) ? '✓' : ''}</Text></TouchableOpacity><TouchableOpacity accessibilityRole="button" accessibilityState={{ selected: selectedId === item.id }} onPress={() => setSelectedId(item.id)} style={styles.itemMain}><View style={[styles.index, item.rotated && styles.indexRotated]}><Text style={styles.indexText}>{item.id}</Text></View><View style={styles.itemCopy}><Text style={[styles.itemTitle, checkedIds.has(item.id) && styles.itemTitleDone]}>{item.width} × {item.height} mm {item.rotated ? '· 90도 회전' : '· 기본 방향'}</Text><Text style={styles.itemMeta}>좌표 X {Math.round(item.x)} · Y {Math.round(item.y)} mm</Text></View></TouchableOpacity>{manual && selectedId === item.id && <View style={styles.editFields}><TextInput accessibilityLabel="수동 X 좌표" inputMode="decimal" keyboardType="numeric" value={String(Math.round(item.x))} onChangeText={(value) => { const parsed = Number(value); if (Number.isFinite(parsed)) updatePlacement(item.id, { x: parsed }); }} style={styles.coordInput} /><TextInput accessibilityLabel="수동 Y 좌표" inputMode="decimal" keyboardType="numeric" value={String(Math.round(item.y))} onChangeText={(value) => { const parsed = Number(value); if (Number.isFinite(parsed)) updatePlacement(item.id, { y: parsed }); }} style={styles.coordInput} /></View>}</View>)}</View>)}
  </View>;
}

const styles = StyleSheet.create({
  wrap: { marginTop: 18, padding: 16, borderRadius: 14, borderWidth: 1, borderColor: '#e2e8f0', backgroundColor: '#f8fafc' },
  heading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }, title: { fontSize: 16, fontWeight: '800', color: '#0f172a' }, subtitle: { marginTop: 3, fontSize: 11, color: '#64748b' },
  modeButton: { minHeight: 38, justifyContent: 'center', paddingHorizontal: 12, borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 9, backgroundColor: '#fff' }, modeButtonActive: { borderColor: '#2563eb', backgroundColor: '#eff6ff' }, modeText: { fontSize: 11, fontWeight: '800', color: '#334155' }, modeTextActive: { color: '#1d4ed8' },
  manualBar: { marginTop: 11, padding: 11, borderRadius: 10, backgroundColor: '#eff6ff' }, manualHelp: { fontSize: 11, lineHeight: 16, color: '#1e40af' }, nudgeRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginTop: 8 }, nudge: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center', borderRadius: 7, backgroundColor: '#fff' }, reset: { minHeight: 32, justifyContent: 'center', marginLeft: 3, paddingHorizontal: 9, borderRadius: 7, backgroundColor: '#1e3a8a' }, resetText: { fontSize: 10, fontWeight: '700', color: '#fff' },
  canvasWrap: { marginTop: 11, padding: 10, borderRadius: 10, borderWidth: 1, borderColor: '#bfdbfe', backgroundColor: '#fff' }, canvasHint: { marginBottom: 7, fontSize: 10, color: '#1e40af' }, canvas: { position: 'relative', width: '100%', overflow: 'hidden', borderRadius: 8, backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#94a3b8' }, canvasPiece: { position: 'absolute', alignItems: 'center', justifyContent: 'center', minWidth: 8, minHeight: 8, borderWidth: 1, borderColor: '#2563eb', borderRadius: 3, backgroundColor: '#bfdbfeaa' }, canvasPieceRotated: { borderColor: '#0f766e', backgroundColor: '#99f6e3aa' }, canvasPieceSelected: { borderWidth: 3, borderColor: '#0f172a' }, canvasPieceText: { fontSize: 10, fontWeight: '800', color: '#1e3a8a' },
  checkBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 12, paddingHorizontal: 3 }, checkText: { fontSize: 11, fontWeight: '700', color: '#475569' }, checkAll: { paddingHorizontal: 9, paddingVertical: 6, borderRadius: 7, backgroundColor: '#e2e8f0' }, checkAllText: { fontSize: 10, fontWeight: '800', color: '#334155' },
  group: { marginTop: 12, borderRadius: 10, borderWidth: 1, borderColor: '#e2e8f0', backgroundColor: '#fff', overflow: 'hidden' }, groupHeading: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingHorizontal: 11, paddingVertical: 9, backgroundColor: '#f1f5f9' }, groupTitle: { fontSize: 12, fontWeight: '800', color: '#334155' }, groupMeta: { fontSize: 10, color: '#64748b' }, item: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 10, borderTopWidth: 1, borderTopColor: '#f1f5f9' }, itemSelected: { backgroundColor: '#eff6ff' }, itemMain: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 9 }, check: { width: 23, height: 23, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 6, backgroundColor: '#fff' }, checkDone: { borderColor: '#059669', backgroundColor: '#059669' }, checkMark: { fontSize: 14, color: 'transparent' }, checkMarkDone: { color: '#fff' }, index: { width: 26, height: 26, alignItems: 'center', justifyContent: 'center', borderRadius: 7, backgroundColor: '#dbeafe' }, indexRotated: { backgroundColor: '#ccfbf1' }, indexText: { fontSize: 11, fontWeight: '800', color: '#1e3a8a' }, itemCopy: { flex: 1 }, itemTitle: { fontSize: 11, fontWeight: '700', color: '#334155' }, itemTitleDone: { color: '#047857', textDecorationLine: 'line-through' }, itemMeta: { marginTop: 3, fontSize: 10, color: '#64748b' }, editFields: { flexDirection: 'row', gap: 5 }, coordInput: { width: 47, height: 30, paddingHorizontal: 5, borderWidth: 1, borderColor: '#93c5fd', borderRadius: 6, fontSize: 10, textAlign: 'center', backgroundColor: '#fff' },
});
