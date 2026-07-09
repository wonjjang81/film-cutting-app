import { Tabs, router } from "expo-router";
import React, { useState, useEffect } from "react";

export default function TabLayout() {
  const [isAdmin, setIsAdmin] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    if (typeof localStorage !== 'undefined') {
      const adminStatus = localStorage.getItem("isAdmin") === "true";
      const loggedInStatus = adminStatus || 
                             localStorage.getItem("guestSession") !== null || 
                             localStorage.getItem("accessCodeValidated") === "true";
      setIsAdmin(adminStatus);
      setIsLoggedIn(loggedInStatus);
    }
    setIsReady(true);
  }, []);

  if (!isReady) return null;

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
          // 비로그인 시 탭 접근 차단 (href: null)
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
