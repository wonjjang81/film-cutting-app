import * as React from 'react';
import Svg, { G, Line, Rect, Text as SvgText } from 'react-native-svg';
import { Dimensions, Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { MergedGroupPlan } from '../remnants/planGroupedPieces';
import type { SavedMergedCuttingJob } from '../library/models';
import { areAllPlacementListsCollapsed, toggleAllPlacementLists, groupPlacementsBySubgroup, placementCompletionControl } from './planningPlacementModel';
import { completionCrossMetrics, formatPlacementInfo, formatPlacementPreview, gridLinePositions, placementTextMetrics } from './previewAnnotationModel';

const COLORS = ['#2563eb', '#0f766e', '#c2410c', '#7c3aed', '#be123c', '#0369a1'];

type Props = {
  plan: MergedGroupPlan;
  job?: SavedMergedCuttingJob;
  busy?: boolean;
  onToggleComplete?(): void;
  onTogglePlacementComplete?(placementId: number): void;
  onMovePlacementToAnotherRoll?(placementId: number, targetRollIndex: number): number | null;
  onMovePlacementWithinRoll?(placementId: number, xMm: number, yMm: number): string | null;
  onReoptimize?(): void;
  onDragAutoScroll?(deltaY: number): void;
  canUndo?: boolean;
  canRedo?: boolean;
  canReset?: boolean;
  onUndo?(): void;
  onRedo?(): void;
  onReset?(): void;
  selectedRollIndex?: number;
  onSelectRoll?(rollIndex: number): void;
  hideHeading?: boolean;
  hideRollTabs?: boolean;
  hideControls?: boolean;
  compact?: boolean;
  hidePlacementList?: boolean;
  hideLegend?: boolean;
  continuousPageView?: boolean;
  completedPlacementIds?: readonly number[];
  sourceLabels?: Record<string, string>;
  sourceSubgroups?: Record<string, string>;
  sourceMajorGroups?: Record<string, string>;
  collapsedSubgroups?: Record<string, boolean>;
  onChangeCollapsedSubgroups?(collapsed: Record<string, boolean>): void;
};

function colorFor(sourceId: string, sourceIds: readonly string[]): string {
  const index = Math.max(0, sourceIds.indexOf(sourceId));
  return COLORS[index % COLORS.length] ?? '#2563eb';
}

export function MergedRollPreview({ plan, job, busy = false, onToggleComplete, onTogglePlacementComplete, onMovePlacementToAnotherRoll, onMovePlacementWithinRoll, onReoptimize, onDragAutoScroll, canUndo = false, canRedo = false, canReset = false, onUndo, onRedo, onReset, selectedRollIndex: controlledRollIndex, onSelectRoll, hideHeading = false, hideRollTabs = false, hideControls = false, compact = false, hidePlacementList = false, hideLegend = false, continuousPageView = false, completedPlacementIds: completedPlacementIdsOverride, sourceLabels, sourceSubgroups, sourceMajorGroups, collapsedSubgroups, onChangeCollapsedSubgroups }: Props) {
  const [localRollIndex, setLocalRollIndex] = React.useState(0);
  const selectedRollIndex = controlledRollIndex ?? localRollIndex;
  const selectRoll = (rollIndex: number) => { setLocalRollIndex(rollIndex); onSelectRoll?.(rollIndex); };
  const rolls = plan.rollResults?.length ? plan.rollResults : [plan.result];
  const result = rolls[Math.min(selectedRollIndex, rolls.length - 1)]!;
  const sourceIds = [...new Set(result.placements.map((placement) => placement.sourceId))];
  const [selectedId, setSelectedId] = React.useState<number | null>(null);
  const [moveError, setMoveError] = React.useState<string | null>(null);
  const [draggingId, setDraggingId] = React.useState<number | null>(null);
  const [dragDelta, setDragDelta] = React.useState({ x: 0, y: 0 });
  const dragStart = React.useRef({ x: 0, y: 0 });
  const dragScrollOffset = React.useRef(0);
  const [showEndMoveConfirm, setShowEndMoveConfirm] = React.useState(false);
  const [controlsVisible, setControlsVisible] = React.useState(true);
  const [lastMovedToRollIndex, setLastMovedToRollIndex] = React.useState<number | null>(null);
  const [viewportWidth, setViewportWidth] = React.useState(640);
  const [manualZoom, setManualZoom] = React.useState<number | null>(null);
  const selected = result.placements.find((placement) => placement.id === selectedId) ?? null;
  const dragging = result.placements.find((placement) => placement.id === draggingId) ?? null;
  const safeLength = Math.max(result.usedLengthMm, 1);
  const fitZoom = Math.max(0.75, (viewportWidth - 24) / viewportWidth);
  const zoom = manualZoom ?? fitZoom;
  const baseHeight = Math.max(240, (viewportWidth / 1220) * safeLength);
  const height = baseHeight * zoom;
  const viewBoxWidth = 1220 / zoom;
  const viewBoxX = (1220 - viewBoxWidth) / 2;
  const completedPlacementIds = new Set(completedPlacementIdsOverride ?? job?.completedPlacementIds ?? []);
  const labelBySource = new Map(sourceIds.map((id, index) => [id, sourceLabels?.[id] ?? `${plan.groupNames[index] ?? `그룹 ${index + 1}`} · ${id}`]));
  const gridXPositions = gridLinePositions(1220);
  const gridYPositions = gridLinePositions(safeLength);
  const majorLengthGridPositions = gridLinePositions(safeLength, 1_000);
  React.useEffect(() => {
    if (controlledRollIndex === undefined) setLocalRollIndex((current) => Math.max(0, Math.min(current, rolls.length - 1)));
    setLastMovedToRollIndex((current) => current === null || current >= rolls.length ? null : current);
  }, [controlledRollIndex, rolls.length]);
  const renderCanvas = () => <View style={[styles.canvas, { height, width: viewportWidth }]}>
    <Svg width={viewportWidth} height={height} viewBox={`${viewBoxX} 0 ${viewBoxWidth} ${safeLength}`} accessibilityLabel="병합 롤 배치 도면">
      <Rect x={0} y={0} width={1220} height={safeLength} fill="#f8fafc" stroke="#334155" strokeWidth={2} rx={4} />
      <G accessibilityLabel="100mm 모눈">
        {gridXPositions.map((x) => <Line key={`grid-x-${x}`} x1={x} y1={0} x2={x} y2={safeLength} stroke="#94a3b8" strokeWidth={1.35} strokeDasharray="10 10" opacity={0.35} />)}
        {gridYPositions.map((y) => <Line key={`grid-y-${y}`} x1={0} y1={y} x2={1220} y2={y} stroke="#94a3b8" strokeWidth={1.35} strokeDasharray="10 10" opacity={0.35} />)}
      </G>
      <G accessibilityLabel="1000mm 길이 기준선">
        {majorLengthGridPositions.map((y) => <Line key={`grid-major-y-${y}`} x1={0} y1={y} x2={1220} y2={y} stroke="#64748b" strokeWidth={3.2} strokeDasharray="18 8" opacity={0.62} />)}
      </G>
      {result.placements.map((placement) => {
        const color = colorFor(placement.sourceId, sourceIds);
        const active = selectedId === placement.id;
        const annotation = formatPlacementPreview(placement.id, placement.width, placement.height, placement.rotated);
        const { labelFontSize, dimensionFontSize, rotateText } = placementTextMetrics(placement.width, placement.height, annotation);
        const centerX = placement.x + placement.width / 2;
        const centerY = placement.y + placement.height / 2;
        return <G key={placement.id} onPress={() => { setMoveError(null); setSelectedId((current) => current === placement.id ? null : placement.id); }} accessibilityLabel={`병합 제품 ${placement.id} 상세 보기`}>
          <Rect x={placement.x} y={placement.y} width={placement.width} height={placement.height} rx={3} fill={`${color}22`} stroke={active ? '#0f172a' : color} strokeWidth={active ? 5 : 2} />
          <G transform={rotateText ? `rotate(90 ${centerX} ${centerY})` : undefined}>
            <SvgText x={centerX} y={centerY - dimensionFontSize * 0.2} textAnchor="middle" fontSize={labelFontSize} fontWeight="900" fill={color}>{annotation.label}</SvgText>
            <SvgText x={centerX} y={centerY + labelFontSize * 0.8} textAnchor="middle" fontSize={dimensionFontSize} fontWeight="700" fill="#334155">{annotation.dimensions}</SvgText>
          </G>
          {completedPlacementIds.has(placement.id) && <G accessibilityLabel={`제품 ${placement.id} 재단 완료 표시`}>
            {(() => {
              const cross = completionCrossMetrics(placement.width, placement.height);
              return <>
                <Line x1={placement.x + cross.insetX} y1={placement.y + cross.insetY} x2={placement.x + placement.width - cross.insetX} y2={placement.y + placement.height - cross.insetY} stroke="#dc2626" strokeWidth={cross.strokeWidth} strokeLinecap="round" />
                <Line x1={placement.x + placement.width - cross.insetX} y1={placement.y + cross.insetY} x2={placement.x + cross.insetX} y2={placement.y + placement.height - cross.insetY} stroke="#dc2626" strokeWidth={cross.strokeWidth} strokeLinecap="round" />
              </>;
            })()}
          </G>}
        </G>;
      })}
    </Svg>
    {dragging && (() => {
      const scaleX = viewportWidth / viewBoxWidth;
      const scaleY = height / safeLength;
      const pieceWidth = dragging.width * scaleX;
      const pieceHeight = dragging.height * scaleY;
      const handleWidth = Math.max(pieceWidth, 32);
      const handleHeight = Math.max(pieceHeight, 32);
      return <View accessibilityRole="button" accessibilityLabel={`조각 ${dragging.id} 수동 이동 손잡이`} onStartShouldSetResponder={() => true} onResponderTerminationRequest={() => false} onResponderGrant={(event) => { dragStart.current = { x: event.nativeEvent.pageX, y: event.nativeEvent.pageY }; dragScrollOffset.current = 0; setDragDelta({ x: 0, y: 0 }); setMoveError(null); }} onResponderMove={(event) => {
        const viewportY = (event.nativeEvent as unknown as { clientY?: number }).clientY ?? event.nativeEvent.pageY;
        const screenHeight = Dimensions.get('window').height;
        const scrollStep = viewportY < 92 ? -28 : viewportY > screenHeight - 112 ? 28 : 0;
        if (scrollStep !== 0 && onDragAutoScroll) {
          onDragAutoScroll(scrollStep);
          dragScrollOffset.current += scrollStep;
        }
        setDragDelta({ x: event.nativeEvent.pageX - dragStart.current.x, y: event.nativeEvent.pageY - dragStart.current.y + dragScrollOffset.current });
      }} onResponderRelease={(event) => {
        const deltaX = event.nativeEvent.pageX - dragStart.current.x;
        const deltaY = event.nativeEvent.pageY - dragStart.current.y + dragScrollOffset.current;
        dragScrollOffset.current = 0;
        setDragDelta({ x: 0, y: 0 });
        if (Math.abs(deltaX) + Math.abs(deltaY) < 2) { setShowEndMoveConfirm(true); return; }
        const error = onMovePlacementWithinRoll?.(dragging.id, dragging.x + deltaX / scaleX, dragging.y + deltaY / scaleY);
        if (error) setMoveError(error);
        else setMoveError(null);
      }} onResponderTerminate={() => { dragScrollOffset.current = 0; setDragDelta({ x: 0, y: 0 }); }} style={[styles.dragHandle, { left: (dragging.x - viewBoxX) * scaleX + (pieceWidth - handleWidth) / 2, top: dragging.y * scaleY + (pieceHeight - handleHeight) / 2, width: handleWidth, height: handleHeight, transform: [{ translateX: dragDelta.x }, { translateY: dragDelta.y }] }]}><Text style={styles.dragHandleText}>✥ #{dragging.id}</Text></View>;
    })()}
  </View>;

  return (
    <View style={styles.wrap} accessibilityLabel={`병합 ${plan.mergeGroupId} 롤 미리보기`}>
      {!hideHeading && <View style={styles.heading}>
        <View style={styles.copy}>
          <Text style={styles.title}>병합 롤 도면</Text>
          <Text style={styles.meta}>새 롤 {selectedRollIndex + 1}/{rolls.length} · 폭 1,220mm · 길이 {Math.round(result.usedLengthMm).toLocaleString()}mm · 이 롤 {result.producedQuantity}개 · 전체 {plan.producedQuantity}개</Text>
        </View>
        <Text style={styles.badge}>수율 {result.utilizationPercent}%</Text>
      </View>}
      {!compact && !hideControls && <View style={styles.controlPanel} accessibilityLabel="배치 미리보기 컨트롤 패널">
        <TouchableOpacity accessibilityRole="button" accessibilityLabel={`배치 컨트롤 ${controlsVisible ? '숨기기' : '보이기'}`} onPress={() => setControlsVisible((visible) => !visible)} style={styles.controlPanelHeader}><Text style={styles.controlPanelTitle}>배치 컨트롤</Text><Text style={styles.controlPanelToggle}>{controlsVisible ? '숨기기 ▲' : '보이기 ▼'}</Text></TouchableOpacity>
        {controlsVisible && <View style={styles.controlPanelActions}>
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="빈공간 우선 재배치" disabled={!onReoptimize || busy} onPress={() => { setDraggingId(null); onReoptimize?.(); }} style={[styles.controlButton, styles.controlButtonOptimize, (!onReoptimize || busy) && styles.disabled]}><Text style={[styles.controlButtonText, styles.controlButtonOptimizeText]}>빈공간 재배치</Text></TouchableOpacity>
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="배치 변경 이전으로 되돌리기" disabled={!canUndo || busy} onPress={() => { setDraggingId(null); onUndo?.(); }} style={[styles.controlButton, (!canUndo || busy) && styles.disabled]}><Text style={styles.controlButtonText}>↶ 이전</Text></TouchableOpacity>
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="배치 변경 이후 다시 적용" disabled={!canRedo || busy} onPress={() => { setDraggingId(null); onRedo?.(); }} style={[styles.controlButton, (!canRedo || busy) && styles.disabled]}><Text style={styles.controlButtonText}>↷ 이후</Text></TouchableOpacity>
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="배치 자동 계산 상태로 리셋" disabled={!canReset || busy} onPress={() => { setDraggingId(null); onReset?.(); }} style={[styles.controlButton, styles.controlButtonDanger, (!canReset || busy) && styles.disabled]}><Text style={[styles.controlButtonText, styles.controlButtonDangerText]}>배치 리셋</Text></TouchableOpacity>
          {lastMovedToRollIndex !== null && <TouchableOpacity accessibilityRole="button" accessibilityLabel={`마지막 이동 위치 ${lastMovedToRollIndex + 1}롤로 바로가기`} onPress={() => { selectRoll(lastMovedToRollIndex); setSelectedId(null); setDraggingId(null); }} style={[styles.controlButton, styles.controlButtonPrimary]}><Text style={[styles.controlButtonText, styles.controlButtonPrimaryText]}>이동 위치 · {lastMovedToRollIndex + 1}롤</Text></TouchableOpacity>}
        </View>}
      </View>}
      {!hideLegend && <View style={styles.legend}>
        {sourceIds.map((sourceId, index) => <View key={sourceId} style={styles.legendItem}><View style={[styles.dot, { backgroundColor: COLORS[index % COLORS.length] }]} /><Text style={styles.legendText}>{labelBySource.get(sourceId)}</Text></View>)}
      </View>}
      {!hideRollTabs && rolls.length > 1 && <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rollTabs}>{rolls.map((roll, index) => <TouchableOpacity key={index} accessibilityRole="tab" accessibilityLabel={`새 롤 ${index + 1} 도면 보기`} accessibilityState={{ selected: selectedRollIndex === index }} onPress={() => { selectRoll(index); setSelectedId(null); setDraggingId(null); }} style={[styles.rollTab, selectedRollIndex === index && styles.rollTabActive]}><Text style={[styles.rollTabText, selectedRollIndex === index && styles.rollTabTextActive]}>{index + 1}롤 · {Math.round(roll.usedLengthMm).toLocaleString()}mm</Text></TouchableOpacity>)}</ScrollView>}
      {dragging && <View style={styles.dragHintRow}><Text style={styles.dragHintText}>#{dragging.id}을 끌어 놓고, 현재 위치를 누르면 이동을 종료합니다.</Text><TouchableOpacity accessibilityRole="button" accessibilityLabel="수동 이동 취소" onPress={() => { setDraggingId(null); setMoveError(null); }}><Text style={styles.dragCancelText}>취소</Text></TouchableOpacity></View>}
      {moveError && dragging && <Text style={styles.dragErrorText}>{moveError}</Text>}
      {result.placements.length > 0 ? <>
        <View style={styles.zoomRow} accessibilityLabel="병합 도면 확대 축소">
          <Text style={styles.zoomLabel}>확대/축소</Text>
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="병합 도면 축소" onPress={() => setManualZoom(Math.max(0.75, Math.round((zoom - 0.1) * 100) / 100))} style={styles.zoomButton}><Text style={styles.zoomButtonText}>−</Text></TouchableOpacity>
          <Text style={styles.zoomValue}>{Math.round(zoom * 100)}%</Text>
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="병합 도면 확대" onPress={() => setManualZoom(Math.min(1.5, Math.round((zoom + 0.1) * 100) / 100))} style={styles.zoomButton}><Text style={styles.zoomButtonText}>＋</Text></TouchableOpacity>
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="병합 도면 화면 폭 맞춤" onPress={() => setManualZoom(null)} style={styles.zoomFitButton}><Text style={styles.zoomFitText}>폭 맞춤</Text></TouchableOpacity>
        </View>
        <View style={styles.canvasFrame} onLayout={(event) => {
          const nextWidth = event.nativeEvent.layout.width;
          if (nextWidth > 0 && Math.abs(nextWidth - viewportWidth) > 1) setViewportWidth(nextWidth);
        }}>
          {continuousPageView ? renderCanvas() : <ScrollView nestedScrollEnabled style={styles.canvasVerticalScroll} contentContainerStyle={styles.canvasVerticalContent} showsVerticalScrollIndicator>
            {renderCanvas()}
          </ScrollView>}
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
                const annotation = formatPlacementPreview(placement.id, placement.width, placement.height, placement.rotated);
                const centerX = placement.x + placement.width / 2;
                const centerY = placement.y + placement.height / 2;
                const { labelFontSize, dimensionFontSize, rotateText } = placementTextMetrics(placement.width, placement.height, annotation);
                return <G key={placement.id}>
                <Rect x={placement.x} y={placement.y} width={placement.width} height={placement.height} rx={3} fill={`${colorFor(placement.sourceId, sourceIds)}22`} stroke={colorFor(placement.sourceId, sourceIds)} strokeWidth={2} />
                <G transform={rotateText ? `rotate(90 ${centerX} ${centerY})` : undefined}>
                  <SvgText x={centerX} y={centerY - dimensionFontSize * 0.2} textAnchor="middle" fontSize={labelFontSize} fontWeight="900" fill={colorFor(placement.sourceId, sourceIds)}>{annotation.label}</SvgText>
                  <SvgText x={centerX} y={centerY + labelFontSize * 0.8} textAnchor="middle" fontSize={dimensionFontSize} fontWeight="700" fill="#334155">{annotation.dimensions}</SvgText>
                </G>
              </G>;
              })}
            </Svg>
          </View>;
        })}
      </View>}
      {!compact && <Modal visible={selected !== null} transparent animationType="fade" onRequestClose={() => setSelectedId(null)}>
        <View style={styles.modalBackdrop}>
          {selected && (() => {
            const info = formatPlacementInfo(labelBySource.get(selected.sourceId) ?? selected.sourceId, selected.width, selected.height, selected.rotated, selected.x, selected.y);
            const completion = placementCompletionControl(completedPlacementIds.has(selected.id), busy, Boolean(onTogglePlacementComplete));
            return <View style={styles.modalCard} accessibilityViewIsModal accessibilityLabel="병합 조각 정보 팝업">
              <Text style={styles.modalEyebrow}>PLACEMENT DETAIL</Text>
              <Text style={styles.modalTitle}>조각 정보 · #{selected.id}</Text>
              <Text style={styles.modalLabel}>{info.label}</Text>
              <Text style={styles.modalValue}>{info.dimensions}</Text>
              <Text style={styles.modalMeta}>{info.rotation} · {info.position}</Text>
              {onMovePlacementWithinRoll && <TouchableOpacity accessibilityRole="button" accessibilityLabel={`${info.label} 현재 롤에서 수동 이동`} disabled={busy} onPress={() => { setDraggingId(selected.id); setSelectedId(null); setMoveError(null); }} style={[styles.modalMove, busy && styles.disabled]}><Text style={styles.modalMoveText}>현재 롤에서 끌어서 이동</Text></TouchableOpacity>}
              {rolls.length > 1 && <ScrollView style={styles.modalRollChoices} nestedScrollEnabled>{rolls.map((roll, index) => index === selectedRollIndex ? null : <TouchableOpacity key={index} accessibilityRole="button" accessibilityLabel={`${info.label} ${index + 1}롤 빈공간으로 자동배치`} disabled={busy || !onMovePlacementToAnotherRoll} onPress={() => { const targetRollIndex = onMovePlacementToAnotherRoll?.(selected.id, index); if (targetRollIndex !== null && targetRollIndex !== undefined) { setLastMovedToRollIndex(targetRollIndex); setSelectedId(null); setMoveError(null); } else { setMoveError(`${index + 1}롤에 배치 가능한 공간이 없습니다.`); } }} style={[styles.modalMove, (busy || !onMovePlacementToAnotherRoll) && styles.disabled]}><Text style={styles.modalMoveText}>{index + 1}롤로 이동 · 현재 {Math.round(roll.usedLengthMm).toLocaleString()}mm</Text></TouchableOpacity>)}</ScrollView>}
              {moveError && <Text style={styles.modalMoveError}>{moveError}</Text>}
              <TouchableOpacity accessibilityRole="checkbox" accessibilityLabel={`${info.label} 재단 완료`} accessibilityState={{ checked: completion.checked, disabled: completion.disabled }} disabled={completion.disabled} onPress={() => onTogglePlacementComplete?.(selected.id)} style={[styles.modalComplete, completion.checked && styles.modalCompleteDone, completion.disabled && styles.disabled]}><Text style={[styles.modalCompleteText, completion.checked && styles.modalCompleteTextDone]}>{completion.checked ? '✓ ' : '○ '}{completion.label}</Text></TouchableOpacity>
              <TouchableOpacity accessibilityRole="button" accessibilityLabel="조각 정보 팝업 닫기" onPress={() => setSelectedId(null)} style={styles.modalClose}><Text style={styles.modalCloseText}>닫기</Text></TouchableOpacity>
            </View>;
          })()}
        </View>
      </Modal>}
      {!compact && <Modal visible={showEndMoveConfirm} transparent animationType="fade" onRequestClose={() => setShowEndMoveConfirm(false)}>
        <View style={styles.modalBackdrop}><View style={styles.modalCard} accessibilityViewIsModal accessibilityLabel="수동 이동 종료 확인 팝업">
          <Text style={styles.modalEyebrow}>MANUAL PLACEMENT</Text>
          <Text style={styles.modalTitle}>현재 위치에서 이동을 종료할까요?</Text>
          <Text style={styles.modalMeta}>조각을 더 옮기려면 계속 이동을 선택하세요.</Text>
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="현재 위치에서 조각 이동 종료" onPress={() => { setDraggingId(null); setShowEndMoveConfirm(false); setMoveError(null); }} style={styles.modalClose}><Text style={styles.modalCloseText}>이동 종료</Text></TouchableOpacity>
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="조각 이동 계속" onPress={() => setShowEndMoveConfirm(false)} style={styles.modalSecondary}><Text style={styles.modalSecondaryText}>계속 이동</Text></TouchableOpacity>
        </View></View>
      </Modal>}
      {!compact && onToggleComplete && <TouchableOpacity accessibilityRole="button" accessibilityLabel="병합 롤 재단 완료 상태 변경" disabled={busy} onPress={onToggleComplete} style={[styles.completeButton, job?.isCuttingComplete && styles.completeButtonDone, busy && styles.disabled]}><Text style={[styles.completeButtonText, job?.isCuttingComplete && styles.completeButtonTextDone]}>{job?.isCuttingComplete ? '병합 롤 재단 완료 해제' : '병합 롤 재단 완료'}</Text></TouchableOpacity>}
      {!compact && !hidePlacementList && <MergedRollPlacementList plan={plan} job={job} busy={busy} completedPlacementIds={completedPlacementIdsOverride} sourceLabels={sourceLabels} sourceSubgroups={sourceSubgroups} sourceMajorGroups={sourceMajorGroups} onTogglePlacementComplete={onTogglePlacementComplete} collapsedSubgroups={collapsedSubgroups} onChangeCollapsedSubgroups={onChangeCollapsedSubgroups} />}
    </View>
  );
}

