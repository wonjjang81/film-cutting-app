import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';
import { Linking, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

const COMPANY_KEY = 'film-cutting-company-v1';

export default function SettingsScreen() {
  const [company, setCompany] = useState('');
  const [saved, setSaved] = useState(false);
  useEffect(() => { void AsyncStorage.getItem(COMPANY_KEY).then((value) => { if (value !== null) setCompany(value); }); }, []);
  const save = async (value: string) => { setCompany(value); setSaved(false); await AsyncStorage.setItem(COMPANY_KEY, value); setSaved(true); };
  return <View style={styles.page}>
    <View style={styles.content}>
      <Text style={styles.eyebrow}>SETTINGS</Text>
      <Text style={styles.title}>환경 설정</Text>
      <Text style={styles.subtitle}>견적서와 작업 화면에 사용할 정보를 관리합니다.</Text>
      <View style={styles.card}>
        <Text style={styles.label}>회사명</Text>
        <TextInput accessibilityLabel="회사명" value={company} onChangeText={(value) => void save(value)} placeholder="회사명을 입력하세요" placeholderTextColor="#94a3b8" style={styles.input} />
        <Text style={styles.hint}>{saved ? '자동 저장되었습니다.' : '입력 즉시 기기에 저장됩니다.'}</Text>
      </View>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>앱 정보</Text>
        <Text style={styles.info}>필름 재단 계산기 · 연속 롤 원단 절약 버전</Text>
        <Text style={styles.info}>원본 롤 폭 1,220mm · 기본 조건 여백 5mm</Text>
        <TouchableOpacity accessibilityRole="button" onPress={() => void Linking.openURL('https://wonjjang81.github.io/film-cutting-app/guide')} style={styles.link}><Text style={styles.linkText}>온라인 사용 안내 열기</Text></TouchableOpacity>
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
  hint: { marginTop: 7, fontSize: 11, color: '#64748b' },
  cardTitle: { fontSize: 15, fontWeight: '800', color: '#1e293b' },
  info: { marginTop: 8, fontSize: 13, color: '#64748b' },
  link: { alignSelf: 'flex-start', marginTop: 16, paddingVertical: 8 },
  linkText: { fontSize: 13, fontWeight: '800', color: '#2563eb' },
});
