import { useCallback, useEffect, useMemo, useState } from 'react';
import { router } from 'expo-router';
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

import { createAppLibraryRepository } from '../../src/features/library/libraryRepositoryFactory';
import type { LibraryDocument, SavedCuttingJob } from '../../src/features/library/models';

const repository = createAppLibraryRepository();
const emptyLibrary: LibraryDocument = { version: 1, presets: [], jobs: [], remnants: [], mergedJobs: [] };

export default function ProjectsScreen() {
  const [library, setLibrary] = useState<LibraryDocument>(emptyLibrary);
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const refresh = useCallback(async () => {
    setBusy(true); setError(null);
    try { setLibrary((await repository.load()).document); }
    catch (caught) { setError(caught instanceof Error ? caught.message : '프로젝트를 불러오지 못했습니다.'); }
    finally { setBusy(false); }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);
  const jobs = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase('ko-KR');
    return library.jobs.filter((job) => normalized.length === 0 || [job.name, job.brand, job.productNumber].some((value) => value.toLocaleLowerCase('ko-KR').includes(normalized)));
  }, [library.jobs, query]);
  const remove = async (job: SavedCuttingJob) => { setBusy(true); try { await repository.deleteJob(job.id); await refresh(); } catch (caught) { setError(caught instanceof Error ? caught.message : '프로젝트를 삭제하지 못했습니다.'); } finally { setBusy(false); } };
  const rename = async () => { if (!editingId || editingName.trim().length === 0) return; setBusy(true); try { await repository.renameJob(editingId, editingName.trim(), new Date().toISOString()); setEditingId(null); await refresh(); } catch (caught) { setError(caught instanceof Error ? caught.message : '프로젝트 이름을 변경하지 못했습니다.'); } finally { setBusy(false); } };
  return <ScrollView style={styles.page} contentContainerStyle={styles.content}>
    <View style={styles.header}><View style={styles.headerCopy}><Text style={styles.eyebrow}>PROJECTS</Text><Text style={styles.title}>프로젝트</Text><Text style={styles.subtitle}>저장된 재단 작업을 다시 열고 관리합니다.</Text></View><TouchableOpacity accessibilityRole="button" onPress={() => router.push('/input')} style={styles.primary}><Text style={styles.primaryText}>＋ 새 프로젝트</Text></TouchableOpacity></View>
    <View style={styles.stats}><Stat label="저장 작업" value={String(library.jobs.length)} /><Stat label="규격 프리셋" value={String(library.presets.length)} /><Stat label="자투리 재고" value={String(library.remnants.length)} /></View>
    <View style={styles.toolbar}><TextInput accessibilityLabel="프로젝트 검색" value={query} onChangeText={setQuery} placeholder="작업명, 브랜드, 제품 번호 검색" placeholderTextColor="#94a3b8" style={styles.search} /><TouchableOpacity accessibilityRole="button" onPress={() => void refresh()} disabled={busy} style={[styles.refresh, busy && styles.disabled]}><Text style={styles.refreshText}>새로고침</Text></TouchableOpacity></View>
    {error && <Text style={styles.error}>{error}</Text>}
    {jobs.length === 0 ? <View style={styles.empty}><Text style={styles.emptyTitle}>{query ? '검색 결과가 없습니다.' : '저장된 프로젝트가 없습니다.'}</Text><Text style={styles.emptyBody}>재단 계산 탭에서 조건을 계산한 뒤 프로젝트 저장을 눌러주세요.</Text></View> : <View style={styles.list}>{jobs.map((job) => <View key={job.id} style={styles.card}>{editingId === job.id ? <View style={styles.editRow}><TextInput accessibilityLabel="프로젝트 이름" autoFocus value={editingName} onChangeText={setEditingName} style={styles.editInput} /><TouchableOpacity accessibilityRole="button" onPress={() => void rename()} style={styles.smallPrimary}><Text style={styles.smallPrimaryText}>저장</Text></TouchableOpacity><TouchableOpacity accessibilityRole="button" onPress={() => setEditingId(null)} style={styles.smallSecondary}><Text style={styles.smallSecondaryText}>취소</Text></TouchableOpacity></View> : <><TouchableOpacity accessibilityRole="button" onPress={() => router.push({ pathname: '/input', params: { jobId: job.id } })} style={styles.cardMain}><View style={styles.cardHeading}><Text style={styles.cardTitle} numberOfLines={1}>{job.name}</Text><Text style={styles.date}>{new Date(job.updatedAt).toLocaleDateString('ko-KR')}</Text></View><Text style={styles.meta}>{job.brand} · {job.productNumber || '제품 번호 없음'} · {job.input.pieceWidthMm}×{job.input.pieceLengthMm}mm · {job.input.quantity}개</Text><Text style={styles.status}>{job.isCuttingComplete ? '재단 완료' : '계산 저장됨'} · 새 롤 {Math.round(job.result.newRollLengthMm).toLocaleString()}mm</Text></TouchableOpacity><View style={styles.actions}><TouchableOpacity accessibilityRole="button" onPress={() => { setEditingId(job.id); setEditingName(job.name); }} style={styles.action}><Text style={styles.actionText}>이름 변경</Text></TouchableOpacity><TouchableOpacity accessibilityRole="button" onPress={() => void remove(job)} disabled={busy} style={[styles.action, styles.danger]}><Text style={styles.dangerText}>삭제</Text></TouchableOpacity></View></>}</View>)}</View>}
  </ScrollView>;
}

