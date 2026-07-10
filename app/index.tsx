import React, { useEffect } from 'react';
import { useRouter } from 'expo-router';
import { View, ActivityIndicator } from 'react-native';

export default function Index() {
  const router = useRouter();

  useEffect(() => {
    // 🚀 앱이 켜지는 순간 히스토리를 청소하며 주소창을 /login 으로 밀어버립니다.
    router.replace('/login');
  }, []);

  // 이동하기 아주 짧은 찰나의 순간에 보여줄 로딩 가림막
  return (
    <View className="flex-1 justify-center items-center bg-white">
      <ActivityIndicator size="large" color="#2563eb" />
    </View>
  );
}
