import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, Alert, KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../contexts/AuthContext';
import AsyncStorage from '@react-native-async-storage/async-storage';

export default function LoginScreen() {
  const router = useRouter();
  const { loginAsAdmin } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [guestCode, setGuestCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // GitHub Pages 정적 JSON 주소
  const GITHUB_DB_URL = "https://wonjjang81.github.io/film-cutting-app/guest_codes.json";

  const handleLogin = async () => {
    if (!email || !password) {
      Alert.alert('오류', '이메일과 비밀번호를 모두 입력해주세요.');
      return;
    }

    if (email.trim() === 'wizhou' && password === '203302') {
      const success = loginAsAdmin('won81'); 
      if (success) {
        await AsyncStorage.setItem('user_authenticated', 'true');
        await AsyncStorage.setItem('user_role', 'ADMIN');
        router.replace('/(tabs)/input');
        return;
      }
    }

    setIsLoading(true);
    try {
      await AsyncStorage.setItem('user_authenticated', 'true');
      await AsyncStorage.setItem('user_role', 'USER');
      router.replace('/(tabs)/input'); 
    } catch (error: any) {
      Alert.alert('실패', '로그인 중 오류가 발생했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleGuestLogin = async () => {
    if (!guestCode) {
      Alert.alert('오류', '게스트 사용승인코드를 입력해주세요.');
      return;
    }

    setIsLoading(true);
    const inputCode = guestCode.trim().toUpperCase();

    try {
      // 🚀 [GitHub DB 조회]: 정적 JSON 파일을 가져와서 실시간 검증
      const response = await fetch(`${GITHUB_DB_URL}?t=${Date.now()}`);
      
      if (!response.ok) throw new Error('데이터베이스 연결 실패');
      
      const activeCodes: string[] = await response.json();

      if (activeCodes.includes(inputCode) || inputCode === "GUEST1220") {
        await AsyncStorage.setItem('user_authenticated', 'true');
        await AsyncStorage.setItem('user_role', 'GUEST');
        Alert.alert('인증 성공', '게스트 모드로 진입합니다.');
        router.replace('/(tabs)/input');
      } else {
        Alert.alert('인증 실패', '올바르지 않거나 만료된 승인코드입니다.');
      }
    } catch (error) {
      // 오프라인/에러 대비 마스터 코드 예외 처리
      if (inputCode === "GUEST1220") {
        await AsyncStorage.setItem('user_authenticated', 'true');
        await AsyncStorage.setItem('user_role', 'GUEST');
        router.replace('/(tabs)/input');
      } else {
        Alert.alert('네트워크 오류', '임시 DB에서 코드를 가져오지 못했습니다. 잠시 후 다시 시도해 주세요.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} className="flex-1 bg-white">
      <ScrollView contentContainerStyle={{ flexGrow: 1 }} className="justify-center px-6 py-10">
        <View className="mb-8">
          <Text className="text-3xl font-bold text-gray-800">필름 재단 계산기</Text>
          <Text className="text-gray-500 mt-2">서비스 이용을 위해 인증해주세요.</Text>
        </View>

        <View className="mb-4">
          <Text className="text-sm font-semibold text-gray-700 mb-2">이메일</Text>
          <TextInput
            className="w-full h-12 border border-gray-300 rounded-lg px-4 bg-gray-50 text-base"
            placeholder="example@email.com"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
          />
        </View>

        <View className="mb-4">
          <Text className="text-sm font-semibold text-gray-700 mb-2">비밀번호</Text>
          <TextInput
            className="w-full h-12 border border-gray-300 rounded-lg px-4 bg-gray-50 text-base"
            placeholder="비밀번호를 입력하세요"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
          />
        </View>

        <TouchableOpacity 
          className={`w-full h-12 rounded-lg justify-center items-center mb-6 ${isLoading ? 'bg-blue-300' : 'bg-blue-600'}`}
          onPress={handleLogin}
          disabled={isLoading}
        >
          {isLoading ? <ActivityIndicator color="#fff" /> : <Text className="text-white text-base font-bold">회원 로그인</Text>}
        </TouchableOpacity>

        <View className="flex-row items-center mb-6">
          <View className="flex-1 h-px bg-gray-300" />
          <Text className="px-3 text-sm text-gray-400">또는</Text>
          <View className="flex-1 h-px bg-gray-300" />
        </View>

        <View className="p-4 border border-dashed border-gray-300 rounded-xl bg-gray-50">
          <Text className="text-sm font-semibold text-blue-700 mb-1">임시 게스트 접속 (GitHub Cloud DB)</Text>
          <TextInput
            className="w-full h-11 border border-gray-300 rounded-lg px-4 bg-white text-base font-mono mb-3"
            placeholder="승인코드 입력"
            value={guestCode}
            onChangeText={setGuestCode}
            autoCapitalize="characters"
          />
          <TouchableOpacity 
            className="w-full h-11 bg-gray-800 rounded-lg justify-center items-center" 
            onPress={handleGuestLogin}
            disabled={isLoading}
          >
            <Text className="text-white text-sm font-bold">게스트 코드로 시작하기</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
