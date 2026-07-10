import React from 'react';
import { Redirect } from 'expo-router';

/**
 * 앱의 최상위 진입점입니다.
 * 첫 실행 시 즉시 로그인 페이지(/login)로 사용자를 보냅니다.
 */
export default function Index() {
  return <Redirect href="/login" />;
}
