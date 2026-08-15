import Svg, { G, Rect, Text as SvgText } from 'react-native-svg';
import { StyleSheet, Text, View } from 'react-native';
import type { FilmLayoutResult } from './optimizeFilmLayout';

type Props = {
  result: FilmLayoutResult | null;
  rollWidthMm: number;
  rollLengthMm: number;
  marginMm: number;
};

export function FilmLayoutPreview({ result, rollWidthMm, rollLengthMm, marginMm }: Props) {
  if (!result) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyIcon}>▦</Text>
        <Text style={styles.emptyTitle}>자동배치 미리보기</Text>
        <Text style={styles.emptyBody}>조건을 입력하고 최적 배치를 계산해 보세요.</Text>
      </View>
    );
  }

  const validSize = rollWidthMm > 0 && rollLengthMm > 0;
  if (!validSize) return null;
  const fontSize = Math.max(8, Math.min(18, Math.min(rollWidthMm, rollLengthMm) / 22));

  return (
    <View style={styles.previewWrap}>
      <View style={styles.legendRow}>
        <View style={styles.legendItem}><View style={[styles.dot, { backgroundColor: '#2563eb' }]} /><Text style={styles.legendText}>기본 방향</Text></View>
        <View style={styles.legendItem}><View style={[styles.dot, { backgroundColor: '#14b8a6' }]} /><Text style={styles.legendText}>90도 회전</Text></View>
      </View>
      <View style={styles.canvas}>
        <Svg width="100%" height="100%" viewBox={`0 0 ${rollWidthMm} ${rollLengthMm}`} accessibilityLabel="필름 자동배치 도면">
          <Rect x={0} y={0} width={rollWidthMm} height={rollLengthMm} fill="#f8fafc" stroke="#334155" strokeWidth={Math.max(1, rollWidthMm / 350)} rx={4} />
          {marginMm > 0 && (
            <Rect x={marginMm} y={marginMm} width={rollWidthMm - marginMm * 2} height={rollLengthMm - marginMm * 2}
              fill="none" stroke="#f59e0b" strokeDasharray="8 5" strokeWidth={Math.max(1, rollWidthMm / 500)} />
          )}
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
      <Text style={styles.caption}>첫 번째 원단 기준 · 숫자는 재단 순번입니다.</Text>
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
