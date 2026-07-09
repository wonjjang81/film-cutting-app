import { useEffect } from "react";
import { router } from "expo-router";
import { View, ActivityIndicator, Platform } from "react-native";

export default function RootIndex() {
  useEffect(() => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      // GitHub Pages 환경에서는 때때로 Expo Router의 내부 리다이렉트보다
      // 브라우저 레벨의 강제 이동이 더 확실하게 작동합니다.
      const baseUrl = "/film-cutting-app";
      const targetPath = "/login";
      
      // 현재 경로가 이미 타겟 경로라면 중복 이동 방지
      if (window.location.pathname.endsWith(targetPath)) return;

      const timer = setTimeout(() => {
        // 내부 라우터 이동 시도
        router.replace(targetPath as any);
        
        // 1초 뒤에도 이동이 안 되었다면 강제 이동 (안전장치)
        setTimeout(() => {
          if (!window.location.pathname.endsWith(targetPath)) {
            window.location.href = baseUrl + targetPath;
          }
        }, 1000);
      }, 100);
      
      return () => clearTimeout(timer);
    }
  }, []);

  return (
    <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#fff" }}>
      <ActivityIndicator size="large" color="#007AFF" />
    </View>
  );
}
