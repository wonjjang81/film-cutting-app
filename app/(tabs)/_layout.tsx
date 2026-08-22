import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#2563eb',
        tabBarInactiveTintColor: '#64748b',
        tabBarLabelStyle: { fontSize: 11, fontWeight: '800' },
        tabBarStyle: {
          height: 70,
          paddingTop: 8,
          paddingBottom: 9,
          borderTopWidth: 1,
          borderTopColor: '#e2e8f0',
          backgroundColor: '#ffffff',
          elevation: 10,
          shadowColor: '#0f172a',
          shadowOpacity: 0.08,
          shadowRadius: 12,
          shadowOffset: { width: 0, height: -4 },
        },
        tabBarHideOnKeyboard: true,
      }}
    >
      <Tabs.Screen
        name="projects"
        options={{
          title: '프로젝트',
          href: '/projects' as any,
          tabBarIcon: ({ color, size }) => <Ionicons name="folder-open-outline" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="input"
        options={{
          title: '재단 계산',
          href: '/input',
          tabBarIcon: ({ color, size }) => <Ionicons name="cut-outline" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="estimate"
        options={{
          title: '견적',
          tabBarIcon: ({ color, size }) => <Ionicons name="receipt-outline" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="admin"
        options={{
          title: '관리',
          href: '/admin',
          tabBarIcon: ({ color, size }) => <Ionicons name="settings-outline" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="guide"
        options={{
          title: '사용 안내',
          tabBarIcon: ({ color, size }) => <Ionicons name="help-circle-outline" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: '설정',
          tabBarIcon: ({ color, size }) => <Ionicons name="options-outline" color={color} size={size} />,
        }}
      />
    </Tabs>
  );
}
