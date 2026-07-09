import { Tabs } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Platform, Text, View, ActivityIndicator } from "react-native";
import { useColors } from "@/hooks/use-colors";
import { HapticTab } from "@/components/haptic-tab";
import { useAuth as useGuestAuth } from "@/app/contexts/AuthContext";
import { useAuth } from "@/hooks/use-auth";
import React, { useState, useEffect } from "react";

// 탭 아이콘을 이모지로 처리
function TabIcon({ emoji, focused }: { emoji: string; focused: boolean }) {
  return (
    <Text style={{ fontSize: 22, opacity: focused ? 1 : 0.5 }}>{emoji}</Text>
  );
}

export default function TabLayout() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const bottomPadding = Platform.OS === "web" ? 12 : Math.max(insets.bottom, 8);
  const tabBarHeight = 60 + bottomPadding;

  // 인증 상태 확인
  const { guestSession, isAdmin } = useGuestAuth();
  const { isAuthenticated, loading: authLoading } = useAuth();

  // 로딩 상태 강제 해제 타이머 (최대 3초)
  const [forceReady, setForceReady] = useState(false);
  
  useEffect(() => {
    const timer = setTimeout(() => {
      setForceReady(true);
    }, 3000);
    return () => clearTimeout(timer);
  }, []);

  // 로그인 여부 판단
  const isLoggedIn = !!guestSession || !!isAuthenticated || isAdmin;
  
  // 로딩 중 판단 (authLoading이 true이면서 아직 3초가 지나지 않았을 때만 로딩 표시)
  const isLoading = authLoading && !forceReady;

  if (isLoading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background }}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={{ marginTop: 16, color: colors.muted }}>인증 정보를 확인 중입니다...</Text>
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
      <Tabs.Screen
        name="login"
        options={{
          title: "로그인",
          tabBarIcon: ({ focused }) => <TabIcon emoji="🔐" focused={focused} />,
          href: isLoggedIn ? null : "/login",
        }}
      />

      <Tabs.Screen
        name="index"
        options={{
          title: "홈",
          tabBarIcon: ({ focused }) => <TabIcon emoji="🏠" focused={focused} />,
          href: isLoggedIn ? "/index" : null,
        }}
      />

      <Tabs.Screen
        name="input"
        options={{
          title: "입력",
          tabBarIcon: ({ focused }) => <TabIcon emoji="✏️" focused={focused} />,
          href: isLoggedIn ? "/input" : null,
        }}
      />

      <Tabs.Screen
        name="cutting"
        options={{
          title: "재단",
          tabBarIcon: ({ focused }) => <TabIcon emoji="✂️" focused={focused} />,
          href: isLoggedIn ? "/cutting" : null,
        }}
      />

      <Tabs.Screen
        name="estimate"
        options={{
          title: "견적",
          tabBarIcon: ({ focused }) => <TabIcon emoji="💰" focused={focused} />,
          href: isLoggedIn ? "/estimate" : null,
        }}
      />

      <Tabs.Screen
        name="settings"
        options={{
          title: "설정",
          tabBarIcon: ({ focused }) => <TabIcon emoji="⚙️" focused={focused} />,
          href: isLoggedIn ? "/settings" : null,
        }}
      />

      <Tabs.Screen
        name="admin"
        options={{
          title: "관리자",
          tabBarIcon: ({ focused }) => <TabIcon emoji="👨‍💼" focused={focused} />,
          href: isAdmin ? "/admin" : null,
        }}
      />

      <Tabs.Screen
        name="guide"
        options={{
          href: null,
        }}
      />
    </Tabs>
  );
}
