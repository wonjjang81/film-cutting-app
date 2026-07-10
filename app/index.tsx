import React, { useEffect, useState } from 'react';
import { Redirect } from 'expo-router';
import { View, ActivityIndicator } from 'react-native';
import { useAuth } from './contexts/AuthContext';

export default function Index() {
  const { isAdmin, guestSession, accessCodeValidated } = useAuth();
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);

  useEffect(() => {
    // AuthContext의 상태를 기반으로 인증 여부 판단
    const loggedIn = isAdmin || guestSession !== null || accessCodeValidated;
    setIsAuthenticated(loggedIn);
  }, [isAdmin, guestSession, accessCodeValidated]);

  // 로딩 상태 처리
  if (isAuthenticated === null) {
    return (
      <View className="flex-1 justify-center items-center bg-white">
        <ActivityIndicator size="large" color="#2563eb" />
      </View>
    );
  }

  // ✨ 로그인 기록이 있으면 메인 탭으로 프리패스, 없으면 로그인창 강제 진입
  return isAuthenticated ? <Redirect href="/(tabs)" /> : <Redirect href="/login" />;
}
