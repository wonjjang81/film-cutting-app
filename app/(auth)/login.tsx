import { router } from 'expo-router';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

// A static web build cannot provide a trustworthy authentication boundary.
export default function LoginScreen() {
  return <View style={styles.page}><Text style={styles.eyebrow}>LOCAL WORKSPACE</Text><Text style={styles.title}>필름 재단 계산기</Text><Text style={styles.body}>현재 GitHub Pages 버전은 서버 인증 없이 기기 저장 방식으로 동작합니다.</Text><TouchableOpacity accessibilityRole="button" onPress={() => router.replace('/input')} style={styles.button}><Text style={styles.buttonText}>작업 화면 열기</Text></TouchableOpacity><Text style={styles.hint}>보안 로그인·사용자별 동기화는 서버 인증 구축 후 제공됩니다.</Text></View>;
}

const styles = StyleSheet.create({ page: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: '#f1f5f9' }, eyebrow: { fontSize: 11, letterSpacing: 1.8, fontWeight: '800', color: '#2563eb' }, title: { marginTop: 8, fontSize: 30, fontWeight: '800', color: '#0f172a' }, body: { maxWidth: 420, marginTop: 12, textAlign: 'center', fontSize: 14, lineHeight: 21, color: '#64748b' }, button: { minHeight: 48, marginTop: 22, paddingHorizontal: 20, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: '#2563eb' }, buttonText: { fontSize: 13, fontWeight: '800', color: '#fff' }, hint: { maxWidth: 420, marginTop: 14, textAlign: 'center', fontSize: 11, lineHeight: 17, color: '#94a3b8' } });
