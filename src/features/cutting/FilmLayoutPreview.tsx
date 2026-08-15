import Svg, { G, Rect, Text as SvgText } from 'react-native-svg';
import { StyleSheet, Text, View } from 'react-native';
import type { FilmLayoutResult } from './optimizeFilmLayout';
import type { ContinuousRollResult } from './optimizeContinuousRollLayout';

type Props = {
  result: ContinuousRollResult | FilmLayoutResult | null;
  rollWidthMm: number;
  rollLengthMm?: number;
  marginMm?: number;
  sideMarginMm?: number;
  startEndMarginMm?: number;
};

export function FilmLayoutPreview({ result, rollWidthMm, rollLengthMm, marginMm, sideMarginMm, startEndMarginMm }: Props) {
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
  const validSize = rollWidthMm > 0 && displayLengthMm > 0;
  if (!validSize) return null;
  const fontSize = Math.max(8, Math.min(18, Math.min(rollWidthMm, displayLengthMm) / 22));
  const rowSeparators = continuous
    ? (result as ContinuousRollResult).rowSequence.map((row) => ({ label: row.pattern, y: row.endY }))
    : [];

  return (
    <View style={styles.previewWrap}>
      <View style={styles.legendRow}>
        <View style={styles.legendItem}><View style={[styles.dot, { backgroundColor: '#2563eb' }]} /><Text style={styles.legendText}>기본 방향</Text></View>
        <View style={styles.legendItem}><View style={[styles.dot, { backgroundColor: '#14b8a6' }]} /><Text style={styles.legendText}>90도 회전</Text></View>
      </View>
      <View style={styles.canvas}>
        <Svg width="100%" height="100%" viewBox={`0 0 ${rollWidthMm} ${displayLengthMm}`} accessibilityLabel="필름 자동배치 도면">
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
            <G key={item.id}>
              <Rect x={item.x} y={item.y} width={item.width} height={item.height} rx={2}
                fill={item.rotated ? '#ccfbf1' : '#dbeafe'} stroke={item.rotated ? '#0f766e' : '#1d4ed8'} strokeWidth={Math.max(0.8, rollWidthMm / 700)} />
              <SvgText x={item.x + item.width / 2} y={item.y + item.height / 2 + fontSize / 3}
                textAnchor="middle" fontSize={fontSize} fontWeight="700" fill={item.rotated ? '#115e59' : '#1e3a8a'}>
                {item.id}
              </SvgText>
            </G>
          ))}
        </Svg>
      </View>
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
  canvas: { flex: 1, minHeight: 300, overflow: 'hidden', borderRadius: 12, backgroundColor: '#f8fafc' },
  caption: { marginTop: 10, textAlign: 'center', fontSize: 12, color: '#64748b' },
});
