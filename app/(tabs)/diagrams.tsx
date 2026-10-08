import { ScrollView, Text, View } from 'react-native';
import { ConstructionDiagram } from '../../src/features/diagrams/ConstructionDiagram';

export default function DiagramsScreen() {
  return <ScrollView contentContainerStyle={{ padding: 18, backgroundColor: '#f1f5f9' }}>
    <View><Text accessibilityRole="header" style={{ fontSize: 24, fontWeight: '800', color: '#0f172a' }}>모눈 도면제작</Text>
      <Text style={{ marginTop: 8, color: '#475569', lineHeight: 20 }}>시공부위별 형태와 프리셋을 제작합니다. 도면은 위치·형태 확인용이며, 실제 재단치수는 재단계산에서 입력합니다.</Text>
      <ConstructionDiagram mode="editor" />
    </View>
  </ScrollView>;
}
