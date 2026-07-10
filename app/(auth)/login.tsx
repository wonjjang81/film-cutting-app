import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, Alert, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
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

  // 1. 일반 회원 및 관리자 로그인 로직
  const handleLogin = async () => {
    if (!email || !password) {
      Alert.alert('오류', '이메일과 비밀번호를 모두 입력해주세요.');
      return;
    }

    // 🛡️ [관리자 로그인 프리패스 체크]
    if (email.trim() === 'wizhou' && password === '203302') {
      const success = loginAsAdmin('won81'); 
      if (success) {
        await AsyncStorage.setItem('user_authenticated', 'true');
        await AsyncStorage.setItem('user_role', 'ADMIN');
        Alert.alert('관리자 인증 성공', '관리자 모드로 접속합니다.');
        router.replace('/(tabs)/input');
        return;
      }
    }

    setIsLoading(true);
    try {
      // 일반 회원 로그인 로직 (임시 성공 처리)
      await AsyncStorage.setItem('user_authenticated', 'true');
      await AsyncStorage.setItem('user_role', 'USER');
      Alert.alert('성공', '회원 로그인에 성공했습니다.');
      router.replace('/(tabs)/input'); 
    } catch (error: any) {
      Alert.alert('실패', error.message || '로그인 중 오류가 발생했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  // 2. 임시 게스트 사용승인코드 검증 로직 (실시간 동기화)
  const handleGuestLogin = async () => {
    if (!guestCode) {
      Alert.alert('오류', '게스트 사용승인코드를 입력해주세요.');
      return;
    }

    const inputCode = guestCode.trim().toUpperCase();

    // 🔒 비상용 마스터 고정 코드
    const MASTER_GUEST_CODE = "GUEST1220";

    if (inputCode === MASTER_GUEST_CODE) {
      await AsyncStorage.setItem('user_authenticated', 'true');
      await AsyncStorage.setItem('user_role', 'GUEST');
      Alert.alert('인증 성공', '마스터 게스트 모드로 임시 진입합니다.');
      router.replace('/(tabs)/input');
      return;
    }

    try {
      // 🚀 [핵심 추가] 관리자가 대시보드에서 자동 생성해 둔 코드 리스트를 불러옵니다.
      const savedCodesJson = await AsyncStorage.getItem('active_guest_codes');
      const activeCodes: string[] = savedCodesJson ? JSON.parse(savedCodesJson) : [];

      // 🎯 입력한 코드가 발급된 리스트에 존재하는지 검사
      if (activeCodes.includes(inputCode)) {
        await AsyncStorage.setItem('user_authenticated', 'true');
        await AsyncStorage.setItem('user_role', 'GUEST');
        Alert.alert('인증 성공', '발급된 게스트 코드로 접속되었습니다.');
        router.replace('/(tabs)/input');
      } else {
        Alert.alert('인증 실패', '올바르지 않거나 만료된 승인코드입니다.');
      }
    } catch (e) {
      Alert.alert('오류', '인증 처리 중 문제가 발생했습니다.');
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
