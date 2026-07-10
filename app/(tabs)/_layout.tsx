import { Tabs } from "expo-router";
import React, { useState, useEffect } from "react";
import { useAuth } from "@/app/contexts/AuthContext";
import { Home, Calculator, Scissors, Receipt, Settings, ShieldCheck } from 'lucide-react-native';

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
        tabBarInactiveTintColor: '#64748b',
      }}
    >
      {/* 1. 로그인 탭 (숨김) */}
      <Tabs.Screen
        name="login"
        options={{
          title: "로그인",
          href: null,
        }}
      />

      {/* 2. 홈/관리 탭 */}
      <Tabs.Screen
        name="index"
        options={{
          title: "관리",
          tabBarIcon: ({ color, size }) => <Home color={color} size={size} />,
          href: isLoggedIn ? "/(tabs)" : null,
        }}
      />

      {/* 3. 입력 탭 */}
      <Tabs.Screen 
        name="input" 
        options={{ 
          title: "입력", 
          tabBarIcon: ({ color, size }) => <Calculator color={color} size={size} />,
          href: isLoggedIn ? "/(tabs)/input" : null 
        }} 
      />

      {/* 4. 재단 탭 */}
      <Tabs.Screen 
        name="cutting" 
        options={{ 
          title: "재단", 
          tabBarIcon: ({ color, size }) => <Scissors color={color} size={size} />,
          href: isLoggedIn ? "/(tabs)/cutting" : null 
        }} 
      />

      {/* 5. 견적 탭 */}
      <Tabs.Screen 
        name="estimate" 
        options={{ 
          title: "견적", 
          tabBarIcon: ({ color, size }) => <Receipt color={color} size={size} />,
          href: isLoggedIn ? "/(tabs)/estimate" : null 
        }} 
      />

      {/* 6. 설정 탭 */}
      <Tabs.Screen 
        name="settings" 
        options={{ 
          title: "설정", 
          tabBarIcon: ({ color, size }) => <Settings color={color} size={size} />,
          href: isLoggedIn ? "/(tabs)/settings" : null 
        }} 
      />

      {/* 7. 🛡️ 최고관리자 전용 탭 */}
      <Tabs.Screen 
        name="admin" 
        options={{ 
          title: "관리자", 
          tabBarIcon: ({ color, size }) => <ShieldCheck color={color} size={size} />,
          href: isAdmin ? "/(tabs)/admin" : null,
          headerShown: isAdmin,
        }} 
      />

      {/* 8. 가이드 (탭 바에서 숨김) */}
      <Tabs.Screen name="guide" options={{ href: null }} />
    </Tabs>
  );
}
