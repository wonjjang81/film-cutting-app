import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Alert, Share, TextInput } from 'react-native';
import { useRouter } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import AsyncStorage from '@react-native-async-storage/async-storage';

// 인터페이스 정의
interface PendingUser {
  id: string;
  email: string;
  name: string;
  requestedAt: string;
}

interface GuestCodeInfo {
  code: string;
  createdAt: string;
  expiresIn: string;
}

export default function AdminDashboard() {
  const router = useRouter();
  
  // 🗂️ 관리자 대시보드 탭 상태 ('users' = 가입승인, 'guest' = 게스트코드)
  const [activeTab, setActiveTab] = useState<'users' | 'guest'>('users');

  // --- [1] 가입 승인 대기 명단 관련 상태 및 로직 ---
  const [pendingUsers, setPendingUsers] = useState<PendingUser[]>([
    { id: '1', email: 'user1@naver.com', name: '홍길동', requestedAt: '07/10 11:30' },
    { id: '2', email: 'worker2@daum.net', name: '김철수', requestedAt: '07/10 13:15' },
    { id: '3', email: 'film_master@gmail.com', name: '이영희', requestedAt: '07/10 14:40' },
  ]);

  const handleApproveUser = (id: string, name: string) => {
    Alert.alert('가입 승인', `${name} 회원의 가입을 승인하시겠습니까?`, [
      { text: '취소', style: 'cancel' },
      { 
        text: '승인', 
        onPress: () => {
          setPendingUsers(pendingUsers.filter(user => user.id !== id));
          Alert.alert('승인 완료', `${name} 회원이 정상 승인되었습니다.`);
        } 
      }
    ]);
  };

  const handleRejectUser = (id: string, name: string) => {
    Alert.alert('가입 거절', `${name} 회원의 가입을 거절하시겠습니까?\n거절 시 해당 유저는 로그인할 수 없습니다.`, [
      { text: '취소', style: 'cancel' },
      { 
        text: '거절', 
        style: 'destructive',
        onPress: () => {
          setPendingUsers(pendingUsers.filter(user => user.id !== id));
          Alert.alert('거절 완료', `${name} 회원의 요청을 거절했습니다.`);
        } 
      }
    ]);
  };


  // --- [2] 게스트 승인코드 관련 상태 및 로직 ---
  const [generatedCodes, setGeneratedCodes] = useState<GuestCodeInfo[]>([]);
  const [expiryHours, setExpiryHours] = useState('24');

  // 컴포넌트 마운트 시 저장된 코드 불러오기
  useEffect(() => {
    const loadSavedCodes = async () => {
      try {
        const savedCodesJson = await AsyncStorage.getItem('active_guest_codes_full');
        if (savedCodesJson) {
          setGeneratedCodes(JSON.parse(savedCodesJson));
        }
      } catch (e) {
        console.error("코드 불러오기 실패", e);
      }
    };
    loadSavedCodes();
  }, []);

  const generateRandomGuestCode = async () => {
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let randomCode = 'GUEST-';
    for (let i = 0; i < 6; i++) {
      randomCode += characters[Math.floor(Math.random() * characters.length)];
    }
    const now = new Date();
    const formattedDate = `${now.getMonth() + 1}/${now.getDate()} ${now.getHours()}:${now.getMinutes().toString().padStart(2, '0')}`;

    const newCodeInfo = {
      code: randomCode,
      createdAt: formattedDate,
      expiresIn: `${expiryHours}시간`
    };

    const updatedCodes = [newCodeInfo, ...generatedCodes];
    setGeneratedCodes(updatedCodes);

    try {
      // 🚀 [핵심 추가] 생성된 코드 목록을 로컬 저장소에 동기화
      const codeStrings = updatedCodes.map(item => item.code);
      await AsyncStorage.setItem('active_guest_codes', JSON.stringify(codeStrings));
      await AsyncStorage.setItem('active_guest_codes_full', JSON.stringify(updatedCodes));
    } catch (e) {
      console.error("코드 동기화 실패", e);
    }

    Alert.alert('생성 완료', `게스트 코드가 발급되었습니다: ${randomCode}`);
  };

  const copyToClipboard = async (code: string) => {
    await Clipboard.setStringAsync(code);
    Alert.alert('복사 완료', '코드가 클립보드에 복사되었습니다.');
  };

  const shareCode = async (code: string) => {
    try {
      await Share.share({ message: `[필름 재단 앱] 게스트 승인코드입니다.\n코드: ${code}` });
    } catch (e) { console.log(e); }
  };

  const handleLogout = async () => {
    await AsyncStorage.removeItem('user_authenticated');
    await AsyncStorage.removeItem('user_role');
    router.replace('/login');
  };

  return (
    <View className="flex-1 bg-gray-50">
      {/* 고정 헤더 */}
      <View className="bg-slate-900 pt-14 pb-4 px-6 rounded-b-2xl shadow-md">
        <View className="flex-row justify-between items-center mb-4">
          <View>
            <Text className="text-xl font-bold text-white">최고관리자 모드 🛡️</Text>
            <Text className="text-xs text-slate-400 mt-0.5">필름 재단 계산기 시스템 제어</Text>
          </View>
          <TouchableOpacity 
            className="bg-slate-700 px-3 py-1.5 rounded-lg"
            onPress={handleLogout}
          >
            <Text className="text-white text-xs font-semibold">로그아웃</Text>
          </TouchableOpacity>
        </View>

        {/* 탭 상단 메뉴 선택 바 */}
        <View className="flex-row bg-slate-800 p-1 rounded-xl">
          <TouchableOpacity 
            className={`flex-1 py-2.5 rounded-lg items-center ${activeTab === 'users' ? 'bg-blue-600' : ''}`}
            onPress={() => setActiveTab('users')}
          >
            <Text className={`text-sm font-bold ${activeTab === 'users' ? 'text-white' : 'text-slate-400'}`}>
              가입 승인 관리 ({pendingUsers.length})
            </Text>
          </TouchableOpacity>
          <TouchableOpacity 
            className={`flex-1 py-2.5 rounded-lg items-center ${activeTab === 'guest' ? 'bg-blue-600' : ''}`}
            onPress={() => setActiveTab('guest')}
          >
            <Text className={`text-sm font-bold ${activeTab === 'guest' ? 'text-white' : 'text-slate-400'}`}>
              게스트 코드 발급
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* 가변 본문 영역 */}
      <ScrollView className="flex-1 px-4 py-4">
        
        {/* TAB 1: 회원가입 승인 대기 명단 목록 */}
        {activeTab === 'users' && (
          <View>
            <Text className="text-base font-bold text-gray-800 mb-3 px-1">승인 대기 중인 회원 명단</Text>
            
            {pendingUsers.length === 0 ? (
              <View className="bg-white py-16 rounded-xl justify-center items-center border border-gray-200 shadow-sm">
                <Text className="text-gray-400 text-sm">현재 가입을 신청한 회원이 없습니다.</Text>
              </View>
            ) : (
              pendingUsers.map((user) => (
                <View key={user.id} className="bg-white p-4 rounded-xl shadow-sm mb-3 border border-gray-200">
                  <View className="flex-row justify-between items-start mb-3">
                    <View>
                      <Text className="text-base font-bold text-gray-800">{user.name}</Text>
                      <Text className="text-sm text-gray-500 mt-0.5">{user.email}</Text>
                    </View>
                    <Text className="text-xs text-gray-400">{user.requestedAt} 신청</Text>
                  </View>
                  
                  {/* 처리 버튼 박스 */}
                  <View className="flex-row gap-2 border-t border-gray-100 pt-3">
                    <TouchableOpacity 
                      className="flex-1 h-10 bg-rose-50 border border-rose-200 rounded-lg justify-center items-center"
                      onPress={() => handleRejectUser(user.id, user.name)}
                    >
                      <Text className="text-rose-600 text-sm font-semibold">가입 거절</Text>
                    </TouchableOpacity>
                    <TouchableOpacity 
                      className="flex-1 h-10 bg-blue-600 rounded-lg justify-center items-center"
                      onPress={() => handleApproveUser(user.id, user.name)}
                    >
                      <Text className="text-white text-sm font-bold">최종 승인</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))
            )}
          </View>
        )}

        {/* TAB 2: 임시 게스트 코드 관리 */}
        {activeTab === 'guest' && (
          <View>
            <View className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm mb-4">
              <Text className="text-sm font-bold text-gray-800 mb-2">🎁 신규 임시 코드 자동 발급</Text>
              <View className="flex-row items-center mb-4">
                <Text className="text-xs text-gray-500 mr-2">유효 제한시간:</Text>
                <TextInput
                  className="w-14 h-8 border border-gray-300 rounded text-center bg-gray-50 text-xs font-bold"
                  keyboardType="numeric"
                  value={expiryHours}
                  onChangeText={setExpiryHours}
                  maxLength={3}
                />
                <Text className="text-xs text-gray-500 ml-1.5">시간 설정</Text>
              </View>
              <TouchableOpacity className="w-full h-11 bg-blue-600 rounded-lg justify-center items-center" onPress={generateRandomGuestCode}>
                <Text className="text-white text-sm font-bold">임시 승인코드 즉시 생성</Text>
              </TouchableOpacity>
            </View>

            <Text className="text-base font-bold text-gray-800 mb-3 px-1">발급 완료 내역</Text>
            {generatedCodes.length === 0 ? (
              <View className="bg-white py-12 rounded-xl justify-center items-center border border-dashed border-gray-300">
                <Text className="text-gray-400 text-xs">생성된 내역이 없습니다.</Text>
              </View>
            ) : (
              generatedCodes.map((item, index) => (
                <View key={index} className="bg-white p-3 rounded-xl shadow-sm mb-2 border border-gray-200">
                  <View className="flex-row justify-between items-center mb-1">
                    <Text className="text-base font-mono font-bold text-slate-800">{item.code}</Text>
                    <View className="flex-row gap-1.5">
                      <TouchableOpacity className="bg-gray-100 px-2 py-1 rounded" onPress={() => copyToClipboard(item.code)}>
                        <Text className="text-gray-700 text-xs">복사</Text>
                      </TouchableOpacity>
                      <TouchableOpacity className="bg-slate-800 px-2 py-1 rounded" onPress={() => shareCode(item.code)}>
                        <Text className="text-white text-xs">공유</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                  <Text className="text-[11px] text-gray-400">발급일: {item.createdAt} / 유효: {item.expiresIn}</Text>
                </View>
              ))
            )}
          </View>
        )}

      </ScrollView>
    </View>
  );
}
