import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useAuthSession } from '../../src/features/auth/AuthSession';
import { configuredCloudflareUrl } from '../../src/features/library/libraryRepositoryFactory';

type Member = { id: string; email: string; role: 'owner' | 'member'; status: string };

export default function AdminScreen() {
  const { state, user } = useAuthSession();
  const [members, setMembers] = useState<Member[]>([]);
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const baseUrl = configuredCloudflareUrl()?.replace(/\/$/, '') ?? '';
  const load = useCallback(async () => {
    if (state !== 'authenticated' || user?.role !== 'owner') return;
    setBusy(true);
    try {
      const response = await fetch(`${baseUrl}/api/admin/members`, { credentials: 'include', cache: 'no-store' });
      const body = await response.json() as { members?: Member[]; error?: string };
      if (!response.ok) throw new Error(body.error ?? '회원 목록을 불러오지 못했습니다.');
      setMembers(body.members ?? []);
    } catch (error) { setMessage(error instanceof Error ? error.message : '오류가 발생했습니다.'); }
    finally { setBusy(false); }
  }, [baseUrl, state, user?.role]);
  useEffect(() => { void load(); }, [load]);
  const invite = async () => {
    setBusy(true); setMessage('');
    try {
      const response = await fetch(`${baseUrl}/api/admin/members`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error ?? '초대하지 못했습니다.');
      setEmail(''); setMessage('회원 이메일을 등록했습니다.'); await load();
    } catch (error) { setMessage(error instanceof Error ? error.message : '오류가 발생했습니다.'); }
    finally { setBusy(false); }
  };
  const setStatus = async (member: Member) => {
    const status = member.status === 'active' ? 'disabled' : 'active';
    setBusy(true); setMessage('');
    try {
      const response = await fetch(`${baseUrl}/api/admin/members`, { method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId: member.id, status }) });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error ?? '상태를 변경하지 못했습니다.');
      await load();
    } catch (error) { setMessage(error instanceof Error ? error.message : '오류가 발생했습니다.'); }
    finally { setBusy(false); }
  };
  if (state === 'local') return <View style={styles.center}><Text style={styles.title}>로컬 모드</Text><Text style={styles.body}>회원 관리는 Cloudflare 배포 환경에서 사용합니다.</Text></View>;
  if (state === 'loading' || busy && !members.length) return <View style={styles.center}><ActivityIndicator /></View>;
  if (user?.role !== 'owner') return <View style={styles.center}><Text style={styles.title}>접근 권한 없음</Text></View>;
  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>회원 관리</Text>
      <Text style={styles.body}>등록된 이메일만 Google 로그인할 수 있습니다.</Text>
      <View style={styles.inviteRow}><TextInput autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail} placeholder="회원 Google 이메일" style={styles.input} /><Pressable disabled={busy || !email.trim()} onPress={invite} style={styles.primary}><Text style={styles.primaryText}>등록</Text></Pressable></View>
      {!!message && <Text style={styles.message}>{message}</Text>}
      {members.map((member) => <View key={member.id} style={styles.memberRow}><View style={styles.memberText}><Text style={styles.email}>{member.email}</Text><Text style={styles.meta}>{member.role === 'owner' ? '관리자' : '회원'} · {member.status}</Text></View>{member.role === 'member' && <Pressable disabled={busy} onPress={() => void setStatus(member)} style={styles.secondary}><Text>{member.status === 'active' ? '사용 중지' : '사용 승인'}</Text></Pressable>}</View>)}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, padding: 24, backgroundColor: '#f8fafc', gap: 12 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: '#f8fafc' },
  title: { fontSize: 22, fontWeight: '700', color: '#0f172a', marginBottom: 12 },
  body: { fontSize: 15, lineHeight: 22, color: '#475569' },
  inviteRow: { flexDirection: 'row', gap: 8 },
  input: { flex: 1, minHeight: 46, borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 10, paddingHorizontal: 12, backgroundColor: '#fff' },
  primary: { minWidth: 72, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: '#2563eb', paddingHorizontal: 16 },
  primaryText: { color: '#fff', fontWeight: '700' },
  message: { color: '#0369a1' },
  memberRow: { flexDirection: 'row', alignItems: 'center', padding: 14, borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 12, backgroundColor: '#fff' },
  memberText: { flex: 1 },
  email: { color: '#0f172a', fontWeight: '700' },
  meta: { marginTop: 4, color: '#64748b' },
  secondary: { borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 8, paddingVertical: 8, paddingHorizontal: 12 },
});
