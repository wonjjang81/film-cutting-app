import { Tabs, usePathname, router } from "expo-router";
import React, { useState, useEffect } from "react";
import { View, ActivityIndicator, Platform } from "react-native";

export default function TabLayout() {
  const [isAdmin, setIsAdmin] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    const checkAuth = () => {
      if (typeof localStorage !== 'undefined') {
        const adminStatus = localStorage.getItem("isAdmin") === "true";
        const guestSession = localStorage.getItem("guestSession");
        const accessCodeValidated = localStorage.getItem("accessCodeValidated") === "true";
        const loggedInStatus = adminStatus || guestSession !== null || accessCodeValidated;
        
        setIsAdmin(adminStatus);
        setIsLoggedIn(loggedInStatus);

        // 웹 환경에서 로그인이 안 되어 있는데 다른 페이지에 있다면 로그인 페이지로 강제 이동
        if (!loggedInStatus && pathname !== "/login" && Platform.OS === 'web') {
          router.replace("/login");
        }
      }
      setIsReady(true);
    };
    
    checkAuth();
    const interval = setInterval(checkAuth, 1000);
    return () => clearInterval(interval);
  }, [pathname]);

  if (!isReady) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#fff' }}>
        <ActivityIndicator size="large" color="#007AFF" />
      </View>
    );
  }

  const shouldHideTabBar = !isLoggedIn || pathname === "/login";

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          display: shouldHideTabBar ? 'none' : 'flex',
          position: shouldHideTabBar ? 'absolute' : 'relative',
          height: shouldHideTabBar ? 0 : 60,
          opacity: shouldHideTabBar ? 0 : 1,
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
      <Tabs.Screen name="input" options={{ title: "입력", href: isLoggedIn ? "/input" : null }} />
      <Tabs.Screen name="cutting" options={{ title: "재단", href: isLoggedIn ? "/cutting" : null }} />
      <Tabs.Screen name="estimate" options={{ title: "견적", href: isLoggedIn ? "/estimate" : null }} />
      <Tabs.Screen name="settings" options={{ title: "설정", href: isLoggedIn ? "/settings" : null }} />
      <Tabs.Screen name="admin" options={{ title: "관리자", href: isAdmin ? "/admin" : null }} />
      <Tabs.Screen name="guide" options={{ href: null }} />
    </Tabs>
  );
}
