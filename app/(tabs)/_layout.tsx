import { Tabs } from 'expo-router';

export default function TabsLayout() {
  return (
    <Tabs screenOptions={{ headerTitle: '필름 재단 계산기' }}>
      <Tabs.Screen name="input" options={{ title: '계산' }} />
      <Tabs.Screen name="admin" options={{ href: null }} />
    </Tabs>
  );
}
