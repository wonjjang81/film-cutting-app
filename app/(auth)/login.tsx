import { Redirect, router } from 'expo-router';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useAuthSession } from '../../src/features/auth/AuthSession';

// A static web build cannot provide a trustworthy authentication boundary.
export default function LoginScreen() {
  const auth = useAuthSession();
  if (auth.state === 'authenticated') return <Redirect href="/input" />;
  if (auth.state === 'loading') return <View style={styles.page}><Text style={styles.title}>로그인 확인 중…</Text></View>;
  const local = auth.state === 'local';
  return <View style={styles.page}><Text style={styles.eyebrow}>{local ? 'LOCAL WORKSPACE' : 'SECURE TEAM WORKSPACE'}</Text><Text style={styles.title}>필름 재단 계산기</Text><Text style={styles.body}>{local ? 'GitHub Pages 버전은 서버 인증 없이 기기 저장 방식으로 동작합니다.' : '등록된 Google 계정으로 로그인해 프로젝트를 안전하게 불러오세요.'}</Text><TouchableOpacity accessibilityRole="button" accessibilityLabel={local ? '로컬 작업 화면 열기' : 'Google 계정으로 로그인'} onPress={() => local ? router.replace('/input') : auth.login()} style={styles.button}><Text style={styles.buttonText}>{local ? '작업 화면 열기' : 'Google 계정으로 로그인'}</Text></TouchableOpacity><Text style={styles.hint}>{local ? 'Cloudflare 운영 버전에서는 Google 로그인을 사용합니다.' : '등록되지 않은 계정은 로그인할 수 없습니다.'}</Text></View>;
}

const styles = StyleSheet.create({ page: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: '#f1f5f9' }, eyebrow: { fontSize: 11, letterSpacing: 1.8, fontWeight: '800', color: '#2563eb' }, title: { marginTop: 8, fontSize: 30, fontWeight: '800', color: '#0f172a' }, body: { maxWidth: 420, marginTop: 12, textAlign: 'center', fontSize: 14, lineHeight: 21, color: '#64748b' }, button: { minHeight: 48, marginTop: 22, paddingHorizontal: 20, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: '#2563eb' }, buttonText: { fontSize: 13, fontWeight: '800', color: '#fff' }, hint: { maxWidth: 420, marginTop: 14, textAlign: 'center', fontSize: 11, lineHeight: 17, color: '#94a3b8' } });
