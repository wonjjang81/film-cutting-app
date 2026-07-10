import { Redirect } from "expo-router";

export default function RootIndex() {
  // 최상위 경로 접속 시 입력 탭으로 리다이렉트
  return <Redirect href="/(tabs)/input" />;
}
