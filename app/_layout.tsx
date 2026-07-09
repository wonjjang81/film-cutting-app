import "@/global.css";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack, router } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useState, useEffect, useMemo } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import "react-native-reanimated";
import { Platform } from "react-native";
import "@/lib/_core/nativewind-pressable";
import { ThemeProvider } from "@/lib/theme-provider";
import { SafeAreaProvider, SafeAreaInsetsContext, SafeAreaFrameContext, useSafeAreaInsets, useSafeAreaFrame, initialWindowMetrics } from "react-native-safe-area-context";
import { trpc, createTRPCClient } from "@/lib/trpc";
import { FilmProvider } from "@/lib/filmContext";
import { AuthProvider, useAuth } from "@/app/contexts/AuthContext";

const DEFAULT_WEB_INSETS = { top: 0, right: 0, bottom: 0, left: 0 };
const DEFAULT_WEB_FRAME = { x: 0, y: 0, width: 0, height: 0 };

export const unstable_settings = {
  anchor: "(tabs)",
};

// 인증 상태에 따른 라우팅 결정
function RootLayoutContent() {
  const { accessCodeValidated, guestSession, isGuestExpired } = useAuth();
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    // 게스트 세션 만료 확인
    if (guestSession && isGuestExpired()) {
      // 만료된 세션은 로그인 화면으로
      setIsReady(true);
    } else {
      setIsReady(true);
    }
  }, [guestSession, isGuestExpired]);

  // GitHub Pages SPA 404 리다이렉트 처리 로직
  useEffect(() => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const search = window.location.search;
      if (search && search.startsWith('?/')) {
        const path = search.slice(2).replace(/~and~/g, '&');
        window.history.replaceState(null, '', window.location.pathname.slice(0, -1) + path + window.location.hash);
        
        setTimeout(() => {
          router.replace(path as any);
        }, 100);
      }
    }
  }, []);

  if (!isReady) {
    return null;
  }

  // 인증되지 않은 경우 접속코드 입력 화면 표시
  if (!accessCodeValidated && !guestSession) {
    return (
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(auth)" />
      </Stack>
    );
  }

  // 인증된 경우 앱 화면 표시
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="oauth/callback" />
    </Stack>
  );
}

export default function RootLayout() {
  const [queryClient] = useState(() => new QueryClient());
  const [trpcClient] = useState(() => createTRPCClient());
  
  const insets = useSafeAreaInsets();
  const frame = useSafeAreaFrame();

  // Ensure minimum 8px padding for top and bottom on mobile
  const providerInitialMetrics = useMemo(() => {
    const metrics = initialWindowMetrics ?? { insets: insets, frame: frame };
    return {
      ...metrics,
      insets: {
        ...metrics.insets,
        top: Math.max(metrics.insets.top, 16),
        bottom: Math.max(metrics.insets.bottom, 12),
      },
    };
  }, [insets, frame]);

  const content = (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <AuthProvider>
        <FilmProvider>
          <trpc.Provider client={trpcClient} queryClient={queryClient}>
            <QueryClientProvider client={queryClient}>
              <RootLayoutContent />
              <StatusBar style="auto" />
            </QueryClientProvider>
          </trpc.Provider>
        </FilmProvider>
      </AuthProvider>
    </GestureHandlerRootView>
  );

  const shouldOverrideSafeArea = Platform.OS === "web";

  if (shouldOverrideSafeArea) {
    return (
      <ThemeProvider>
        <SafeAreaProvider initialMetrics={providerInitialMetrics}>
          <SafeAreaFrameContext.Provider value={frame}>
            <SafeAreaInsetsContext.Provider value={insets}>
              {content}
            </SafeAreaInsetsContext.Provider>
          </SafeAreaFrameContext.Provider>
        </SafeAreaProvider>
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider>
      <SafeAreaProvider>
        {content}
      </SafeAreaProvider>
    </ThemeProvider>
  );
}
