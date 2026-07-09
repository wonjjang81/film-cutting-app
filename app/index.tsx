import { Redirect } from "expo-router";

export default function Index() {
  // 최상위 경로(/) 접속 시 자동으로 (tabs) 그룹으로 리다이렉트합니다.
  return <Redirect href="/(tabs)" />;
}
