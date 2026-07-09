import { Redirect } from "expo-router";

/**
 * 앱의 최상위 진입점입니다.
 * 사용자가 접속하자마자 로그인 화면으로 바로 연결되도록 설정합니다.
 * 이 방식은 리다이렉트 지연 없이 가장 빠르게 로그인 창을 보여줍니다.
 */
export default function Index() {
  return <Redirect href="/login" />;
}
