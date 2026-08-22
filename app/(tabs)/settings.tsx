import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';
import { Linking, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { APP_VERSION, LOCAL_PROFILE_STORAGE_KEY } from '../../src/features/settings/appInfo';
import { COMPANY_INFO_STORAGE_KEY, emptyCompanyInfo, LEGACY_COMPANY_NAME_STORAGE_KEY, parseCompanyInfo, type CompanyInfo } from '../../src/features/settings/companyInfo';
import { configuredCloudflareUrl } from '../../src/features/library/libraryRepositoryFactory';
import { checkCloudflareHealth } from '../../src/features/settings/cloudflareStatus';

export default function SettingsScreen() {
  const [info, setInfo] = useState<CompanyInfo>(emptyCompanyInfo);
  const [profile, setProfile] = useState('');
  const [release, setRelease] = useState<string | null>(null);
  const [updateMessage, setUpdateMessage] = useState('업데이트 확인 전');
  const [saved, setSaved] = useState(false);
  const cloudflareUrl = configuredCloudflareUrl();
  const [serverMessage, setServerMessage] = useState(cloudflareUrl ? '연결 확인 전' : '로컬 저장 모드');
  const [serverBusy, setServerBusy] = useState(false);
  useEffect(() => { void (async () => { const current = await AsyncStorage.getItem(COMPANY_INFO_STORAGE_KEY); if (current) setInfo(parseCompanyInfo(current)); else { const legacy = await AsyncStorage.getItem(LEGACY_COMPANY_NAME_STORAGE_KEY); if (legacy) { const migrated = { ...emptyCompanyInfo, companyName: parseCompanyInfo(JSON.stringify(legacy)).companyName }; setInfo(migrated); await AsyncStorage.setItem(COMPANY_INFO_STORAGE_KEY, JSON.stringify(migrated)); } } setProfile((await AsyncStorage.getItem(LOCAL_PROFILE_STORAGE_KEY)) ?? ''); })(); }, []);
  const save = async (field: keyof CompanyInfo, value: string) => { const next = { ...info, [field]: value }; setInfo(next); setSaved(false); await AsyncStorage.setItem(COMPANY_INFO_STORAGE_KEY, JSON.stringify(next)); setSaved(true); };
  const checkUpdate = async () => { setUpdateMessage('최신 버전 확인 중…'); try { const response = await fetch('https://api.github.com/repos/wonjjang81/film-cutting-app/releases/latest', { headers: { Accept: 'application/vnd.github+json' } }); if (!response.ok) throw new Error('release unavailable'); const data = await response.json() as { tag_name?: string }; const latest = data.tag_name ?? ''; setRelease(latest); setUpdateMessage(latest && latest !== APP_VERSION ? `새 버전 ${latest}을(를) 사용할 수 있습니다.` : '현재 최신 버전입니다.'); } catch { setUpdateMessage('릴리스 정보를 확인할 수 없습니다.'); } };
  const saveProfile = async (value: string) => { setProfile(value); await AsyncStorage.setItem(LOCAL_PROFILE_STORAGE_KEY, value); };
  const clearLocalProfile = async () => { await AsyncStorage.removeItem(LOCAL_PROFILE_STORAGE_KEY); setProfile(''); setUpdateMessage('로컬 작업자 세션을 초기화했습니다.'); };
  const checkServer = async () => {
    if (!cloudflareUrl) return;
    setServerBusy(true); setServerMessage('Cloudflare API 확인 중…');
    try { const health = await checkCloudflareHealth(cloudflareUrl); setServerMessage(health.databaseConfigured ? 'Cloudflare API·D1 연결 정상' : 'API 연결됨 · D1 바인딩 미설정'); }
    catch (error) { setServerMessage(error instanceof Error ? error.message : 'Cloudflare API에 연결할 수 없습니다.'); }
    finally { setServerBusy(false); }
  };
  return <View style={styles.page}>
    <View style={styles.content}>
      <Text style={styles.eyebrow}>SETTINGS</Text>
      <Text style={styles.title}>환경 설정</Text>
      <Text style={styles.subtitle}>견적서와 작업 화면에 사용할 정보를 관리합니다.</Text>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>서버 저장소</Text>
        <Text style={styles.info}>{cloudflareUrl ? `API 주소 ${cloudflareUrl}` : 'EXPO_PUBLIC_CLOUDFLARE_API_URL 미설정'}</Text>
        <Text style={styles.hint}>{serverMessage}</Text>
        {cloudflareUrl && <TouchableOpacity accessibilityRole="button" disabled={serverBusy} onPress={() => void checkServer()} style={[styles.updateButton, serverBusy && styles.disabled]}><Text style={styles.updateButtonText}>{serverBusy ? '확인 중…' : 'Cloudflare 연결 확인'}</Text></TouchableOpacity>}
        <Text style={styles.hint}>주소를 설정하지 않으면 기존 기기별 로컬 저장소를 사용합니다.</Text>
      </View>
      <View style={styles.card}>
        <Text style={styles.label}>견적서 회사 정보</Text>
        {([['companyName', '회사명'], ['managerName', '담당자'], ['phone', '연락처'], ['email', '이메일'], ['address', '주소'], ['note', '견적서 메모']] as const).map(([field, label]) => <TextInput key={field} accessibilityLabel={label} value={info[field]} onChangeText={(value) => void save(field, value)} placeholder={label} placeholderTextColor="#94a3b8" multiline={field === 'note'} style={[styles.input, field === 'note' && styles.noteInput]} />)}
        <Text style={styles.hint}>{saved ? '자동 저장되었습니다.' : '입력 즉시 기기에 저장됩니다.'}</Text>
      </View>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>로컬 작업자 프로필</Text>
        <TextInput accessibilityLabel="작업자 이름" value={profile} onChangeText={(value) => void saveProfile(value)} placeholder="작업자 이름" placeholderTextColor="#94a3b8" style={styles.input} />
        <Text style={styles.hint}>정적 웹 앱의 기기별 표시 이름이며 보안 로그인은 아닙니다.</Text>
        <TouchableOpacity accessibilityRole="button" onPress={() => void clearLocalProfile()} style={styles.dangerButton}><Text style={styles.dangerText}>로컬 세션 초기화</Text></TouchableOpacity>
      </View>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>앱 정보</Text>
        <Text style={styles.info}>현재 버전 {APP_VERSION}</Text>
        <Text style={styles.info}>필름 재단 계산기 · 연속 롤 원단 절약 버전</Text>
        <Text style={styles.info}>원본 롤 폭 1,220mm · 기본 조건 여백 5mm</Text>
        <TouchableOpacity accessibilityRole="button" onPress={() => void Linking.openURL('https://wonjjang81.github.io/film-cutting-app/guide')} style={styles.link}><Text style={styles.linkText}>온라인 사용 안내 열기</Text></TouchableOpacity>
        <TouchableOpacity accessibilityRole="button" onPress={() => void checkUpdate()} style={styles.updateButton}><Text style={styles.updateButtonText}>최신 버전 확인</Text></TouchableOpacity>
        <Text style={styles.hint}>{updateMessage}{release ? ` · ${release}` : ''}</Text>
        <TouchableOpacity accessibilityRole="button" onPress={() => void Linking.openURL('https://github.com/wonjjang81/film-cutting-app/releases')} style={styles.link}><Text style={styles.linkText}>GitHub 릴리스 열기</Text></TouchableOpacity>
      </View>
    </View>
  </View>;
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#f1f5f9' },
  content: { width: '100%', maxWidth: 900, alignSelf: 'center', padding: 24 },
  eyebrow: { fontSize: 11, letterSpacing: 1.8, fontWeight: '800', color: '#2563eb' },
  title: { marginTop: 7, fontSize: 30, fontWeight: '800', color: '#0f172a' },
  subtitle: { marginTop: 7, fontSize: 14, color: '#64748b' },
  card: { marginTop: 24, padding: 20, borderRadius: 18, backgroundColor: '#fff', shadowColor: '#0f172a', shadowOpacity: 0.07, shadowRadius: 20, shadowOffset: { width: 0, height: 8 }, elevation: 2 },
  label: { fontSize: 13, fontWeight: '800', color: '#334155' },
  input: { minHeight: 48, marginTop: 9, paddingHorizontal: 13, borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 10, fontSize: 15, color: '#0f172a', backgroundColor: '#f8fafc' },
  noteInput: { minHeight: 76, paddingTop: 12, textAlignVertical: 'top' },
  hint: { marginTop: 7, fontSize: 11, color: '#64748b' },
  dangerButton: { alignSelf: 'flex-start', minHeight: 40, marginTop: 12, justifyContent: 'center', paddingHorizontal: 12, borderWidth: 1, borderColor: '#fecaca', borderRadius: 8, backgroundColor: '#fff1f2' },
  dangerText: { fontSize: 11, fontWeight: '800', color: '#be123c' },
  cardTitle: { fontSize: 15, fontWeight: '800', color: '#1e293b' },
  info: { marginTop: 8, fontSize: 13, color: '#64748b' },
  link: { alignSelf: 'flex-start', marginTop: 16, paddingVertical: 8 },
  linkText: { fontSize: 13, fontWeight: '800', color: '#2563eb' },
  updateButton: { alignSelf: 'flex-start', minHeight: 40, marginTop: 10, justifyContent: 'center', paddingHorizontal: 12, borderRadius: 8, backgroundColor: '#2563eb' },
  updateButtonText: { fontSize: 11, fontWeight: '800', color: '#fff' },
  disabled: { opacity: 0.45 },
});
