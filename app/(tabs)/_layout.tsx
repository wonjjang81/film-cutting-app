import { Tabs } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Platform, Text, View } from "react-native";
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
  const { guestSession } = useGuestAuth();
  const { isAuthenticated } = useAuth();

  // 로그인 여부 판단
  const isLoggedIn = !!guestSession || !!isAuthenticated;

  return (
    <Tabs
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
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: "600",
          marginTop: 2,
        },
      }}
    >
      {/* 로그인 탭 - 항상 노출 및 활성화 */}
      <Tabs.Screen
        name="login"
        options={{
          title: "로그인",
          tabBarIcon: ({ focused }) => <TabIcon emoji="🔐" focused={focused} />,
        }}
      />

      {/* 홈 탭 */}
      <Tabs.Screen
        name="index"
        options={{
          title: "홈",
          tabBarIcon: ({ focused }) =>
            isLoggedIn ? (
              <TabIcon emoji="🏠" focused={focused} />
            ) : (
              <DisabledTabIcon />
            ),
          // 미로그인 시 탭 버튼을 빈 컴포넌트로 대체하여 클릭 방지
          tabBarButton: isLoggedIn ? HapticTab : () => null,
          // href를 null로 설정하여 접근 차단
          href: isLoggedIn ? "/(tabs)/index" : null,
        }}
      />

      {/* 입력 탭 */}
      <Tabs.Screen
        name="input"
        options={{
          title: "입력",
          tabBarIcon: ({ focused }) =>
            isLoggedIn ? (
              <TabIcon emoji="✏️" focused={focused} />
            ) : (
              <DisabledTabIcon />
            ),
          tabBarButton: isLoggedIn ? HapticTab : () => null,
          href: isLoggedIn ? "/(tabs)/input" : null,
        }}
      />

      {/* 재단 탭 */}
      <Tabs.Screen
        name="cutting"
        options={{
          title: "재단",
          tabBarIcon: ({ focused }) =>
            isLoggedIn ? (
              <TabIcon emoji="✂️" focused={focused} />
            ) : (
              <DisabledTabIcon />
            ),
          tabBarButton: isLoggedIn ? HapticTab : () => null,
          href: isLoggedIn ? "/(tabs)/cutting" : null,
        }}
      />

      {/* 견적 탭 */}
      <Tabs.Screen
        name="estimate"
        options={{
          title: "견적",
          tabBarIcon: ({ focused }) =>
            isLoggedIn ? (
              <TabIcon emoji="💰" focused={focused} />
            ) : (
              <DisabledTabIcon />
            ),
          tabBarButton: isLoggedIn ? HapticTab : () => null,
          href: isLoggedIn ? "/(tabs)/estimate" : null,
        }}
      />

      {/* 설정 탭 */}
      <Tabs.Screen
        name="settings"
        options={{
          title: "설정",
          tabBarIcon: ({ focused }) =>
            isLoggedIn ? (
              <TabIcon emoji="⚙️" focused={focused} />
            ) : (
              <DisabledTabIcon />
            ),
          tabBarButton: isLoggedIn ? HapticTab : () => null,
          href: isLoggedIn ? "/(tabs)/settings" : null,
        }}
      />

      {/* 가이드 탭 - 필요에 따라 활성화 가능 */}
      <Tabs.Screen
        name="guide"
        options={{
          href: null, // 탭 바에서 숨김
        }}
      />
    </Tabs>
  );
}
