import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Alert, Share, TextInput } from 'react-native';
import { useRouter } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface GuestCodeInfo {
  code: string;
  createdAt: string;
  expiresIn: string;
}

export default function AdminDashboard() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'users' | 'guest'>('users');
  const [generatedCodes, setGeneratedCodes] = useState<GuestCodeInfo[]>([]);
  const [expiryHours, setExpiryHours] = useState('24');
  const [isSyncing, setIsSyncing] = useState(false);

  // GitHub API 설정
  const GITHUB_OWNER = "wonjjang81";
  const GITHUB_REPO = "film-cutting-app";
  const GITHUB_PATH = "guest_codes.json";
  const GITHUB_TOKEN = process.env.EXPO_PUBLIC_GITHUB_TOKEN || ""; // 보안을 위해 환경변수 사용 권장

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

  const saveCodeToGitHubDB = async (newCode: string, allCodes: GuestCodeInfo[]) => {
    setIsSyncing(true);
    try {
      // 1. 기존 파일의 sha 조회
      const getFileResponse = await fetch(`https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${GITHUB_PATH}?t=${Date.now()}`, {
        headers: { 
          'Authorization': `Bearer ${GITHUB_TOKEN}`,
          'Accept': 'application/vnd.github.v3+json',
          'Cache-Control': 'no-cache',
          'User-Agent': 'Expo-App-Client'
        }
      });
      
      if (!getFileResponse.ok) throw new Error('GitHub 파일 조회 실패');
      
      const fileData = await getFileResponse.json();
      const currentSha = fileData.sha;
      
      // 2. 기존 코드를 읽어와 배열로 해독하고 신규 코드를 추가합니다.
      const decodedContent = decodeURIComponent(atob(fileData.content).split('').map(function(c) {
          return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
      }).join(''));
      
      let currentCodes: string[] = [];
      try {
        currentCodes = JSON.parse(decodedContent);
        if (!Array.isArray(currentCodes)) currentCodes = [];
      } catch (e) {
        currentCodes = [];
      }

      const updatedCodes = Array.from(new Set([newCode, ...currentCodes]));
      const content = JSON.stringify(updatedCodes, null, 2);
      
      // 3. Base64 인코딩 (UTF-8 대응)
      const b64Content = btoa(encodeURIComponent(content).replace(/%([0-9A-F]{2})/g, function(match, p1) {
          return String.fromCharCode(parseInt(p1, 16));
      }));

      // 4. GitHub에 업데이트 요청
      const updateResponse = await fetch(`https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${GITHUB_PATH}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${GITHUB_TOKEN}`,
          'Content-Type': 'application/json',
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'Expo-App-Client'
        },
        body: JSON.stringify({
          message: `chore: 관리자 게스트 코드 발급 (${newCode})`,
          content: b64Content,
          sha: currentSha
        })
      });

      if (updateResponse.ok) {
        Alert.alert('클라우드 동기화 성공', `GitHub DB에 코드가 저장되었습니다.`);
      } else {
        const errorData = await updateResponse.json();
        throw new Error(errorData.message || 'GitHub 업데이트 실패');
      }
    } catch (error: any) {
      console.error(error);
      Alert.alert('동기화 실패', error.message || '네트워크 오류가 발생했습니다.');
    } finally {
      setIsSyncing(false);
    }
  };

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
      // 로컬 저장소 업데이트
      await AsyncStorage.setItem('active_guest_codes_full', JSON.stringify(updatedCodes));
      const codeStrings = updatedCodes.map(item => item.code);
      await AsyncStorage.setItem('active_guest_codes', JSON.stringify(codeStrings));
      
      // GitHub 클라우드 DB 업데이트
      await saveCodeToGitHubDB(randomCode, updatedCodes);
    } catch (e) {
      console.error("코드 저장 실패", e);
    }
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
      <View className="bg-slate-900 pt-14 pb-4 px-6 rounded-b-2xl shadow-md">
        <View className="flex-row justify-between items-center mb-4">
          <View>
            <Text className="text-xl font-bold text-white">최고관리자 모드 🛡️</Text>
            <Text className="text-xs text-slate-400 mt-0.5">GitHub 클라우드 DB 연동 중</Text>
          </View>
          <TouchableOpacity className="bg-slate-700 px-3 py-1.5 rounded-lg" onPress={handleLogout}>
            <Text className="text-white text-xs font-semibold">로그아웃</Text>
          </TouchableOpacity>
        </View>

        <View className="flex-row bg-slate-800 p-1 rounded-xl">
          <TouchableOpacity 
            className={`flex-1 py-2.5 rounded-lg items-center ${activeTab === 'users' ? 'bg-blue-600' : ''}`}
            onPress={() => setActiveTab('users')}
          >
            <Text className={`text-sm font-bold ${activeTab === 'users' ? 'text-white' : 'text-slate-400'}`}>가입 승인</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            className={`flex-1 py-2.5 rounded-lg items-center ${activeTab === 'guest' ? 'bg-blue-600' : ''}`}
            onPress={() => setActiveTab('guest')}
          >
            <Text className={`text-sm font-bold ${activeTab === 'guest' ? 'text-white' : 'text-slate-400'}`}>게스트 코드</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView className="flex-1 px-4 py-4">
        {activeTab === 'guest' && (
          <View>
            <View className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm mb-4">
              <Text className="text-sm font-bold text-gray-800 mb-2">🎁 신규 임시 코드 발급 (GitHub DB 동기화)</Text>
              <View className="flex-row items-center mb-4">
                <Text className="text-xs text-gray-500 mr-2">유효 제한시간:</Text>
                <TextInput
                  className="w-14 h-8 border border-gray-300 rounded text-center bg-gray-50 text-xs font-bold"
                  keyboardType="numeric"
                  value={expiryHours}
                  onChangeText={setExpiryHours}
                  maxLength={3}
                />
                <Text className="text-xs text-gray-500 ml-1.5">시간</Text>
              </View>
              <TouchableOpacity 
                className={`w-full h-11 rounded-lg justify-center items-center ${isSyncing ? 'bg-blue-300' : 'bg-blue-600'}`} 
                onPress={generateRandomGuestCode}
                disabled={isSyncing}
              >
                <Text className="text-white text-sm font-bold">{isSyncing ? '동기화 중...' : '임시 승인코드 즉시 생성'}</Text>
              </TouchableOpacity>
            </View>

            <Text className="text-base font-bold text-gray-800 mb-3 px-1">발급 내역</Text>
            {generatedCodes.map((item, index) => (
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
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}
