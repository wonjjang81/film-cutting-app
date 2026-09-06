import Svg, { G, Line, Rect, Text as SvgText } from 'react-native-svg';
import * as React from 'react';
import { Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { FilmLayoutResult } from './optimizeFilmLayout';
import type { ContinuousRollResult } from './optimizeContinuousRollLayout';
import { completionCrossMetrics, formatPlacementAnnotation, formatPlacementInfo } from './previewAnnotationModel';

export { createLayoutSvgMarkup } from './createLayoutSvgMarkup';

type Props = {
  result: ContinuousRollResult | FilmLayoutResult | null;
  rollWidthMm: number;
  rollLengthMm?: number;
  marginMm?: number;
  sideMarginMm?: number;
  startEndMarginMm?: number;
  completedPlacementIds?: readonly number[];
  pieceLabel?: string;
};

export function FilmLayoutPreview({ result, rollWidthMm, rollLengthMm, marginMm, sideMarginMm, startEndMarginMm, completedPlacementIds = [], pieceLabel }: Props) {
  const [viewportWidth, setViewportWidth] = React.useState(640);
  const [zoom, setZoom] = React.useState(1);
  const [selectedId, setSelectedId] = React.useState<number | null>(null);
  if (!result) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyIcon}>▦</Text>
        <Text style={styles.emptyTitle}>자동배치 미리보기</Text>
        <Text style={styles.emptyBody}>조건을 입력하고 최적 배치를 계산해 보세요.</Text>
      </View>
    );
  }

  const continuous = Boolean(result && 'overproduction' in result);
  const displayLengthMm = continuous ? (result as ContinuousRollResult).usedLengthMm : rollLengthMm ?? 0;
  const horizontalMarginMm = sideMarginMm ?? marginMm ?? 0;
  const verticalMarginMm = startEndMarginMm ?? marginMm ?? 0;
  const validSize = Number.isFinite(rollWidthMm) && rollWidthMm > 0
    && Number.isFinite(displayLengthMm) && displayLengthMm > 0
    && Number.isFinite(horizontalMarginMm) && horizontalMarginMm >= 0
    && Number.isFinite(verticalMarginMm) && verticalMarginMm >= 0
    && rollWidthMm - horizontalMarginMm * 2 > 0
    && displayLengthMm - verticalMarginMm * 2 > 0;
  if (!validSize) return null;
  const fontSize = Math.max(14, Math.min(32, Math.min(rollWidthMm, displayLengthMm) / 12));
  const baseHeight = Math.max(300, (displayLengthMm / rollWidthMm) * viewportWidth);
  const drawingHeight = baseHeight * zoom;
  const viewBoxWidth = rollWidthMm / zoom;
  const viewBoxX = (rollWidthMm - viewBoxWidth) / 2;
  const rowSeparators = continuous
    ? (result as ContinuousRollResult).rowSequence.map((row) => ({ label: row.pattern, y: row.endY }))
    : [];

  return (
    <View style={styles.previewWrap}>
      <View style={styles.legendRow}>
        <View style={styles.legendItem}><View style={[styles.dot, { backgroundColor: '#2563eb' }]} /><Text style={styles.legendText}>기본 방향</Text></View>
        <View style={styles.legendItem}><View style={[styles.dot, { backgroundColor: '#14b8a6' }]} /><Text style={styles.legendText}>↻</Text></View>
      </View>
      <View style={styles.zoomRow} accessibilityLabel="자동배치 도면 확대 축소">
        <Text style={styles.zoomLabel}>확대/축소</Text>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="자동배치 도면 축소" onPress={() => setZoom((value) => Math.max(0.75, Math.round((value - 0.1) * 10) / 10))} style={styles.zoomButton}><Text style={styles.zoomButtonText}>−</Text></TouchableOpacity>
        <Text style={styles.zoomValue}>{Math.round(zoom * 100)}%</Text>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="자동배치 도면 확대" onPress={() => setZoom((value) => Math.min(1.5, Math.round((value + 0.1) * 10) / 10))} style={styles.zoomButton}><Text style={styles.zoomButtonText}>＋</Text></TouchableOpacity>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="자동배치 도면 화면 폭 맞춤" onPress={() => setZoom(1)} style={styles.zoomFitButton}><Text style={styles.zoomFitText}>폭 맞춤</Text></TouchableOpacity>
      </View>
      <View style={styles.canvasFrame} onLayout={(event) => {
        const nextWidth = event.nativeEvent.layout.width;
        if (nextWidth > 0 && Math.abs(nextWidth - viewportWidth) > 1) setViewportWidth(nextWidth);
      }}>
        <ScrollView style={styles.canvasScroll} contentContainerStyle={styles.canvasScrollContent} nestedScrollEnabled showsVerticalScrollIndicator>
        <View style={[styles.canvas, { height: drawingHeight, width: viewportWidth }]}>
        <Svg width={viewportWidth} height={drawingHeight} viewBox={`${viewBoxX} 0 ${viewBoxWidth} ${displayLengthMm}`} accessibilityLabel="필름 자동배치 도면">
          <Rect x={0} y={0} width={rollWidthMm} height={displayLengthMm} fill="#f8fafc" stroke="#334155" strokeWidth={Math.max(1, rollWidthMm / 350)} rx={4} />
          {(horizontalMarginMm > 0 || verticalMarginMm > 0) && (
            <Rect x={horizontalMarginMm} y={verticalMarginMm} width={rollWidthMm - horizontalMarginMm * 2} height={displayLengthMm - verticalMarginMm * 2}
              fill="none" stroke="#f59e0b" strokeDasharray="8 5" strokeWidth={Math.max(1, rollWidthMm / 500)} />
          )}
          {rowSeparators.map((separator, index) => (
            <G key={`${separator.label}-${index}`}>
              <Rect x={horizontalMarginMm} y={separator.y} width={rollWidthMm - horizontalMarginMm * 2} height={Math.max(0.6, rollWidthMm / 1000)} fill="#94a3b8" opacity={0.7} />
              <SvgText x={rollWidthMm - horizontalMarginMm} y={separator.y - 2} textAnchor="end" fontSize={Math.max(7, fontSize * 0.7)} fill="#64748b">{separator.label}</SvgText>
            </G>
          ))}
          {result.placements.map((item) => (
            <G key={item.id} onPress={() => setSelectedId((current) => current === item.id ? null : item.id)} accessibilityLabel={`조각 ${item.id} 상세 보기`}>
              {(() => {
                const annotation = formatPlacementAnnotation(pieceLabel ?? `조각 #${item.id}`, item.width, item.height, item.rotated);
                const labelFontSize = Math.max(11, Math.min(30, Math.min(item.width, item.height) * 0.2));
                const dimensionFontSize = Math.max(9, Math.min(22, labelFontSize * 0.62));
                const centerX = item.x + item.width / 2;
                const centerY = item.y + item.height / 2;
                return <>
              <Rect x={item.x} y={item.y} width={item.width} height={item.height} rx={2}
                fill={item.rotated ? '#ccfbf1' : '#dbeafe'} stroke={item.rotated ? '#0f766e' : '#1d4ed8'} strokeWidth={Math.max(0.8, rollWidthMm / 700)} />
              <SvgText x={centerX} y={centerY - dimensionFontSize * 0.15} textAnchor="middle" fontSize={labelFontSize} fontWeight="900" fill={item.rotated ? '#115e59' : '#1e3a8a'}>{annotation.label}</SvgText>
              <SvgText x={centerX} y={centerY + labelFontSize * 0.9} textAnchor="middle" fontSize={dimensionFontSize} fontWeight="700" fill="#334155">{annotation.dimensions}</SvgText>
              {completedPlacementIds.includes(item.id) && <G accessibilityLabel={`제품 ${item.id} 재단 완료 표시`}>
                {(() => {
                  const cross = completionCrossMetrics(item.width, item.height);
                  return <>
                    <Line x1={item.x + cross.inset} y1={item.y + cross.inset} x2={item.x + item.width - cross.inset} y2={item.y + item.height - cross.inset} stroke="#dc2626" strokeWidth={cross.strokeWidth} strokeLinecap="round" />
                    <Line x1={item.x + item.width - cross.inset} y1={item.y + cross.inset} x2={item.x + cross.inset} y2={item.y + item.height - cross.inset} stroke="#dc2626" strokeWidth={cross.strokeWidth} strokeLinecap="round" />
                  </>;
                })()}
              </G>}
                </>;
              })()}
            </G>
          ))}
        </Svg>
        </View>
        </ScrollView>
      </View>
      <Modal visible={selectedId !== null} transparent animationType="fade" onRequestClose={() => setSelectedId(null)}>
        <View style={styles.modalBackdrop}>
          {(() => {
            const selected = result.placements.find((item) => item.id === selectedId);
            if (!selected) return null;
            const info = formatPlacementInfo(pieceLabel ?? `조각 #${selected.id}`, selected.width, selected.height, selected.rotated, selected.x, selected.y);
            return <View style={styles.modalCard} accessibilityViewIsModal accessibilityLabel="조각 정보 팝업">
              <Text style={styles.modalEyebrow}>PLACEMENT DETAIL</Text>
              <Text style={styles.modalTitle}>조각 정보</Text>
              <Text style={styles.modalLabel}>{info.label}</Text>
              <Text style={styles.modalValue}>{info.dimensions}</Text>
              <Text style={styles.modalMeta}>{info.rotation} · {info.position}</Text>
              <TouchableOpacity accessibilityRole="button" accessibilityLabel="조각 정보 팝업 닫기" onPress={() => setSelectedId(null)} style={styles.modalClose}><Text style={styles.modalCloseText}>닫기</Text></TouchableOpacity>
            </View>;
          })()}
        </View>
      </Modal>
      <Text style={styles.caption}>{continuous ? '연속 롤 기준 · 구분선은 행 패턴 경계입니다.' : '첫 번째 원단 기준 · 숫자는 재단 순번입니다.'}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  empty: { minHeight: 360, alignItems: 'center', justifyContent: 'center', padding: 24 },
  emptyIcon: { fontSize: 46, color: '#94a3b8' },
  emptyTitle: { marginTop: 14, fontSize: 18, fontWeight: '700', color: '#334155' },
  emptyBody: { marginTop: 7, textAlign: 'center', color: '#64748b' },
  previewWrap: { flex: 1, minHeight: 360 },
  legendRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 16, marginBottom: 14 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  legendText: { fontSize: 13, color: '#475569' },
  zoomRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }, zoomLabel: { marginRight: 2, fontSize: 11, fontWeight: '800', color: '#475569' }, zoomButton: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 8, backgroundColor: '#fff' }, zoomButtonText: { fontSize: 19, lineHeight: 21, color: '#0f172a' }, zoomValue: { minWidth: 44, textAlign: 'center', fontSize: 11, fontWeight: '800', color: '#1d4ed8' }, zoomFitButton: { minHeight: 32, paddingHorizontal: 10, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#bfdbfe', borderRadius: 8, backgroundColor: '#eff6ff' }, zoomFitText: { fontSize: 11, fontWeight: '800', color: '#1d4ed8' }, canvasFrame: { width: '100%', overflow: 'hidden', borderRadius: 12, backgroundColor: '#f8fafc' }, canvasScroll: { width: '100%', maxHeight: 620, borderRadius: 12, backgroundColor: '#f8fafc' },
  canvasScrollContent: { flexGrow: 1, alignItems: 'center' },
  canvas: { minHeight: 300, overflow: 'hidden', borderRadius: 12, backgroundColor: '#f8fafc' },
  caption: { marginTop: 10, textAlign: 'center', fontSize: 12, color: '#64748b' },
  modalBackdrop: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20, backgroundColor: 'rgba(15, 23, 42, 0.45)' }, modalCard: { width: '100%', maxWidth: 360, padding: 20, borderRadius: 16, backgroundColor: '#fff', shadowColor: '#0f172a', shadowOpacity: 0.2, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 8 }, modalEyebrow: { fontSize: 10, letterSpacing: 1.4, fontWeight: '800', color: '#1d4ed8' }, modalTitle: { marginTop: 5, fontSize: 18, fontWeight: '900', color: '#0f172a' }, modalLabel: { marginTop: 15, fontSize: 16, fontWeight: '900', color: '#1e3a8a' }, modalValue: { marginTop: 6, fontSize: 15, fontWeight: '800', color: '#334155' }, modalMeta: { marginTop: 7, fontSize: 12, lineHeight: 18, color: '#64748b' }, modalClose: { minHeight: 40, marginTop: 18, alignItems: 'center', justifyContent: 'center', borderRadius: 9, backgroundColor: '#2563eb' }, modalCloseText: { fontSize: 12, fontWeight: '800', color: '#fff' },
});
