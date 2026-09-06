import { useCallback, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as DocumentPicker from 'expo-document-picker';
import * as Sharing from 'expo-sharing';
import { router } from 'expo-router';
import { Alert, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

import { createAppLibraryRepository } from '../../src/features/library/libraryRepositoryFactory';
import type { LibraryDocument, SavedCuttingJob, SavedProject } from '../../src/features/library/models';
import { createEmptyProject, createProjectFromCurrentEstimate } from '../../src/features/library/projectCreation';
import { CURRENT_GROUP_ESTIMATE_STORAGE_KEY, parseCurrentEstimateSnapshot } from '../../src/features/estimate/currentGroupEstimate';
import { parseProjectExport } from '../../src/features/library/projectTransfer';

const repository = createAppLibraryRepository();
const emptyLibrary: LibraryDocument = { version: 1, presets: [], jobs: [], remnants: [], mergedJobs: [] };

export default function ProjectsScreen() {
  const [library, setLibrary] = useState<LibraryDocument>(emptyLibrary);
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [newProjectName, setNewProjectName] = useState('');
  const refresh = useCallback(async () => {
    setBusy(true); setError(null);
    try { setLibrary((await repository.load()).document); }
    catch (caught) { setError(caught instanceof Error ? caught.message : '프로젝트를 불러오지 못했습니다.'); }
    finally { setBusy(false); }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);
  const projects = library.projects ?? [];
  const visibleProjects = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase('ko-KR');
    return projects.filter((project) => normalized.length === 0 || project.name.toLocaleLowerCase('ko-KR').includes(normalized));
  }, [projects, query]);
  const jobs = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase('ko-KR');
    const projectJobIds = new Set(projects.flatMap((project) => project.jobIds));
    return library.jobs.filter((job) => !projectJobIds.has(job.id) && (normalized.length === 0 || [job.name, job.brand, job.productNumber].some((value) => value.toLocaleLowerCase('ko-KR').includes(normalized))));
  }, [library.jobs, projects, query]);
  const remove = async (job: SavedCuttingJob) => { setBusy(true); try { await repository.deleteJob(job.id); await refresh(); } catch (caught) { setError(caught instanceof Error ? caught.message : '프로젝트를 삭제하지 못했습니다.'); } finally { setBusy(false); } };
  const removeProject = async (project: SavedProject) => { setBusy(true); try { await repository.deleteProject(project.id); await refresh(); } catch (caught) { setError(caught instanceof Error ? caught.message : '프로젝트를 삭제하지 못했습니다.'); } finally { setBusy(false); } };
  const createProject = async () => {
    const name = newProjectName.trim();
    if (!name) { setError('프로젝트 이름을 입력해 주세요.'); return; }
    setBusy(true); setError(null);
    try {
      const latest = await repository.load();
      const projects = latest.document.projects ?? [];
      const normalizedName = name.toLocaleLowerCase('ko-KR');
      if (projects.some((project) => project.name.trim().toLocaleLowerCase('ko-KR') === normalizedName)) {
        throw new Error('같은 이름의 프로젝트가 이미 있습니다. 다른 이름을 입력해 주세요.');
      }
      const now = new Date().toISOString();
      const project = createEmptyProject(name, now, projects.map((item) => item.id));
      await repository.saveProjectBundle(project, [], []);
      setNewProjectName('');
      await refresh();
      router.push({ pathname: '/input', params: { projectId: project.id } });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '프로젝트를 생성하지 못했습니다.');
    } finally { setBusy(false); }
  };
  const saveCurrentEstimate = async () => {
    setBusy(true); setError(null); setNotice(null);
    try {
      const snapshot = parseCurrentEstimateSnapshot(await AsyncStorage.getItem(CURRENT_GROUP_ESTIMATE_STORAGE_KEY));
      if (!snapshot) throw new Error('저장할 재단계산 결과가 없습니다. 먼저 조각을 입력하고 배치 계산을 실행해 주세요.');
      const latest = await repository.load();
      const projects = latest.document.projects ?? [];
      const name = newProjectName.trim() || `재단 결과 ${new Date().toLocaleDateString('ko-KR')}`;
      const normalizedName = name.toLocaleLowerCase('ko-KR');
      const existing = projects.find((project) => project.name.trim().toLocaleLowerCase('ko-KR') === normalizedName);
      if (existing && !(await confirmOverwrite(name))) { setNotice('기존 프로젝트 덮어쓰기를 취소했습니다.'); return; }
      const now = new Date().toISOString();
      const bundle = createProjectFromCurrentEstimate(name, snapshot, now, projects.map((project) => project.id));
      const project = existing ? { ...bundle.project, id: existing.id, createdAt: existing.createdAt, updatedAt: now } : bundle.project;
      await repository.saveProjectBundle(project, bundle.jobs, bundle.mergedJobs);
      setNewProjectName('');
      await refresh();
      setNotice(existing ? `"${name}" 프로젝트를 새 재단 결과로 덮어썼습니다.` : `현재 재단 결과를 "${name}" 프로젝트로 저장했습니다.`);
      router.push({ pathname: '/input', params: { projectId: project.id } });
    } catch (caught) { setError(caught instanceof Error ? caught.message : '재단 결과를 저장하지 못했습니다.'); }
    finally { setBusy(false); }
  };
  const exportProject = async (project: SavedProject) => {
    setBusy(true); setError(null); setNotice(null);
    try {
      const raw = await repository.exportProject(project.id);
      await downloadJson(raw, `film-cutting-project-${safeFilename(project.name)}.json`, '프로젝트 JSON 공유');
      setNotice(`"${project.name}" 프로젝트를 JSON 파일로 내보냈습니다.`);
    } catch (caught) { setError(caught instanceof Error ? caught.message : '프로젝트를 내보내지 못했습니다.'); }
    finally { setBusy(false); }
  };
  const exportLibrary = async () => {
    setBusy(true); setError(null); setNotice(null);
    try {
      const raw = await repository.exportDocument();
      const filename = `film-cutting-library-${new Date().toISOString().slice(0, 10)}.json`;
      await downloadJson(raw, filename, '전체 프로젝트 백업 공유');
      setNotice('저장된 모든 프로젝트 데이터를 백업으로 내보냈습니다.');
    } catch (caught) { setError(caught instanceof Error ? caught.message : '프로젝트 백업을 내보내지 못했습니다.'); }
    finally { setBusy(false); }
  };
  const importProject = async () => {
    setBusy(true); setError(null); setNotice(null);
    try {
      const raw = await pickJsonFile();
      if (raw === null) return;
      const incoming = parseProjectExport(raw);
      const existing = projects.find((project) => project.id === incoming.project.id);
      if (existing && !(await confirmOverwrite(existing.name))) { setNotice('기존 프로젝트 가져오기를 취소했습니다.'); return; }
      await repository.importProject(raw);
      await refresh();
      setNotice(`"${incoming.project.name}" 프로젝트를 가져왔습니다.`);
    } catch (caught) { setError(caught instanceof Error ? caught.message : '프로젝트를 가져오지 못했습니다.'); }
    finally { setBusy(false); }
  };
  const importLibrary = async () => {
    setBusy(true); setError(null); setNotice(null);
    try {
      let raw: string | null = null;
      if (Platform.OS === 'web') {
        raw = await new Promise<string | null>((resolve) => {
          const picker = document.createElement('input'); picker.type = 'file'; picker.accept = 'application/json,.json';
          picker.onchange = async () => { const file = picker.files?.[0]; resolve(file ? await file.text() : null); }; picker.click();
        });
      } else {
        const picked = await DocumentPicker.getDocumentAsync({ type: 'application/json', copyToCacheDirectory: true });
        if (!picked.canceled) { const FileSystem = await import('expo-file-system/legacy'); raw = await FileSystem.readAsStringAsync(picked.assets[0]!.uri, { encoding: FileSystem.EncodingType.UTF8 }); }
      }
      if (raw === null) return;
      await repository.importDocument(raw);
      await refresh();
      setNotice('프로젝트 백업을 불러왔습니다.');
    } catch (caught) { setError(caught instanceof Error ? caught.message : '프로젝트 백업을 불러오지 못했습니다.'); }
    finally { setBusy(false); }
  };
  const rename = async () => { if (!editingId || editingName.trim().length === 0) return; setBusy(true); try { const project = projects.find((item) => item.id === editingId); if (project) await repository.renameProject(editingId, editingName.trim(), new Date().toISOString()); else await repository.renameJob(editingId, editingName.trim(), new Date().toISOString()); setEditingId(null); await refresh(); } catch (caught) { setError(caught instanceof Error ? caught.message : '프로젝트 이름을 변경하지 못했습니다.'); } finally { setBusy(false); } };
  return <ScrollView style={styles.page} contentContainerStyle={styles.content}>
    <View style={styles.header}><View style={styles.headerCopy}><Text style={styles.eyebrow}>PROJECTS</Text><Text style={styles.title}>프로젝트</Text><Text style={styles.subtitle}>프로젝트명을 입력하면 즉시 생성되고 재단 계산으로 이어집니다.</Text></View><View style={styles.createRow}><TextInput accessibilityLabel="새 프로젝트 이름" value={newProjectName} onChangeText={setNewProjectName} onSubmitEditing={() => void createProject()} returnKeyType="done" placeholder="프로젝트 이름 입력" placeholderTextColor="#94a3b8" style={styles.createInput} /><TouchableOpacity accessibilityRole="button" onPress={() => void createProject()} disabled={busy} style={[styles.primary, busy && styles.disabled]}><Text style={styles.primaryText}>＋ 프로젝트 생성</Text></TouchableOpacity></View></View>
    <View style={styles.stats}><Stat label="저장 프로젝트" value={String(projects.length + jobs.length)} /><Stat label="규격 프리셋" value={String(library.presets.length)} /><Stat label="자투리 재고" value={String(library.remnants.length)} /></View>
    <View style={styles.toolbar}><TextInput accessibilityLabel="프로젝트 검색" value={query} onChangeText={setQuery} placeholder="작업명, 브랜드, 제품 번호 검색" placeholderTextColor="#94a3b8" style={styles.search} /><TouchableOpacity accessibilityRole="button" onPress={() => void refresh()} disabled={busy} style={[styles.refresh, busy && styles.disabled]}><Text style={styles.refreshText}>새로고침</Text></TouchableOpacity></View>
    <View style={styles.projectActions}><TouchableOpacity accessibilityRole="button" accessibilityLabel="현재 재단 결과 프로젝트 저장" onPress={() => void saveCurrentEstimate()} disabled={busy} style={[styles.actionPrimary, busy && styles.disabled]}><Text style={styles.actionPrimaryText}>현재 재단 결과 → 프로젝트 저장</Text></TouchableOpacity><TouchableOpacity accessibilityRole="button" accessibilityLabel="전체 프로젝트 백업 내보내기" onPress={() => void exportLibrary()} disabled={busy} style={[styles.actionSecondary, busy && styles.disabled]}><Text style={styles.actionSecondaryText}>전체 백업 내보내기</Text></TouchableOpacity><TouchableOpacity accessibilityRole="button" accessibilityLabel="프로젝트 JSON 가져오기" onPress={() => void importProject()} disabled={busy} style={[styles.actionSecondary, busy && styles.disabled]}><Text style={styles.actionSecondaryText}>프로젝트 가져오기</Text></TouchableOpacity><TouchableOpacity accessibilityRole="button" accessibilityLabel="전체 프로젝트 백업 불러오기" onPress={() => void importLibrary()} disabled={busy} style={[styles.actionSecondary, busy && styles.disabled]}><Text style={styles.actionSecondaryText}>전체 백업 불러오기</Text></TouchableOpacity></View>
    {(error || notice) && <Text style={[styles.message, error ? styles.error : styles.notice]}>{error ?? notice}</Text>}
    {visibleProjects.length === 0 && jobs.length === 0 ? <View style={styles.empty}><Text style={styles.emptyTitle}>{query ? '검색 결과가 없습니다.' : '저장된 프로젝트가 없습니다.'}</Text><Text style={styles.emptyBody}>재단 계산 탭에서 프로젝트명을 입력하고 프로젝트 저장을 눌러주세요.</Text></View> : <View style={styles.list}>{visibleProjects.map((project) => { const projectJobs = project.jobIds.map((id) => library.jobs.find((job) => job.id === id)).filter((job): job is SavedCuttingJob => Boolean(job)); const quantity = projectJobs.reduce((sum, job) => sum + job.input.quantity, 0); const first = projectJobs[0]; return <View key={project.id} style={styles.card}>{editingId === project.id ? <View style={styles.editRow}><TextInput accessibilityLabel="프로젝트 이름" autoFocus value={editingName} onChangeText={setEditingName} style={styles.editInput} /><TouchableOpacity accessibilityRole="button" onPress={() => void rename()} style={styles.smallPrimary}><Text style={styles.smallPrimaryText}>저장</Text></TouchableOpacity><TouchableOpacity accessibilityRole="button" onPress={() => setEditingId(null)} style={styles.smallSecondary}><Text style={styles.smallSecondaryText}>취소</Text></TouchableOpacity></View> : <><TouchableOpacity accessibilityRole="button" onPress={() => router.push({ pathname: '/input', params: { projectId: project.id } })} style={styles.cardMain}><View style={styles.cardHeading}><Text style={styles.cardTitle} numberOfLines={1}>{project.name}</Text><Text style={styles.date}>{new Date(project.updatedAt).toLocaleDateString('ko-KR')}</Text></View><Text style={styles.meta}>그룹·조각 {projectJobs.length}개 · 입력 수량 {quantity}개{first ? ` · ${first.brand} · ${first.input.pieceWidthMm}×${first.input.pieceLengthMm}mm` : ''}</Text><Text style={styles.status}>프로젝트 저장됨 · 병합 롤 {project.mergedJobIds.length}개</Text></TouchableOpacity><View style={styles.actions}><TouchableOpacity accessibilityRole="button" onPress={() => { setEditingId(project.id); setEditingName(project.name); }} style={styles.action}><Text style={styles.actionText}>이름 변경</Text></TouchableOpacity><TouchableOpacity accessibilityRole="button" accessibilityLabel={`${project.name} JSON 저장`} onPress={() => void exportProject(project)} disabled={busy} style={styles.action}><Text style={styles.actionText}>JSON 저장</Text></TouchableOpacity><TouchableOpacity accessibilityRole="button" onPress={() => void removeProject(project)} disabled={busy} style={[styles.action, styles.danger]}><Text style={styles.dangerText}>삭제</Text></TouchableOpacity></View></>}</View>; })}{jobs.map((job) => <View key={job.id} style={styles.card}>{editingId === job.id ? <View style={styles.editRow}><TextInput accessibilityLabel="프로젝트 이름" autoFocus value={editingName} onChangeText={setEditingName} style={styles.editInput} /><TouchableOpacity accessibilityRole="button" onPress={() => void rename()} style={styles.smallPrimary}><Text style={styles.smallPrimaryText}>저장</Text></TouchableOpacity><TouchableOpacity accessibilityRole="button" onPress={() => setEditingId(null)} style={styles.smallSecondary}><Text style={styles.smallSecondaryText}>취소</Text></TouchableOpacity></View> : <><TouchableOpacity accessibilityRole="button" onPress={() => router.push({ pathname: '/input', params: { jobId: job.id } })} style={styles.cardMain}><View style={styles.cardHeading}><Text style={styles.cardTitle} numberOfLines={1}>{job.name}</Text><Text style={styles.date}>{new Date(job.updatedAt).toLocaleDateString('ko-KR')}</Text></View><Text style={styles.meta}>{job.brand} · {job.productNumber || '제품 번호 없음'} · {job.input.pieceWidthMm}×{job.input.pieceLengthMm}mm · {job.input.quantity}개</Text><Text style={styles.status}>{job.isCuttingComplete ? '재단 완료' : '계산 저장됨'} · 새 롤 {Math.round(job.result.newRollLengthMm).toLocaleString()}mm</Text></TouchableOpacity><View style={styles.actions}><TouchableOpacity accessibilityRole="button" onPress={() => { setEditingId(job.id); setEditingName(job.name); }} style={styles.action}><Text style={styles.actionText}>이름 변경</Text></TouchableOpacity><TouchableOpacity accessibilityRole="button" onPress={() => void remove(job)} disabled={busy} style={[styles.action, styles.danger]}><Text style={styles.dangerText}>삭제</Text></TouchableOpacity></View></>}</View>)}</View>}
  </ScrollView>;
}

