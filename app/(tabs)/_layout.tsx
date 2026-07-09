import { Tabs } from "expo-router";
import { View, Text, ActivityIndicator } from "react-native";
import React, { useState, useEffect } from "react";

export default function TabLayout() {
  const [isReady, setIsReady] = useState(false);
  
  useEffect(() => {
    // 0.1초 후 즉시 렌더링
    const timer = setTimeout(() => setIsReady(true), 100);
    return () => clearTimeout(timer);
  }, []);

  if (!isReady) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' }}>
        <ActivityIndicator size="large" color="#007AFF" />
      </View>
    );
  }

  // 무조건 로그인 화면을 기본으로 노출 (인증 체크는 각 화면 내부에서 처리)
  return (
    <Tabs screenOptions={{ headerShown: false, tabBarStyle: { display: 'none' } }}>
      <Tabs.Screen name="login" options={{ title: "로그인" }} />
      <Tabs.Screen name="index" options={{ href: null }} />
      <Tabs.Screen name="input" options={{ href: null }} />
      <Tabs.Screen name="cutting" options={{ href: null }} />
      <Tabs.Screen name="estimate" options={{ href: null }} />
      <Tabs.Screen name="settings" options={{ href: null }} />
      <Tabs.Screen name="admin" options={{ href: null }} />
      <Tabs.Screen name="guide" options={{ href: null }} />
    </Tabs>
  );
}
