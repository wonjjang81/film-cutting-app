import { Redirect } from "expo-router";

export default function Index() {
  // 최상위 접속 시 로그인 화면으로 강제 이동시킵니다.
  // GitHub Pages 배포 환경에서는 /login 경로로 직접 접속이 안 될 수 있으므로
  // 루트에서 리다이렉트하는 것이 가장 안전합니다.
  return <Redirect href="/login" />;
}
