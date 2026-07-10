import React, { useEffect, useState } from 'react';
import { Redirect } from 'expo-router';
import { View, ActivityIndicator } from 'react-native';
// 만약 토큰 저장용으로 AsyncStorage를 쓰신다면 아래 주석을 활용하세요.
// import AsyncStorage from '@react-native-async-storage/async-storage';

export default function Index() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);

  useEffect(() => {
    const checkLoginStatus = async () => {
      try {
        // 임시 저장된 인증 값이나 토큰이 있는지 검사
        // const token = await AsyncStorage.getItem('userToken');
        // const isGuest = await AsyncStorage.getItem('guestMode');
        
        const hasToken = false; // 테스트용 기본값 (로그인 안 됨)
        
        setIsAuthenticated(hasToken);
      } catch (error) {
        setIsAuthenticated(false);
      }
    };

    checkLoginStatus();
  }, []);

  // 로딩 중일 때는 빈 화면과 인디케이터 표시
  if (isAuthenticated === null) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'white' }}>
        <ActivityIndicator size="large" color="#2563eb" />
      </View>
    );
  }

  // 인증 성공 시 메인 탭으로, 실패 시 로그인 화면으로 이동
  return isAuthenticated ? <Redirect href="/(tabs)" /> : <Redirect href="/login" />;
}
