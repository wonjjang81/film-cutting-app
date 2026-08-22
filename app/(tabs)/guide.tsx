import { ScrollView, StyleSheet, Text, View } from 'react-native';

const sections = [
  ['1. 입력', '브랜드를 선택하고 재단 폭·길이·필요 수량만 입력합니다. 원본 롤 폭은 1,220mm로 고정되며 기본 조건은 간격 0mm, 좌우 여백 5mm, 시작·끝 여백 5mm입니다.'],
  ['2. 그룹 배치', '그룹 추가로 여러 제품을 한 번에 관리할 수 있습니다. 그룹 안에서 조각을 추가한 뒤 전체 그룹 계산을 누르면 원단 절약 순서로 순차 배치합니다.'],
  ['3. 자투리 필름', '자투리 사용을 켜면 저장된 자투리의 실제 폭·길이를 기준으로 사용할 수 있는 조각만 계산합니다. 기본값은 꺼짐이며, 재단 확정 후 남은 자투리는 자동 저장됩니다.'],
  ['4. 재단 완료', '배치 미리보기의 체크박스 또는 재단 완료 버튼으로 진행 상태를 저장할 수 있습니다. 완료된 조각은 미리보기에서 X 표시로 구분됩니다.'],
  ['5. 프로젝트 관리', '프로젝트 저장으로 작업 이력을 남기고, 라이브러리에서 검색·이름 변경·재계산·삭제를 할 수 있습니다. 백업 내보내기/불러오기로 다른 기기와 JSON 파일을 교환할 수 있습니다.'],
  ['6. 견적', '견적 탭에서 원단 단가·시공 단가와 할인율을 조정할 수 있으며, 면적 기반 자동 할인 또는 사용자 할인율을 선택해 PDF로 출력할 수 있습니다.'],
] as const;

export default function GuideScreen() {
  return <ScrollView style={styles.page} contentContainerStyle={styles.content}>
    <Text style={styles.eyebrow}>GUIDE</Text>
    <Text style={styles.title}>필름 재단 사용 안내</Text>
    <Text style={styles.subtitle}>원단 절약을 우선하는 연속 롤 재단 workflow입니다.</Text>
    <View style={styles.card}>{sections.map(([title, body]) => <View key={title} style={styles.section}><Text style={styles.sectionTitle}>{title}</Text><Text style={styles.body}>{body}</Text></View>)}</View>
  </ScrollView>;
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#f1f5f9' },
  content: { width: '100%', maxWidth: 900, alignSelf: 'center', padding: 24, paddingBottom: 70 },
  eyebrow: { fontSize: 11, letterSpacing: 1.8, fontWeight: '800', color: '#2563eb' },
  title: { marginTop: 7, fontSize: 30, fontWeight: '800', color: '#0f172a' },
  subtitle: { marginTop: 7, fontSize: 14, color: '#64748b' },
  card: { marginTop: 24, padding: 22, borderRadius: 18, backgroundColor: '#fff', shadowColor: '#0f172a', shadowOpacity: 0.07, shadowRadius: 20, shadowOffset: { width: 0, height: 8 }, elevation: 2 },
  section: { paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: '#e2e8f0' },
  sectionTitle: { fontSize: 15, fontWeight: '800', color: '#1e293b' },
  body: { marginTop: 7, fontSize: 13, lineHeight: 21, color: '#475569' },
});
