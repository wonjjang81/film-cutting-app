import { Redirect } from "expo-router";

export default function RootIndex() {
  // 최상위 경로 접속 시 탭 그룹의 홈 화면으로 리다이렉트
  return <Redirect href="/(tabs)" />;
}
