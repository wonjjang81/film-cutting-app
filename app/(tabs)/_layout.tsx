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

  if (!isClient) return null;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          display: 'flex',
        },
      }}
    >
      {/* 입력 탭: 첫 화면 (사용자 요청에 따라 첫 번째 배치) */}
      <Tabs.Screen 
        name="input" 
        options={{ 
          title: "입력", 
          href: "/input" 
        }} 
      />
      
      {/* 홈 탭: 프로젝트 관리 (복구됨) */}
      <Tabs.Screen
        name="index"
        options={{
          title: "관리",
          href: isLoggedIn ? "/index" : null,
        }}
      />
      
      {/* 나머지 탭: 로그인 시에만 노출 */}
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

      {/* 숨겨진 탭들 */}
      <Tabs.Screen name="login" options={{ href: null }} />
      <Tabs.Screen name="guide" options={{ href: null }} />
    </Tabs>
  );
}
