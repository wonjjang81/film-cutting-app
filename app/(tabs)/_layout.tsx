import { Tabs } from "expo-router";
import React, { useState, useEffect } from "react";
import { useAuth } from "@/app/contexts/AuthContext";

export default function TabLayout() {
  const { isAdmin, guestSession, accessCodeValidated, isLoading } = useAuth();
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  const isLoggedIn = isAdmin || guestSession !== null || accessCodeValidated;

  // 클라이언트 사이드 렌더링 대기
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
      {/* 
        비로그인 시 404를 방지하기 위해 href를 null로 만들지 않고, 
        각 화면 내부에서 리다이렉트를 처리하거나 
        탭 바에서만 숨기는 방식으로 접근합니다.
      */}
      <Tabs.Screen
        name="index"
        options={{
          title: "홈",
          // 비로그인 시에도 index 경로는 살아있어야 리다이렉트 로직이 작동함
          href: isLoggedIn ? "/index" : "/",
        }}
      />
      <Tabs.Screen
        name="login"
        options={{
          title: "로그인",
          href: isLoggedIn ? null : "/login",
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