function Stat({ label, value }: { label: string; value: string }) { return <View style={styles.stat}><Text style={styles.statLabel}>{label}</Text><Text style={styles.statValue}>{value}</Text></View>; }
const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#f1f5f9' }, content: { width: '100%', maxWidth: 1100, alignSelf: 'center', padding: 24, paddingBottom: 72 },
  header: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'flex-end', gap: 16 }, headerCopy: { flex: 1, minWidth: 220 }, eyebrow: { fontSize: 11, letterSpacing: 1.8, fontWeight: '800', color: '#2563eb' }, title: { marginTop: 6, fontSize: 32, fontWeight: '800', color: '#0f172a' }, subtitle: { marginTop: 6, fontSize: 14, color: '#64748b' }, primary: { minHeight: 46, justifyContent: 'center', paddingHorizontal: 16, borderRadius: 10, backgroundColor: '#2563eb' }, primaryText: { fontSize: 13, fontWeight: '800', color: '#fff' },
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 24 }, stat: { flex: 1, minWidth: 150, padding: 16, borderRadius: 14, backgroundColor: '#fff', borderWidth: 1, borderColor: '#e2e8f0' }, statLabel: { fontSize: 11, color: '#64748b' }, statValue: { marginTop: 6, fontSize: 23, fontWeight: '800', color: '#1e3a8a' },
  toolbar: { flexDirection: 'row', gap: 9, marginTop: 20 }, search: { flex: 1, minHeight: 46, paddingHorizontal: 13, borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 10, color: '#0f172a', backgroundColor: '#fff' }, refresh: { minHeight: 46, justifyContent: 'center', paddingHorizontal: 14, borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 10, backgroundColor: '#fff' }, refreshText: { fontSize: 12, fontWeight: '800', color: '#334155' }, disabled: { opacity: 0.45 }, error: { marginTop: 14, padding: 12, borderRadius: 9, color: '#991b1b', backgroundColor: '#fff1f2' },
  list: { gap: 10, marginTop: 16 }, card: { padding: 14, borderRadius: 14, borderWidth: 1, borderColor: '#e2e8f0', backgroundColor: '#fff' }, cardMain: { minWidth: 0 }, cardHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }, cardTitle: { flex: 1, fontSize: 15, fontWeight: '800', color: '#1e293b' }, date: { fontSize: 10, color: '#94a3b8' }, meta: { marginTop: 7, fontSize: 12, color: '#475569' }, status: { marginTop: 5, fontSize: 11, color: '#64748b' }, actions: { flexDirection: 'row', gap: 7, marginTop: 11 }, action: { minHeight: 36, justifyContent: 'center', paddingHorizontal: 10, borderRadius: 8, borderWidth: 1, borderColor: '#bfdbfe', backgroundColor: '#eff6ff' }, actionText: { fontSize: 11, fontWeight: '800', color: '#1d4ed8' }, danger: { borderColor: '#fecaca', backgroundColor: '#fff1f2' }, dangerText: { fontSize: 11, fontWeight: '800', color: '#be123c' }, empty: { marginTop: 16, padding: 28, alignItems: 'center', borderRadius: 14, backgroundColor: '#fff' }, emptyTitle: { fontSize: 16, fontWeight: '800', color: '#334155' }, emptyBody: { marginTop: 8, textAlign: 'center', fontSize: 12, color: '#64748b' }, editRow: { flexDirection: 'row', alignItems: 'center', gap: 7 }, editInput: { flex: 1, minHeight: 42, paddingHorizontal: 10, borderWidth: 1, borderColor: '#60a5fa', borderRadius: 8, color: '#0f172a' }, smallPrimary: { minHeight: 42, justifyContent: 'center', paddingHorizontal: 11, borderRadius: 8, backgroundColor: '#2563eb' }, smallPrimaryText: { fontSize: 11, fontWeight: '800', color: '#fff' }, smallSecondary: { minHeight: 42, justifyContent: 'center', paddingHorizontal: 11, borderRadius: 8, backgroundColor: '#e2e8f0' }, smallSecondaryText: { fontSize: 11, fontWeight: '800', color: '#334155' },
});
