import { Redirect, Tabs } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';
import { useAuthSession } from '../../src/features/auth/AuthSession';
import {
  CircleHelp,
  ClipboardList,
  FolderOpen,
  ReceiptText,
  Scissors,
  Settings,
  SlidersHorizontal,
} from 'lucide-react-native';

type TabIconProps = {
  color: string;
  size: number;
};

// Keep the tab icons SVG-based. Expo's icon font can render as a tofu/X when
// the font asset is blocked or delayed by a hosted web deployment.
const TabIcon = ({ Icon, color, size }: TabIconProps & { Icon: typeof FolderOpen }) => (
  <Icon color={color} size={size} strokeWidth={2.25} />
);

export default function TabsLayout() {
  const auth = useAuthSession();
  if (auth.state === 'loading') return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color="#2563eb" /></View>;
  if (auth.state === 'unauthenticated') return <Redirect href="/login" />;
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
          tabBarIcon: ({ color, size }) => <TabIcon Icon={FolderOpen} color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="input"
        options={{
          title: '재단 계산',
          href: '/input',
          tabBarIcon: ({ color, size }) => <TabIcon Icon={Scissors} color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="planning"
        options={{
          title: '배치 계획',
          href: '/planning',
          tabBarIcon: ({ color, size }) => <TabIcon Icon={ClipboardList} color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="estimate"
        options={{
          title: '견적',
          tabBarIcon: ({ color, size }) => <TabIcon Icon={ReceiptText} color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="admin"
        options={{
          title: '관리',
          href: auth.state === 'local' || auth.user?.role === 'owner' ? '/admin' : null,
          tabBarIcon: ({ color, size }) => <TabIcon Icon={Settings} color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="guide"
        options={{
          title: '사용 안내',
          tabBarIcon: ({ color, size }) => <TabIcon Icon={CircleHelp} color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: '설정',
          tabBarIcon: ({ color, size }) => <TabIcon Icon={SlidersHorizontal} color={color} size={size} />,
        }}
      />
    </Tabs>
  );
}
