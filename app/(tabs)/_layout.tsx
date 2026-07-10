import { Tabs } from "expo-router";
import React, { useState, useEffect } from "react";
import { useAuth } from "@/app/contexts/AuthContext";

export default function TabLayout() {
  const { isAdmin, guestSession, accessCodeValidated } = useAuth();
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  const isLoggedIn = isAdmin || guestSession !== null || accessCodeValidated;

  // 클라이언트 사이드 렌더링 대기 (하이드레이션 오류 방지)
  if (!isClient) return null;

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
          href: isLoggedIn ? null : "/login",
        }}
      />
      <Tabs.Screen
        name="index"
        options={{
          title: "홈",
          href: isLoggedIn ? "/index" : null,
        }}
      />
      <Tabs.Screen 
        name="input" 
        options={{ 
          title: "입력", 
          href: isLoggedIn ? "/input" : null 
        }} 
      />
      <Tabs.Screen 
        name="cutting" 
        options={{ 
          title: "재단", 
          href: isLoggedIn ? "/cutting" : null 
        }} 
      />
      <Tabs.Screen 
        name="estimate" 
        options={{ 
          title: "견적", 
          href: isLoggedIn ? "/estimate" : null 
        }} 
      />
      <Tabs.Screen 
        name="settings" 
        options={{ 
          title: "설정", 
          href: isLoggedIn ? "/settings" : null 
        }} 
      />
      <Tabs.Screen 
        name="admin" 
        options={{ 
          title: "관리자", 
          href: isAdmin ? "/admin" : null 
        }} 
      />
      <Tabs.Screen name="guide" options={{ href: null }} />
    </Tabs>
  );
}
