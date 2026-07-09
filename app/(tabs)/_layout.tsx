import { Tabs, usePathname, router } from "expo-router";
import React, { useState, useEffect } from "react";
import { View, ActivityIndicator, Platform } from "react-native";
import { useAuth } from "@/app/contexts/AuthContext";

export default function TabLayout() {
  const { isAdmin, guestSession, accessCodeValidated } = useAuth();
  const [isReady, setIsReady] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    setIsReady(true);
  }, []);

  if (!isReady) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#fff' }}>
        <ActivityIndicator size="large" color="#007AFF" />
      </View>
    );
  }

  const isLoggedIn = accessCodeValidated || guestSession !== null;
  const isLoginPage = pathname === "/login";
  const shouldHideTabBar = !isLoggedIn || isLoginPage;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: shouldHideTabBar ? { display: 'none' } : { height: 60, paddingBottom: 8 },
      }}
    >
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
      <Tabs.Screen name="login" options={{ href: null }} />
      <Tabs.Screen name="accesscode" options={{ href: null }} />
    </Tabs>
  );
}
