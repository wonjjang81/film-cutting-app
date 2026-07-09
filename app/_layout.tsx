import "@/global.css";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack, router } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useState, useEffect } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import "react-native-reanimated";
import { Platform } from "react-native";
import "@/lib/_core/nativewind-pressable";
import { ThemeProvider } from "@/lib/theme-provider";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { trpc, createTRPCClient } from "@/lib/trpc";
import { FilmProvider } from "@/lib/filmContext";
import { AuthProvider } from "@/app/contexts/AuthContext";

export default function RootLayout() {
  const [queryClient] = useState(() => new QueryClient());
  const [trpcClient] = useState(() => createTRPCClient());

  // GitHub Pages SPA 404 리다이렉트 처리 로직
  useEffect(() => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const search = window.location.search;
      if (search && search.startsWith('?/')) {
        const path = search.slice(2).replace(/~and~/g, '&');
        // 히스토리 상태를 깨끗하게 정리하고 해당 경로로 이동
        window.history.replaceState(null, '', window.location.pathname.slice(0, -1) + path + window.location.hash);
        
        // Expo Router에게 경로가 변경되었음을 알림
        setTimeout(() => {
          router.replace(path as any);
        }, 100);
      }
    }
  }, []);

  return (
    <ThemeProvider>
      <SafeAreaProvider>
        <GestureHandlerRootView style={{ flex: 1 }}>
          <AuthProvider>
            <FilmProvider>
              <trpc.Provider client={trpcClient} queryClient={queryClient}>
                <QueryClientProvider client={queryClient}>
                  <Stack screenOptions={{ headerShown: false }}>
                    <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
                    <Stack.Screen name="index" options={{ headerShown: false }} />
                  </Stack>
                  <StatusBar style="auto" />
                </QueryClientProvider>
              </trpc.Provider>
            </FilmProvider>
          </AuthProvider>
        </GestureHandlerRootView>
      </SafeAreaProvider>
    </ThemeProvider>
  );
}
