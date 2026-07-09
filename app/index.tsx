import { useEffect } from "react";
import { router } from "expo-router";
import { View, ActivityIndicator } from "react-native";

export default function RootIndex() {
  useEffect(() => {
    // Redirect 컴포넌트 대신 useEffect 내에서 router.replace를 사용하여
    // GitHub Pages 서브디렉토리 환경에서 더 안정적으로 이동하도록 합니다.
    const timer = setTimeout(() => {
      router.replace("/login");
    }, 100);
    return () => clearTimeout(timer);
  }, []);

  return (
    <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#fff" }}>
      <ActivityIndicator size="large" color="#007AFF" />
    </View>
  );
}
