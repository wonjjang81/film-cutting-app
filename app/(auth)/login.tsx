import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, Alert, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';

// 🔒 임시 게스트 승인코드 설정
const TEMPORARY_GUEST_CODE = "GUEST1220"; 

export default function LoginScreen() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [guestCode, setGuestCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // 1. 일반 회원 로그인 로직
  const handleLogin = async () => {
    if (!email || !password) {
      Alert.alert('오류', '이메일과 비밀번호를 모두 입력해주세요.');
      return;
    }

    setIsLoading(true);
    try {
      // ⚠️ 실제 백엔드 연동 시 아래 주석을 해제하고 서버 엔드포인트를 입력하세요.
      /*
      const response = await fetch('https://your-server-api.com', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const result = await response.json();

      if (!response.ok) {
        if (result.code === 'APPROVAL_PENDING') {
          Alert.alert('승인 대기', '관리자의 가입 승인을 대기 중입니다.');
          return;
        }
        throw new Error(result.message || '로그인에 실패했습니다.');
      }
      */

      // 임시 성공 처리
      Alert.alert('성공', '회원 로그인에 성공했습니다.');
      router.replace('/(tabs)'); 
    } catch (error: any) {
      Alert.alert('실패', error.message || '로그인 중 오류가 발생했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  // 2. 임시 게스트 사용승인코드 검증 로직
  const handleGuestLogin = () => {
    if (!guestCode) {
      Alert.alert('오류', '게스트 사용승인코드를 입력해주세요.');
      return;
    }

    if (guestCode.trim().toUpperCase() === TEMPORARY_GUEST_CODE) {
      Alert.alert('인증 성공', '게스트 모드로 임시 진입합니다.');
      router.replace('/(tabs)'); 
    } else {
      Alert.alert('인증 실패', '올바르지 않은 승인코드입니다.');
    }
  };

  return (
    <KeyboardAvoidingView 
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'} 
      className="flex-1 bg-white"
    >
      <ScrollView contentContainerStyle={{ flexGrow: 1 }} className="justify-center px-6 py-10">
        
        {/* 상단 타이틀 */}
        <View className="mb-8">
          <Text className="text-3xl font-bold text-gray-800">필름 재단 계산기</Text>
          <Text className="text-gray-500 mt-2">서비스 이용을 위해 인증해주세요.</Text>
        </View>

        {/* --- [섹션 1] 회원 로그인 폼 --- */}
        <View className="mb-4">
          <Text className="text-sm font-semibold text-gray-700 mb-2">이메일</Text>
          <TextInput
            className="w-full h-12 border border-gray-300 rounded-lg px-4 bg-gray-50 text-base"
            placeholder="example@email.com"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
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
            autoCapitalize="none"
          />
        </View>

        <TouchableOpacity 
          className={`w-full h-12 rounded-lg justify-center items-center mb-6 ${isLoading ? 'bg-blue-300' : 'bg-blue-600'}`}
          onPress={handleLogin}
          disabled={isLoading}
        >
          <Text className="text-white text-base font-bold">
            {isLoading ? '로그인 중...' : '회원 로그인'}
          </Text>
        </TouchableOpacity>

        {/* 중앙 구분선 */}
        <View className="flex-row items-center mb-6">
          <View className="flex-1 h-px bg-gray-300" />
          <Text className="px-3 text-sm text-gray-400">또는</Text>
          <View className="flex-1 h-px bg-gray-300" />
        </View>

        {/* --- [섹션 2] 임시 게스트 승인코드 입력 폼 --- */}
        <View className="p-4 border border-dashed border-gray-300 rounded-xl bg-gray-50">
          <Text className="text-sm font-semibold text-blue-700 mb-1">임시 게스트 접속</Text>
          <Text className="text-xs text-gray-400 mb-3">관리자에게 발급받은 승인코드를 입력하세요.</Text>
          
          <TextInput
            className="w-full h-11 border border-gray-300 rounded-lg px-4 bg-white text-base font-mono mb-3"
            placeholder="승인코드 입력 (ex: GUEST1220)"
            value={guestCode}
            onChangeText={setGuestCode}
            autoCapitalize="characters"
          />
          
          <TouchableOpacity 
            className="w-full h-11 bg-gray-800 rounded-lg justify-center items-center" 
            onPress={handleGuestLogin}
          >
            <Text className="text-white text-sm font-bold">게스트 코드로 시작하기</Text>
          </TouchableOpacity>
        </View>

      </ScrollView>
    </KeyboardAvoidingView>
  );
}
