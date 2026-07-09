import { Redirect } from "expo-router";
import { Platform } from "react-native";

export default function RootIndex() {
  // 웹 환경에서는 /login으로의 명시적 리다이렉트가 더 안정적입니다.
  // (tabs)/login이 아닌 /login으로 이동하여 TabLayout의 조건부 렌더링을 트리거합니다.
  return <Redirect href="/login" />;
}
