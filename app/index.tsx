import React from 'react';
import { Redirect } from 'expo-router';
import { useAuth } from './contexts/AuthContext';

export default function Index() {
  const { isAdmin, guestSession, accessCodeValidated } = useAuth();
  const isAuthenticated = isAdmin || guestSession !== null || accessCodeValidated;

  // 인증 상태에 따라 메인 탭 또는 로그인 화면으로 리다이렉트
  return isAuthenticated ? <Redirect href="/(tabs)" /> : <Redirect href="/login" />;
}