function Stat({ label, value }: { label: string; value: string }) { return <View style={styles.stat}><Text style={styles.statLabel}>{label}</Text><Text style={styles.statValue}>{value}</Text></View>; }
const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#f1f5f9' }, content: { width: '100%', maxWidth: 1100, alignSelf: 'center', padding: 24, paddingBottom: 72 },
  header: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'flex-end', gap: 16 }, headerCopy: { flex: 1, minWidth: 220 }, eyebrow: { fontSize: 11, letterSpacing: 1.8, fontWeight: '800', color: '#2563eb' }, title: { marginTop: 6, fontSize: 32, fontWeight: '800', color: '#0f172a' }, subtitle: { marginTop: 6, fontSize: 14, color: '#64748b' }, createRow: { flexDirection: 'row', flex: 1, minWidth: 280, maxWidth: 470, gap: 8 }, createInput: { flex: 1, minHeight: 46, paddingHorizontal: 13, borderWidth: 1, borderColor: '#93c5fd', borderRadius: 10, color: '#0f172a', backgroundColor: '#fff' }, primary: { minHeight: 46, justifyContent: 'center', paddingHorizontal: 16, borderRadius: 10, backgroundColor: '#2563eb' }, primaryText: { fontSize: 13, fontWeight: '800', color: '#fff' },
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 24 }, stat: { flex: 1, minWidth: 150, padding: 16, borderRadius: 14, backgroundColor: '#fff', borderWidth: 1, borderColor: '#e2e8f0' }, statLabel: { fontSize: 11, color: '#64748b' }, statValue: { marginTop: 6, fontSize: 23, fontWeight: '800', color: '#1e3a8a' },
  toolbar: { flexDirection: 'row', gap: 9, marginTop: 20 }, search: { flex: 1, minHeight: 46, paddingHorizontal: 13, borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 10, color: '#0f172a', backgroundColor: '#fff' }, refresh: { minHeight: 46, justifyContent: 'center', paddingHorizontal: 14, borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 10, backgroundColor: '#fff' }, refreshText: { fontSize: 12, fontWeight: '800', color: '#334155' }, projectActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 }, actionPrimary: { minHeight: 40, justifyContent: 'center', paddingHorizontal: 13, borderRadius: 9, backgroundColor: '#2563eb' }, actionPrimaryText: { fontSize: 11, fontWeight: '800', color: '#fff' }, actionSecondary: { minHeight: 40, justifyContent: 'center', paddingHorizontal: 13, borderWidth: 1, borderColor: '#bfdbfe', borderRadius: 9, backgroundColor: '#eff6ff' }, actionSecondaryText: { fontSize: 11, fontWeight: '800', color: '#1d4ed8' }, disabled: { opacity: 0.45 }, message: { marginTop: 14, padding: 12, borderRadius: 9 }, error: { color: '#991b1b', backgroundColor: '#fff1f2' }, notice: { color: '#166534', backgroundColor: '#f0fdf4' },
    list: { gap: 10, marginTop: 16 }, card: { padding: 14, borderRadius: 14, borderWidth: 1, borderColor: '#e2e8f0', backgroundColor: '#fff' }, cardMain: { minWidth: 0 }, cardHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }, cardTitle: { flex: 1, fontSize: 15, fontWeight: '800', color: '#1e293b' }, date: { fontSize: 10, color: '#94a3b8' }, meta: { marginTop: 7, fontSize: 12, color: '#475569' }, status: { marginTop: 5, fontSize: 11, color: '#64748b' }, actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 11 }, action: { minHeight: 36, justifyContent: 'center', paddingHorizontal: 10, borderRadius: 8, borderWidth: 1, borderColor: '#bfdbfe', backgroundColor: '#eff6ff' }, actionText: { fontSize: 11, fontWeight: '800', color: '#1d4ed8' }, danger: { borderColor: '#fecaca', backgroundColor: '#fff1f2' }, dangerText: { fontSize: 11, fontWeight: '800', color: '#be123c' }, empty: { marginTop: 16, padding: 28, alignItems: 'center', borderRadius: 14, backgroundColor: '#fff' }, emptyTitle: { fontSize: 16, fontWeight: '800', color: '#334155' }, emptyBody: { marginTop: 8, textAlign: 'center', fontSize: 12, color: '#64748b' }, editRow: { flexDirection: 'row', alignItems: 'center', gap: 7 }, editInput: { flex: 1, minHeight: 42, paddingHorizontal: 10, borderWidth: 1, borderColor: '#60a5fa', borderRadius: 8, color: '#0f172a' }, smallPrimary: { minHeight: 42, justifyContent: 'center', paddingHorizontal: 11, borderRadius: 8, backgroundColor: '#2563eb' }, smallPrimaryText: { fontSize: 11, fontWeight: '800', color: '#fff' }, smallSecondary: { minHeight: 42, justifyContent: 'center', paddingHorizontal: 11, borderRadius: 8, backgroundColor: '#e2e8f0' }, smallSecondaryText: { fontSize: 11, fontWeight: '800', color: '#334155' },
  });

