import { useState } from 'react';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { ConstructionDiagram } from '../../src/features/diagrams/ConstructionDiagram';

export default function DiagramsScreen() {
  const [view, setView] = useState<'cabinet' | 'editor'>('cabinet');
  return <ScrollView contentContainerStyle={{ padding: 18, backgroundColor: '#f1f5f9' }}>
    <View><Text accessibilityRole="header" style={{ fontSize: 24, fontWeight: '800', color: '#0f172a' }}>시공부위 도면 · 프리셋</Text>
      <View accessibilityRole="tablist" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 14 }}>
        {([['cabinet', '시공부위 도면'], ['editor', '새 프리셋 제작 · 모눈']] as const).map(([key, label]) => <TouchableOpacity key={key} accessibilityRole="tab" accessibilityState={{ selected: view === key }} onPress={() => setView(key)} style={{ flexGrow: 1, padding: 12, borderRadius: 8, backgroundColor: view === key ? '#2563eb' : '#e2e8f0' }}><Text style={{ textAlign: 'center', color: view === key ? '#fff' : '#334155', fontWeight: '700' }}>{label}</Text></TouchableOpacity>)}
      </View>
      <Text style={{ marginTop: 8, color: '#475569', lineHeight: 20 }}>{view === 'cabinet' ? '장 추가·형태 변경·삭제를 관리합니다. 치수 입력은 재단계산의 도면선택 카드에서 진행합니다.' : '새 프리셋을 모눈으로 제작합니다. 기존 장 도면과 별도로 보관하며 실측치수를 자동 생성하지 않습니다.'}</Text>
      <ConstructionDiagram key={view} mode={view} />
    </View>
  </ScrollView>;
}
