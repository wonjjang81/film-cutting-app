import React, { useState, useEffect } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { useAuth } from './contexts/AuthContext';
import LoginScreen from './(auth)/login';
import TabLayout from './(tabs)/_layout';

export default function Index() {
  const { isAdmin, guestSession, accessCodeValidated } = useAuth();
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  const isLoggedIn = isAdmin || guestSession !== null || accessCodeValidated;

  // 클라이언트 사이드 렌더링 대기
  if (!isClient) {
    return (
      <View className="flex-1 justify-center items-center bg-white">
        <ActivityIndicator size="large" color="#2563eb" />
      </View>
    );
  }

  // ✨ 핵심 분기: 주소창은 그대로 유지한 채 화면 내용만 스위칭합니다.
  // 로그인이 안 되어 있으면 주소창 이동 없이 로그인 입력창을 첫 화면으로 띄웁니다.
  return isLoggedIn ? <TabLayout /> : <LoginScreen />;
}
