import { StyleSheet, Text, View } from 'react-native';

export default function AdminScreen() {
  return (
    <View style={styles.container} accessibilityRole="summary">
      <Text style={styles.title}>관리 기능 준비 중</Text>
      <Text style={styles.body}>안전한 서버 인증과 권한 검사가 적용될 때까지 관리자 기능을 사용할 수 없습니다.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: '#f8fafc' },
  title: { fontSize: 22, fontWeight: '700', color: '#0f172a', marginBottom: 12 },
  body: { maxWidth: 480, textAlign: 'center', fontSize: 16, lineHeight: 24, color: '#475569' },
});
