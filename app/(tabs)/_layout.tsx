import { Tabs } from "expo-router";
import { View, Text, ActivityIndicator } from "react-native";
import { useAuth as useGuestAuth } from "@/app/contexts/AuthContext";
import React, { useState, useEffect } from "react";

export default function TabLayout() {
  const { guestSession, isAdmin } = useGuestAuth();
  const [ready, setReady] = useState(false);
  
  useEffect(() => {
    const timer = setTimeout(() => setReady(true), 1000);
    return () => clearTimeout(timer);
  }, []);

  if (!ready) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" />
        <Text style={{ marginTop: 10 }}>로딩 중...</Text>
      </View>
    );
  }

  const isLoggedIn = !!guestSession || isAdmin;

  return (
    <Tabs screenOptions={{ headerShown: false }}>
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
      <Tabs.Screen name="input" options={{ title: "입력", href: isLoggedIn ? "/input" : null }} />
      <Tabs.Screen name="cutting" options={{ title: "재단", href: isLoggedIn ? "/cutting" : null }} />
      <Tabs.Screen name="estimate" options={{ title: "견적", href: isLoggedIn ? "/estimate" : null }} />
      <Tabs.Screen name="settings" options={{ title: "설정", href: isLoggedIn ? "/settings" : null }} />
      <Tabs.Screen name="admin" options={{ title: "관리자", href: isAdmin ? "/admin" : null }} />
      <Tabs.Screen name="guide" options={{ href: null }} />
    </Tabs>
  );
}
