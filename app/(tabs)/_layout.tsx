import { Tabs, usePathname, router } from "expo-router";
import React, { useState, useEffect } from "react";
import { View, ActivityIndicator, Platform } from "react-native";

export default function TabLayout() {
  const [isAdmin, setIsAdmin] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    const checkAuth = () => {
      if (typeof localStorage !== 'undefined') {
        const adminStatus = localStorage.getItem("isAdmin") === "true";
        const guestSession = localStorage.getItem("guestSession");
        const accessCodeValidated = localStorage.getItem("accessCodeValidated") === "true";
        const loggedInStatus = adminStatus || guestSession !== null || accessCodeValidated;
        
        setIsAdmin(adminStatus);
        setIsLoggedIn(loggedInStatus);

        // 현재 경로가 로그인 페이지가 아닌데 로그인이 안 되어 있다면 로그인 페이지로 강제 이동
        if (!loggedInStatus && pathname !== "/login" && Platform.OS === 'web') {
          router.replace("/login");
        }
      }
      setIsReady(true);
    };
    
    checkAuth();
    // 상태 변화를 감지하기 위해 인터벌 유지
    const interval = setInterval(checkAuth, 500);
    return () => clearInterval(interval);
  }, [pathname]);

  if (!isReady) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#fff' }}>
        <ActivityIndicator size="large" color="#007AFF" />
      </View>
    );
  }

  // 로그인 여부 및 현재 경로에 따른 탭바 노출 결정
  const isLoginPage = pathname === "/login";
  const shouldHideTabBar = !isLoggedIn || isLoginPage;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: shouldHideTabBar ? { display: 'none' } : { height: 60, paddingBottom: 8 },
      }}
    >
      {/* 로그인 화면: 로그인이 안 된 경우에만 활성화 */}
      <Tabs.Screen
        name="login"
        options={{
          title: "로그인",
          href: isLoggedIn ? null : "/login",
        }}
      />

      {/* 메인 화면들: 로그인 된 경우에만 활성화 */}
      <Tabs.Screen
        name="index"
        options={{
          title: "홈",
          href: isLoggedIn ? "/" : null,
          tabBarIcon: () => "🏠",
        }}
      />
      <Tabs.Screen
        name="input"
        options={{
          title: "입력",
          href: isLoggedIn ? "/input" : null,
          tabBarIcon: () => "✏️",
        }}
      />
      <Tabs.Screen
        name="cutting"
        options={{
          title: "재단",
          href: isLoggedIn ? "/cutting" : null,
          tabBarIcon: () => "✂️",
        }}
      />
      <Tabs.Screen
        name="estimate"
        options={{
          title: "견적",
          href: isLoggedIn ? "/estimate" : null,
          tabBarIcon: () => "💰",
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: "설정",
          href: isLoggedIn ? "/settings" : null,
          tabBarIcon: () => "⚙️",
        }}
      />
      
      {/* 관리자 전용 탭 */}
      <Tabs.Screen
        name="admin"
        options={{
          title: "관리자",
          href: isAdmin ? "/admin" : null,
          tabBarIcon: () => "👑",
        }}
      />

      {/* 가이드 등 숨겨진 탭 */}
      <Tabs.Screen name="guide" options={{ href: null }} />
    </Tabs>
  );
}