async function pickJsonFile(): Promise<string | null> {
  if (Platform.OS === 'web') {
    return new Promise<string | null>((resolve) => {
      const picker = document.createElement('input'); picker.type = 'file'; picker.accept = 'application/json,.json';
      picker.onchange = async () => { const file = picker.files?.[0]; resolve(file ? await file.text() : null); };
      picker.click();
    });
  }
  const picked = await DocumentPicker.getDocumentAsync({ type: 'application/json', copyToCacheDirectory: true });
  if (picked.canceled) return null;
  const FileSystem = await import('expo-file-system/legacy');
  return FileSystem.readAsStringAsync(picked.assets[0]!.uri, { encoding: FileSystem.EncodingType.UTF8 });
}

async function downloadJson(raw: string, filename: string, dialogTitle: string): Promise<void> {
  if (Platform.OS === 'web') {
    const url = URL.createObjectURL(new Blob([raw], { type: 'application/json;charset=utf-8' }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = filename; anchor.click(); URL.revokeObjectURL(url);
    return;
  }
  const FileSystem = await import('expo-file-system/legacy');
  const uri = `${FileSystem.cacheDirectory}${filename}`;
  await FileSystem.writeAsStringAsync(uri, raw, { encoding: FileSystem.EncodingType.UTF8 });
  if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri, { mimeType: 'application/json', dialogTitle });
  else throw new Error('이 기기에서는 파일 공유를 사용할 수 없습니다.');
}

async function confirmOverwrite(name: string): Promise<boolean> {
  const message = `"${name}" 프로젝트가 이미 있습니다. 현재 재단 결과로 기존 데이터를 덮어쓸까요?`;
  if (Platform.OS === 'web') return typeof window === 'undefined' ? true : window.confirm(message);
  return new Promise((resolve) => Alert.alert('프로젝트 덮어쓰기', message, [
    { text: '취소', style: 'cancel', onPress: () => resolve(false) },
    { text: '덮어쓰기', style: 'destructive', onPress: () => resolve(true) },
  ], { cancelable: true, onDismiss: () => resolve(false) }));
}

function safeFilename(value: string): string {
  return value.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').trim() || 'project';
}
