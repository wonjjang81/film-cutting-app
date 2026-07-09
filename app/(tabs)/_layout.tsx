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

        // 로그인 안된 상태에서 다른 페이지 접근 시 로그인 페이지로 강제 이동
        if (!loggedInStatus && pathname !== "/login" && Platform.OS === 'web') {
          router.replace("/login");
        }
      }
      setIsReady(true);
    };
    
    checkAuth();
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

  const isLoginPage = pathname === "/login";
  const shouldHideTabBar = !isLoggedIn || isLoginPage;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: shouldHideTabBar ? { display: 'none' } : { height: 60, paddingBottom: 8 },
      }}
    >
      {/* 로그인 화면을 탭바의 가장 처음에 배치하여 기본 진입점으로 설정 */}
      <Tabs.Screen
        name="login"
        options={{
          title: "로그인",
          href: isLoggedIn ? null : "/login",
        }}
      />

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
      
      <Tabs.Screen
        name="admin"
        options={{
          title: "관리자",
          href: isAdmin ? "/admin" : null,
          tabBarIcon: () => "👑",
        }}
      />

      <Tabs.Screen name="guide" options={{ href: null }} />
    </Tabs>
  );
}
