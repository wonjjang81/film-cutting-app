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
          // 입력 탭이 첫 화면이므로 탭 바는 항상 보여주되, 
          // 비로그인 시에는 '입력' 탭 외의 다른 탭을 숨깁니다.
          display: 'flex',
        },
      }}
    >
      {/* 입력 탭: 항상 노출 */}
      <Tabs.Screen 
        name="input" 
        options={{ 
          title: "입력", 
          href: "/input" 
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
      <Tabs.Screen name="index" options={{ href: null }} />
      <Tabs.Screen name="login" options={{ href: null }} />
      <Tabs.Screen name="guide" options={{ href: null }} />
    </Tabs>
  );
}
