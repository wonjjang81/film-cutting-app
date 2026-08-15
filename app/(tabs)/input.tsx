import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Switch, Text, TextInput, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { FilmLayoutPreview } from '../../src/features/cutting/FilmLayoutPreview';
import { FilmLayoutResult, optimizeFilmLayout } from '../../src/features/cutting/optimizeFilmLayout';

type FormKey = 'rollWidth' | 'rollLength' | 'pieceWidth' | 'pieceLength' | 'quantity' | 'gap' | 'margin';
type FormState = Record<FormKey, string>;

const initialForm: FormState = {
  rollWidth: '1000', rollLength: '2000', pieceWidth: '250', pieceLength: '500',
  quantity: '20', gap: '3', margin: '10',
};

const strategyNames: Record<FilmLayoutResult['strategy'], string> = {
  normal: '기본 방향', rotated: '전체 90도 회전', 'mixed-vertical': '세로 혼합 배치', 'mixed-horizontal': '가로 혼합 배치',
};

export default function FilmCutInputScreen() {
  const { width } = useWindowDimensions();
  const wide = width >= 920;
  const [form, setForm] = useState(initialForm);
  const [allowRotation, setAllowRotation] = useState(true);
  const [result, setResult] = useState<FilmLayoutResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const groups = useMemo(() => [
    { title: '원단 규격', description: '사용할 원단 한 장의 실제 크기', fields: [['rollWidth', '원단 폭'], ['rollLength', '원단 길이']] },
    { title: '제품 규격', description: '생산할 완제품의 재단 크기', fields: [['pieceWidth', '제품 폭'], ['pieceLength', '제품 길이'], ['quantity', '필요 수량']] },
    { title: '생산 조건', description: '칼날 간격과 가장자리 손실 반영', fields: [['gap', '제품 간격'], ['margin', '가장자리 여백']] },
  ] as const, []);

  const numeric = (key: FormKey) => Number(form[key]);
  const calculate = () => {
    try {
      const next = optimizeFilmLayout({
        rollWidthMm: numeric('rollWidth'), rollLengthMm: numeric('rollLength'),
        pieceWidthMm: numeric('pieceWidth'), pieceLengthMm: numeric('pieceLength'),
        quantity: numeric('quantity'), gapMm: numeric('gap'), marginMm: numeric('margin'), allowRotation,
      });
      setResult(next);
      setError(null);
    } catch (caught) {
      setResult(null);
      setError(caught instanceof Error ? caught.message : '입력값을 확인해 주세요.');
    }
  };

  const reset = () => { setForm(initialForm); setAllowRotation(true); setResult(null); setError(null); };

  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.pageContent} keyboardShouldPersistTaps="handled">
      <View style={styles.header}>
        <View>
          <Text style={styles.eyebrow}>FILM CUTTING OPTIMIZER</Text>
          <Text style={styles.title} accessibilityRole="header">필름 재단 계산기</Text>
          <Text style={styles.description}>원단 손실을 줄이는 최적 배치를 자동으로 계산합니다.</Text>
        </View>
        <TouchableOpacity accessibilityRole="button" onPress={reset} style={styles.resetButton}>
          <Text style={styles.resetText}>입력 초기화</Text>
        </TouchableOpacity>
      </View>

      <View style={[styles.workspace, wide && styles.workspaceWide]}>
        <View style={[styles.panel, styles.inputPanel, wide && styles.sidePanel]}>
          <View style={styles.panelHeader}>
            <View><Text style={styles.panelTitle}>입력 조건</Text><Text style={styles.panelSubtitle}>모든 치수 단위는 mm입니다.</Text></View>
            <View style={styles.stepBadge}><Text style={styles.stepText}>01</Text></View>
          </View>

          {groups.map((group) => (
            <View key={group.title} style={styles.group}>
              <Text style={styles.groupTitle}>{group.title}</Text>
              <Text style={styles.groupDescription}>{group.description}</Text>
              <View style={styles.fieldGrid}>
                {group.fields.map(([key, label]) => (
                  <View key={key} style={[styles.field, key === 'quantity' && styles.fullField]}>
                    <Text style={styles.label}>{label}</Text>
                    <View style={styles.inputWrap}>
                      <TextInput accessibilityLabel={`${label} 밀리미터`} inputMode="decimal" keyboardType="numeric"
                        selectTextOnFocus style={styles.input} value={form[key]}
                        onChangeText={(value) => setForm((current) => ({ ...current, [key]: value.replace(/[^0-9.]/g, '') }))} />
                      <Text style={styles.unit}>{key === 'quantity' ? '개' : 'mm'}</Text>
                    </View>
                  </View>
                ))}
              </View>
            </View>
          ))}

          <View style={styles.switchCard}>
            <View style={styles.switchCopy}><Text style={styles.switchTitle}>90도 회전 허용</Text><Text style={styles.switchDescription}>혼합 방향까지 비교해 수율을 높입니다.</Text></View>
            <Switch accessibilityLabel="90도 회전 허용" value={allowRotation} onValueChange={setAllowRotation}
              trackColor={{ false: '#cbd5e1', true: '#93c5fd' }} thumbColor={allowRotation ? '#2563eb' : '#f8fafc'} />
          </View>

          {error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="최적 배치 계산" onPress={calculate} style={styles.primaryButton}>
            <Text style={styles.primaryButtonText}>최적 배치 계산</Text><Text style={styles.arrow}>→</Text>
          </TouchableOpacity>
        </View>

        <View style={[styles.panel, styles.previewPanel]}>
          <View style={styles.panelHeader}>
            <View><Text style={styles.panelTitle}>자동배치 미리보기</Text><Text style={styles.panelSubtitle}>기본·회전·혼합 배치를 비교합니다.</Text></View>
            <View style={[styles.stepBadge, styles.stepBadgeDark]}><Text style={[styles.stepText, styles.stepTextLight]}>02</Text></View>
          </View>
          <FilmLayoutPreview result={result} rollWidthMm={numeric('rollWidth')} rollLengthMm={numeric('rollLength')} marginMm={numeric('margin')} />
        </View>
      </View>

      {result && (
        <View style={styles.resultSection} accessibilityRole="summary">
          <View style={styles.resultHeading}>
            <View><Text style={styles.eyebrow}>OPTIMIZED RESULT</Text><Text style={styles.resultTitle}>최적 배치 결과</Text></View>
            <View style={styles.strategyBadge}><Text style={styles.strategyText}>{strategyNames[result.strategy]}</Text></View>
          </View>
          <View style={styles.metrics}>
            <Metric label="필요 원단" value={`${result.sheetsRequired}장`} accent="#2563eb" />
            <Metric label="장당 생산" value={`${result.piecesPerSheet}개`} accent="#7c3aed" />
            <Metric label="총 사용 길이" value={`${result.usedLengthMm.toLocaleString()} mm`} accent="#0891b2" />
            <Metric label="면적 수율" value={`${result.utilizationPercent}%`} accent="#059669" />
          </View>
          <View style={styles.gaugeHeader}><Text style={styles.gaugeLabel}>원단 활용률</Text><Text style={styles.wasteText}>손실 {result.wastePercent}%</Text></View>
          <View style={styles.gaugeTrack}><View style={[styles.gaugeFill, { width: `${Math.min(100, result.utilizationPercent)}%` }]} /></View>
        </View>
      )}
    </ScrollView>
  );
}

