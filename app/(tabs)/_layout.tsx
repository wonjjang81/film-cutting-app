import { Tabs, router } from "expo-router";
import React, { useState, useEffect } from "react";
import { View, ActivityIndicator } from "react-native";

export default function TabLayout() {
  const [isAdmin, setIsAdmin] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    const checkAuth = () => {
      if (typeof localStorage !== 'undefined') {
        const adminStatus = localStorage.getItem("isAdmin") === "true";
        const loggedInStatus = adminStatus || 
                               localStorage.getItem("guestSession") !== null || 
                               localStorage.getItem("accessCodeValidated") === "true";
        setIsAdmin(adminStatus);
        setIsLoggedIn(loggedInStatus);
      }
      setIsReady(true);
    };
    
    checkAuth();
    // 로컬 스토리지 변경 감지 (로그인/로그아웃 대응)
    window.addEventListener('storage', checkAuth);
    return () => window.removeEventListener('storage', checkAuth);
  }, []);

  if (!isReady) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#007AFF" />
      </View>
    );
  }

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          display: isLoggedIn ? 'flex' : 'none',
        },
      }}
    >
      <Tabs.Screen
        name="login"
        options={{
          title: "로그인",
          // 이미 로그인했다면 탭에서 숨김
          href: isLoggedIn ? null : "/login",
        }}
      />
      <Tabs.Screen
        name="index"
        options={{
          title: "홈",
          // 로그인 안 했으면 탭 버튼 클릭 불가
          href: isLoggedIn ? "/index" : null,
        }}
      />
      <Tabs.Screen name="input" options={{ title: "입력", href: isLoggedIn ? "/input" : null }} />
      <Tabs.Screen name="cutting" options={{ title: "재단", href: isLoggedIn ? "/cutting" : null }} />
      <Tabs.Screen name="estimate" options={{ title: "견적", href: isLoggedIn ? "/estimate" : null }} />
      <Tabs.Screen name="settings" options={{ title: "설정", href: isLoggedIn ? "/settings" : null }} />
      <Tabs.Screen name="admin" options={{ title: "관리자", href: isAdmin ? "/admin" : null }} />
      <Tabs.Screen name="guide" options={{ href: null }} />
    </Tabs>
  );
}
