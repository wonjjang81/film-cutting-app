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

  // 상태를 읽어오는 중일 때의 로딩 화면
  if (isAuthenticated === null) {
    return (
      <View className="flex-1 justify-center items-center bg-white">
        <ActivityIndicator size="large" color="#2563eb" />
      </View>
    );
  }

  // ✨ [핵심 수정]: 주소창을 물리적으로 변경하여 강제 이동시킵니다.
  // 로그인 기록이 있다면 메인 탭으로, 없다면 주소창이 끝에 /login으로 완전히 바뀝니다.
  return isAuthenticated ? <Redirect href="/(tabs)" /> : <Redirect href="/login" />;
}