function Metric({ label, value, accent }: { label: string; value: string; accent: string }) {
  return <View style={styles.metric}><View style={[styles.metricAccent, { backgroundColor: accent }]} /><Text style={styles.metricLabel}>{label}</Text><Text style={styles.metricValue}>{value}</Text></View>;
}

const shadow = { shadowColor: '#0f172a', shadowOpacity: 0.08, shadowRadius: 22, shadowOffset: { width: 0, height: 8 }, elevation: 3 } as const;
const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#f1f5f9' },
  pageContent: { width: '100%', maxWidth: 1320, alignSelf: 'center', paddingHorizontal: 20, paddingTop: 34, paddingBottom: 72 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', gap: 18, marginBottom: 28 },
  eyebrow: { fontSize: 11, letterSpacing: 1.8, fontWeight: '800', color: '#2563eb' },
  title: { marginTop: 6, fontSize: 34, lineHeight: 42, fontWeight: '800', letterSpacing: -1, color: '#0f172a' },
  description: { marginTop: 7, fontSize: 15, color: '#64748b' },
  resetButton: { minHeight: 42, justifyContent: 'center', paddingHorizontal: 16, borderRadius: 10, borderWidth: 1, borderColor: '#cbd5e1', backgroundColor: '#fff' },
  resetText: { fontSize: 13, fontWeight: '700', color: '#475569' },
  workspace: { gap: 20 }, workspaceWide: { flexDirection: 'row', alignItems: 'stretch' },
  panel: { borderRadius: 20, padding: 22, backgroundColor: '#fff', ...shadow }, sidePanel: { width: 440, flexShrink: 0 },
  inputPanel: {}, previewPanel: { flex: 1, minHeight: 560 },
  panelHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 22 },
  panelTitle: { fontSize: 20, fontWeight: '800', color: '#0f172a' }, panelSubtitle: { marginTop: 5, fontSize: 13, color: '#64748b' },
  stepBadge: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: '#eff6ff' },
  stepBadgeDark: { backgroundColor: '#0f172a' }, stepText: { fontSize: 12, fontWeight: '800', color: '#2563eb' }, stepTextLight: { color: '#fff' },
  group: { paddingTop: 18, paddingBottom: 6, borderTopWidth: 1, borderTopColor: '#e2e8f0' },
  groupTitle: { fontSize: 15, fontWeight: '800', color: '#1e293b' }, groupDescription: { marginTop: 3, marginBottom: 13, fontSize: 12, color: '#94a3b8' },
  fieldGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 }, field: { width: '48%', flexGrow: 1 }, fullField: { width: '100%' },
  label: { marginBottom: 6, fontSize: 12, fontWeight: '700', color: '#475569' },
  inputWrap: { minHeight: 46, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 10, backgroundColor: '#f8fafc' },
  input: { flex: 1, height: 44, paddingHorizontal: 12, fontSize: 16, fontWeight: '700', color: '#0f172a' },
  unit: { paddingRight: 12, fontSize: 11, fontWeight: '700', color: '#94a3b8' },
  switchCard: { minHeight: 66, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 14, marginTop: 14, padding: 14, borderRadius: 12, backgroundColor: '#eff6ff' },
  switchCopy: { flex: 1 }, switchTitle: { fontSize: 14, fontWeight: '800', color: '#1e3a8a' }, switchDescription: { marginTop: 3, fontSize: 11, color: '#64748b' },
  error: { marginTop: 14, padding: 12, borderRadius: 9, color: '#991b1b', backgroundColor: '#fee2e2' },
  primaryButton: { minHeight: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, marginTop: 16, borderRadius: 12, backgroundColor: '#2563eb' },
  primaryButtonText: { fontSize: 15, fontWeight: '800', color: '#fff' }, arrow: { fontSize: 20, color: '#bfdbfe' },
  resultSection: { marginTop: 22, padding: 24, borderRadius: 20, backgroundColor: '#fff', ...shadow },
  resultHeading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 20 },
  resultTitle: { marginTop: 4, fontSize: 23, fontWeight: '800', color: '#0f172a' },
  strategyBadge: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, backgroundColor: '#ecfdf5' }, strategyText: { fontSize: 12, fontWeight: '800', color: '#047857' },
  metrics: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 }, metric: { minWidth: 180, flex: 1, padding: 16, overflow: 'hidden', borderRadius: 13, borderWidth: 1, borderColor: '#e2e8f0', backgroundColor: '#f8fafc' },
  metricAccent: { position: 'absolute', top: 0, bottom: 0, left: 0, width: 4 }, metricLabel: { marginLeft: 3, fontSize: 12, color: '#64748b' }, metricValue: { marginTop: 7, marginLeft: 3, fontSize: 21, fontWeight: '800', color: '#0f172a' },
  gaugeHeader: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 22, marginBottom: 8 }, gaugeLabel: { fontSize: 13, fontWeight: '700', color: '#334155' }, wasteText: { fontSize: 12, color: '#ea580c' },
  gaugeTrack: { height: 10, overflow: 'hidden', borderRadius: 5, backgroundColor: '#e2e8f0' }, gaugeFill: { height: '100%', borderRadius: 5, backgroundColor: '#10b981' },
});
