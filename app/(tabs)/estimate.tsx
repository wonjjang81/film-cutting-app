import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { useFocusEffect } from 'expo-router';

import { EstimateSummary } from '../../src/features/estimate/EstimateSummary';
import { asyncStorageLibraryAdapter } from '../../src/features/library/asyncStorageLibraryAdapter';
import { createLibraryRepository } from '../../src/features/library/libraryRepository';
import type { SavedCuttingJob } from '../../src/features/library/models';

const repository = createLibraryRepository(asyncStorageLibraryAdapter);

export default function EstimateScreen() {
  const { width } = useWindowDimensions();
  const [job, setJob] = useState<SavedCuttingJob | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const loaded = await repository.load();
      setJob(loaded.document.jobs[0] ?? null);
      if (loaded.warnings.length > 0) setError(loaded.warnings.join(' '));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '저장된 프로젝트를 불러오지 못했습니다.');
    } finally { setLoading(false); }
  }, []);
  useFocusEffect(useCallback(() => { void refresh(); }, [refresh]));

  return <ScrollView style={styles.page} contentContainerStyle={[styles.content, width < 420 && styles.contentSmall]}>
    <View style={styles.header}><View><Text style={styles.eyebrow}>ESTIMATE WORKSPACE</Text><Text style={styles.title}>자동 견적</Text><Text style={styles.description}>최근 저장된 프로젝트의 원단·시공 비용을 자동 계산합니다.</Text></View><TouchableOpacity accessibilityRole="button" accessibilityLabel="견적 새로고침" onPress={() => void refresh()} style={styles.refresh}><Text style={styles.refreshText}>새로고침</Text></TouchableOpacity></View>
    {error && <Text style={styles.error}>{error}</Text>}
    {loading ? <Text style={styles.empty}>견적을 불러오는 중입니다…</Text> : job ? <EstimateSummary job={job} /> : <View style={styles.emptyCard}><Text style={styles.emptyTitle}>저장된 프로젝트가 없습니다.</Text><Text style={styles.emptyDescription}>재단 계산 탭에서 조건을 계산하면 프로젝트와 견적이 자동 저장됩니다.</Text></View>}
  </ScrollView>;
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#f1f5f9' }, content: { width: '100%', maxWidth: 980, alignSelf: 'center', paddingHorizontal: 20, paddingTop: 32, paddingBottom: 72 }, contentSmall: { paddingHorizontal: 12, paddingTop: 20 },
  header: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-end', justifyContent: 'space-between', gap: 14, marginBottom: 18 }, eyebrow: { fontSize: 11, letterSpacing: 1.8, fontWeight: '800', color: '#2563eb' }, title: { marginTop: 6, fontSize: 32, lineHeight: 40, fontWeight: '800', color: '#0f172a' }, description: { marginTop: 7, fontSize: 14, lineHeight: 21, color: '#64748b' }, refresh: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 15, borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 10, backgroundColor: '#fff' }, refreshText: { fontSize: 12, fontWeight: '800', color: '#334155' }, error: { marginBottom: 16, padding: 13, borderRadius: 10, borderWidth: 1, borderColor: '#fecaca', color: '#991b1b', backgroundColor: '#fff1f2' }, empty: { paddingVertical: 30, textAlign: 'center', color: '#64748b' }, emptyCard: { marginTop: 12, padding: 24, borderRadius: 18, borderWidth: 1, borderColor: '#e2e8f0', backgroundColor: '#fff' }, emptyTitle: { fontSize: 17, fontWeight: '800', color: '#1e293b' }, emptyDescription: { marginTop: 8, fontSize: 13, lineHeight: 20, color: '#64748b' },
});
