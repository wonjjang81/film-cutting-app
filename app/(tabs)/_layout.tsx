import { Tabs } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Platform, Text, View, ActivityIndicator } from "react-native";
import { useColors } from "@/hooks/use-colors";
import { HapticTab } from "@/components/haptic-tab";
import { useAuth as useGuestAuth } from "@/app/contexts/AuthContext";
import { useAuth } from "@/hooks/use-auth";

// 탭 아이콘을 이모지로 처리
function TabIcon({ emoji, focused }: { emoji: string; focused: boolean }) {
  return (
    <Text style={{ fontSize: 22, opacity: focused ? 1 : 0.5 }}>{emoji}</Text>
  );
}

// 비활성화된 탭 표시
function DisabledTabIcon() {
  return (
    <View style={{ alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ fontSize: 22, opacity: 0.3 }}>🔒</Text>
    </View>
  );
}

export default function TabLayout() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const bottomPadding = Platform.OS === "web" ? 12 : Math.max(insets.bottom, 8);
  const tabBarHeight = 60 + bottomPadding;

  // 인증 상태 확인
  const { guestSession, isAdmin } = useGuestAuth();
  const { isAuthenticated, loading } = useAuth();

  // 로그인 여부 판단
  const isLoggedIn = !!guestSession || !!isAuthenticated || isAdmin;

  // 로딩 중일 때는 로딩 표시
  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <Tabs
      initialRouteName={isLoggedIn ? "index" : "login"}
      screenOptions={{
        tabBarActiveTintColor: colors.primary,
        headerShown: false,
        tabBarButton: HapticTab,
        tabBarStyle: {
          paddingTop: 6,
          paddingBottom: bottomPadding,
          height: tabBarHeight,
          backgroundColor: colors.background,
          borderTopColor: colors.border,
          borderTopWidth: 0.5,
          display: isLoggedIn ? 'flex' : 'none', // 로그인 안되었을 때는 탭바 숨김
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: "600",
          marginTop: 2,
        },
      }}
    >
      {/* 로그인 탭 - 로그인 안된 경우에만 접근 가능하거나, 항상 첫 화면으로 사용 */}
      <Tabs.Screen
        name="login"
        options={{
          title: "로그인",
          tabBarIcon: ({ focused }) => <TabIcon emoji="🔐" focused={focused} />,
          href: isLoggedIn ? null : "/login", // 로그인 후에는 탭바에서 숨김
        }}
      />

      {/* 홈 탭 */}
      <Tabs.Screen
        name="index"
        options={{
          title: "홈",
          tabBarIcon: ({ focused }) => <TabIcon emoji="🏠" focused={focused} />,
          href: isLoggedIn ? "/index" : null,
        }}
      />

      {/* 입력 탭 */}
      <Tabs.Screen
        name="input"
        options={{
          title: "입력",
          tabBarIcon: ({ focused }) => <TabIcon emoji="✏️" focused={focused} />,
          href: isLoggedIn ? "/input" : null,
        }}
      />

      {/* 재단 탭 */}
      <Tabs.Screen
        name="cutting"
        options={{
          title: "재단",
          tabBarIcon: ({ focused }) => <TabIcon emoji="✂️" focused={focused} />,
          href: isLoggedIn ? "/cutting" : null,
        }}
      />

      {/* 견적 탭 */}
      <Tabs.Screen
        name="estimate"
        options={{
          title: "견적",
          tabBarIcon: ({ focused }) => <TabIcon emoji="💰" focused={focused} />,
          href: isLoggedIn ? "/estimate" : null,
        }}
      />

      {/* 설정 탭 */}
      <Tabs.Screen
        name="settings"
        options={{
          title: "설정",
          tabBarIcon: ({ focused }) => <TabIcon emoji="⚙️" focused={focused} />,
          href: isLoggedIn ? "/settings" : null,
        }}
      />

      {/* 관리자 탭 - 관리자인 경우에만 노출 */}
      <Tabs.Screen
        name="admin"
        options={{
          title: "관리자",
          tabBarIcon: ({ focused }) => <TabIcon emoji="👨‍💼" focused={focused} />,
          href: isAdmin ? "/admin" : null,
        }}
      />

      {/* 가이드 탭 - 탭 바에서 숨김 */}
      <Tabs.Screen
        name="guide"
        options={{
          href: null,
        }}
      />
    </Tabs>
  );
}
