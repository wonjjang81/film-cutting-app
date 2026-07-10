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
        tabBarActiveTintColor: '#2563eb',
      }}
    >
      {/* 1. 로그인 탭 (로그인 안된 경우에만 탭 바에 표시될 수도 있지만, 보통은 숨김) */}
      <Tabs.Screen
        name="login"
        options={{
          title: "로그인",
          href: null, // 로그인 화면은 탭 바에 노출하지 않음
        }}
      />

      {/* 2. 홈/관리 탭 */}
      <Tabs.Screen
        name="index"
        options={{
          title: "관리",
          href: isLoggedIn ? "/index" : null,
        }}
      />

      {/* 3. 입력 탭 */}
      <Tabs.Screen 
        name="input" 
        options={{ 
          title: "입력", 
          href: isLoggedIn ? "/input" : null 
        }} 
      />

      {/* 4. 재단 탭 */}
      <Tabs.Screen 
        name="cutting" 
        options={{ 
          title: "재단", 
          href: isLoggedIn ? "/cutting" : null 
        }} 
      />

      {/* 5. 견적 탭 */}
      <Tabs.Screen 
        name="estimate" 
        options={{ 
          title: "견적", 
          href: isLoggedIn ? "/estimate" : null 
        }} 
      />

      {/* 6. 설정 탭 */}
      <Tabs.Screen 
        name="settings" 
        options={{ 
          title: "설정", 
          href: isLoggedIn ? "/settings" : null 
        }} 
      />

      {/* 7. 🛡️ 최고관리자 전용 탭 (조건부 숨김 처리 핵심) */}
      <Tabs.Screen 
        name="admin" 
        options={{ 
          title: "관리자", 
          // ✨ 핵심 설정: isAdmin이 true일 때만 하단 탭 바에 나타납니다.
          href: isAdmin ? "/admin" : null,
          // 보안을 위해 관리자가 아니면 헤더 접근 자체를 비활성화할 수도 있습니다.
          headerShown: isAdmin,
        }} 
      />

      {/* 8. 가이드 (탭 바에서 숨김) */}
      <Tabs.Screen name="guide" options={{ href: null }} />
    </Tabs>
  );
}