/**
 * The merged-roll piece list lives in the material-plan section so it has the
 * same placement-list position as a single-piece calculation.
 */
export function MergedRollPlacementList({ plan, job, busy = false, completedPlacementIds: completedPlacementIdsOverride, sourceLabels, sourceSubgroups, sourceMajorGroups, onTogglePlacementComplete, collapsedSubgroups, onChangeCollapsedSubgroups }: Pick<Props, 'plan' | 'job' | 'busy' | 'completedPlacementIds' | 'sourceLabels' | 'sourceSubgroups' | 'sourceMajorGroups' | 'onTogglePlacementComplete' | 'collapsedSubgroups' | 'onChangeCollapsedSubgroups'>) {
  const sourceIds = [...new Set(plan.result.placements.map((placement) => placement.sourceId))];
  const [selectedId, setSelectedId] = React.useState<number | null>(null);
  const [localCollapsedGroups, setLocalCollapsedGroups] = React.useState<Record<string, boolean>>({});
  const collapsedGroups = collapsedSubgroups ?? localCollapsedGroups;
  const setCollapsedGroups = onChangeCollapsedSubgroups ?? setLocalCollapsedGroups;
  const completedPlacementIds = new Set(completedPlacementIdsOverride ?? job?.completedPlacementIds ?? []);
  const labelBySource = new Map(sourceIds.map((id, index) => [id, sourceLabels?.[id] ?? `${plan.groupNames[index] ?? `그룹 ${index + 1}`} · ${id}`]));
  const rollNumberByPlacementId = new Map((plan.rollResults?.length ? plan.rollResults : [plan.result]).flatMap((roll, index) => roll.placements.map((placement) => [placement.id, index + 1] as const)));
  const placementGroups = groupPlacementsBySubgroup(plan.result.placements, sourceSubgroups ?? {}, '미분류', sourceMajorGroups);
  const subgroupIds = placementGroups.map((group) => group.id);
  const collapsed = areAllPlacementListsCollapsed(subgroupIds, collapsedGroups);
  const toggleCollapsed = () => setCollapsedGroups(toggleAllPlacementLists(subgroupIds, collapsedGroups));
  return <View style={styles.listSection}>
    <TouchableOpacity accessibilityRole="button" accessibilityLabel={`배치 목록 소그룹 모두 ${collapsed ? '펼치기' : '접기'}`} onPress={toggleCollapsed} style={styles.listHeader}>
      <View><Text style={styles.listTitle}>배치 목록</Text><Text style={styles.listSubtitle}>총 {plan.result.placements.length}개 조각 · 소그룹 {placementGroups.length}개 · 병합 롤</Text></View><Text style={styles.listToggle}>{collapsed ? '▶' : '▼'}</Text>
    </TouchableOpacity>
    <View style={styles.list}>
      {placementGroups.map((group) => {
        const collapsed = collapsedGroups[group.id] === true;
        const completedCount = group.items.filter((placement) => completedPlacementIds.has(placement.id)).length;
        return <View key={group.id} style={styles.subgroupBlock}>
          <TouchableOpacity accessibilityRole="button" accessibilityLabel={`${group.title} 소그룹 ${collapsed ? '펼치기' : '접기'}`} onPress={() => setCollapsedGroups({ ...collapsedGroups, [group.id]: !collapsed })} style={styles.subgroupHeader}>
            <View><Text style={styles.subgroupTitle}>{group.title}</Text><Text style={styles.subgroupMeta}>{group.items.length}개 조각 · 완료 {completedCount}개</Text></View><Text style={styles.subgroupToggle}>{collapsed ? '▶' : '▼'}</Text>
          </TouchableOpacity>
          {!collapsed && group.items.map((placement) => {
            const completed = completedPlacementIds.has(placement.id);
            return <View key={placement.id} style={[styles.item, selectedId === placement.id && styles.itemActive, completed && styles.itemDone]}>
              <TouchableOpacity accessibilityRole="button" accessibilityLabel={`병합 조각 ${placement.id} 선택`} onPress={() => setSelectedId((current) => current === placement.id ? null : placement.id)} style={styles.itemMain}><View style={[styles.itemDot, { backgroundColor: colorFor(placement.sourceId, sourceIds) }]} /><Text style={styles.itemText}>#{placement.id} · {rollNumberByPlacementId.get(placement.id) ?? 1}롤 · {labelBySource.get(placement.sourceId) ?? placement.sourceId} · {placement.width}×{placement.height}mm{placement.rotated ? ' · ↻' : ''}</Text></TouchableOpacity>
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
  controlPanel: { marginTop: 10, borderWidth: 1, borderColor: '#bfdbfe', borderRadius: 9, backgroundColor: '#eff6ff', overflow: 'hidden' },
  controlPanelHeader: { minHeight: 36, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 10 },
  controlPanelTitle: { fontSize: 11, fontWeight: '900', color: '#1e3a8a' }, controlPanelToggle: { fontSize: 10, fontWeight: '800', color: '#2563eb' },
  controlPanelActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingHorizontal: 8, paddingBottom: 8 },
  controlButton: { minHeight: 32, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10, borderWidth: 1, borderColor: '#bfdbfe', borderRadius: 7, backgroundColor: '#fff' },
  controlButtonText: { fontSize: 10, fontWeight: '900', color: '#1e3a8a' }, controlButtonOptimize: { borderColor: '#0f766e', backgroundColor: '#0f766e' }, controlButtonOptimizeText: { color: '#fff' }, controlButtonDanger: { borderColor: '#fecaca', backgroundColor: '#fff7f7' }, controlButtonDangerText: { color: '#b91c1c' }, controlButtonPrimary: { borderColor: '#2563eb', backgroundColor: '#2563eb' }, controlButtonPrimaryText: { color: '#fff' },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 10 }, legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 }, dot: { width: 9, height: 9, borderRadius: 5 }, legendText: { maxWidth: 220, fontSize: 10, color: '#475569' },
  zoomRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10, marginBottom: 2 }, zoomLabel: { marginRight: 2, fontSize: 10, fontWeight: '800', color: '#475569' }, zoomButton: { width: 30, height: 30, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 7, backgroundColor: '#fff' }, zoomButtonText: { fontSize: 18, lineHeight: 20, color: '#0f172a' }, zoomValue: { minWidth: 42, textAlign: 'center', fontSize: 10, fontWeight: '800', color: '#0f766e' }, zoomFitButton: { minHeight: 30, paddingHorizontal: 9, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#99f6e4', borderRadius: 7, backgroundColor: '#f0fdfa' }, zoomFitText: { fontSize: 10, fontWeight: '800', color: '#0f766e' }, canvasFrame: { width: '100%', marginTop: 9, overflow: 'hidden', borderRadius: 9, backgroundColor: '#f8fafc' }, canvasVerticalScroll: { width: '100%', maxHeight: 400, borderRadius: 9, backgroundColor: '#f8fafc' }, canvasVerticalContent: { minHeight: 240, alignItems: 'center' }, canvas: { overflow: 'hidden', borderRadius: 9 },
  dragHandle: { position: 'absolute', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderStyle: 'dashed', borderColor: '#2563eb', borderRadius: 4, backgroundColor: 'rgba(37, 99, 235, 0.24)' }, dragHandleText: { fontSize: 11, fontWeight: '900', color: '#1e3a8a', backgroundColor: '#eff6ff' }, dragHintRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 9, gap: 8 }, dragHintText: { flex: 1, fontSize: 11, fontWeight: '700', color: '#1d4ed8' }, dragCancelText: { paddingHorizontal: 8, paddingVertical: 4, fontSize: 11, fontWeight: '900', color: '#b91c1c' }, dragErrorText: { marginTop: 5, fontSize: 11, fontWeight: '700', color: '#b91c1c' },
  rollTabs: { flexDirection: 'row', gap: 6, marginTop: 10 }, rollTab: { minHeight: 30, justifyContent: 'center', paddingHorizontal: 10, borderRadius: 7, backgroundColor: '#e2e8f0' }, rollTabActive: { backgroundColor: '#0f766e' }, rollTabText: { fontSize: 10, fontWeight: '800', color: '#475569' }, rollTabTextActive: { color: '#fff' },
  noNewRoll: { marginTop: 11, minHeight: 72, alignItems: 'center', justifyContent: 'center', borderRadius: 9, backgroundColor: '#ecfdf5' }, noNewRollText: { fontSize: 11, fontWeight: '800', color: '#047857' },
  modalBackdrop: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20, backgroundColor: 'rgba(15, 23, 42, 0.45)' }, modalCard: { width: '100%', maxWidth: 360, padding: 20, borderRadius: 16, backgroundColor: '#fff', shadowColor: '#0f172a', shadowOpacity: 0.2, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 8 }, modalEyebrow: { fontSize: 10, letterSpacing: 1.4, fontWeight: '800', color: '#0f766e' }, modalTitle: { marginTop: 5, fontSize: 18, fontWeight: '900', color: '#0f172a' }, modalLabel: { marginTop: 15, fontSize: 16, fontWeight: '900', color: '#115e59' }, modalValue: { marginTop: 6, fontSize: 15, fontWeight: '800', color: '#334155' }, modalMeta: { marginTop: 7, fontSize: 12, lineHeight: 18, color: '#64748b' }, modalRollChoices: { maxHeight: 220 }, modalMove: { minHeight: 42, marginTop: 8, alignItems: 'center', justifyContent: 'center', borderRadius: 9, backgroundColor: '#2563eb' }, modalMoveText: { fontSize: 12, fontWeight: '900', color: '#fff' }, modalMoveError: { marginTop: 8, color: '#b91c1c', fontSize: 12, fontWeight: '700' }, modalComplete: { minHeight: 42, marginTop: 8, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#99f6e4', borderRadius: 9, backgroundColor: '#f0fdfa' }, modalCompleteDone: { borderColor: '#16a34a', backgroundColor: '#dcfce7' }, modalCompleteText: { fontSize: 13, fontWeight: '900', color: '#0f766e' }, modalCompleteTextDone: { color: '#15803d' }, modalClose: { minHeight: 40, marginTop: 8, alignItems: 'center', justifyContent: 'center', borderRadius: 9, backgroundColor: '#0f766e' }, modalCloseText: { fontSize: 12, fontWeight: '800', color: '#fff' },
  modalSecondary: { minHeight: 40, marginTop: 8, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 9, backgroundColor: '#fff' }, modalSecondaryText: { fontSize: 12, fontWeight: '800', color: '#475569' },
  remnantSection: { marginTop: 12, gap: 8 }, remnantTitle: { fontSize: 11, fontWeight: '800', color: '#0f766e' }, remnantCard: { padding: 9, borderRadius: 8, borderWidth: 1, borderColor: '#99f6e4', backgroundColor: '#f0fdfa' }, remnantMeta: { marginBottom: 6, fontSize: 10, lineHeight: 15, color: '#0f766e' },
  listSection: { marginTop: 12, paddingTop: 11, borderTopWidth: 1, borderTopColor: '#ccfbf1' }, listHeader: { minHeight: 42, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 9, borderRadius: 7, backgroundColor: '#ecfeff' }, listTitle: { fontSize: 12, fontWeight: '800', color: '#115e59' }, listSubtitle: { marginTop: 3, fontSize: 10, color: '#64748b' }, listToggle: { fontSize: 12, fontWeight: '900', color: '#0f766e' }, list: { gap: 7, marginTop: 8 }, subgroupBlock: { gap: 5 }, subgroupHeader: { minHeight: 42, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 9, borderRadius: 7, backgroundColor: '#ecfeff' }, subgroupTitle: { fontSize: 11, fontWeight: '900', color: '#0f766e' }, subgroupMeta: { marginTop: 2, fontSize: 9, color: '#0f766e' }, subgroupToggle: { fontSize: 12, fontWeight: '900', color: '#0f766e' }, item: { minHeight: 38, flexDirection: 'row', alignItems: 'center', gap: 6, paddingLeft: 8, paddingRight: 5, borderRadius: 7, backgroundColor: '#f8fafc' }, itemMain: { minHeight: 36, flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 }, itemActive: { backgroundColor: '#e0f2fe' }, itemDone: { backgroundColor: '#f0fdf4' }, itemDot: { width: 7, height: 7, borderRadius: 4 }, itemText: { flex: 1, fontSize: 10, color: '#475569' }, checkButton: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 7, backgroundColor: '#fff' }, checkButtonDone: { borderColor: '#16a34a', backgroundColor: '#dcfce7' }, checkText: { fontSize: 16, fontWeight: '900', color: '#94a3b8' }, checkTextDone: { color: '#15803d' },
  completeButton: { minHeight: 40, alignItems: 'center', justifyContent: 'center', marginTop: 10, borderRadius: 8, backgroundColor: '#047857' }, completeButtonDone: { backgroundColor: '#dcfce7' }, completeButtonText: { fontSize: 11, fontWeight: '800', color: '#fff' }, completeButtonTextDone: { color: '#166534' }, disabled: { opacity: 0.45 },
});
