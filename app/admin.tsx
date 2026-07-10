import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Alert, Share, TextInput, StyleSheet, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import * as Clipboard from 'expo-clipboard'; // 📋 클립보드 복사 패키지 이용

// 임시 게스트 코드 인터페이스 정의
interface GuestCodeInfo {
  code: string;
  createdAt: string;
  expiresIn: string; // 만료 기한
}

export default function AdminDashboard() {
  const router = useRouter();
  const [generatedCodes, setGeneratedCodes] = useState<GuestCodeInfo[]>([]);
  const [expiryHours, setExpiryHours] = useState('24'); // 기본 만료시간: 24시간

  // 🎲 1. 게스트 승인코드 자동 생성 함수
  const generateRandomGuestCode = () => {
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let randomCode = 'GUEST-';
    
    // 6자리의 무작위 문자열 생성 (ex: GUEST-X7R2K9)
    for (let i = 0; i < 6; i++) {
      const randomIndex = Math.floor(Math.random() * characters.length);
      randomCode += characters[randomIndex];
    }

    const now = new Date();
    const formattedDate = `${now.getMonth() + 1}/${now.getDate()} ${now.getHours()}:${now.getMinutes().toString().padStart(2, '0')}`;

    const newCodeInfo: GuestCodeInfo = {
      code: randomCode,
      createdAt: formattedDate,
      expiresIn: `${expiryHours}시간`
    };

    // 최신 생성된 코드가 맨 위로 오도록 배열 추가
    setGeneratedCodes([newCodeInfo, ...generatedCodes]);
    Alert.alert('생성 완료', `새로운 승인코드가 발급되었습니다:\n${randomCode}`);
  };

  // 📋 2. 생성된 승인코드 클립보드 복사 기능
  const copyToClipboard = async (code: string) => {
    await Clipboard.setStringAsync(code);
    Alert.alert('복사 완료', '승인코드가 클립보드에 복사되었습니다. 카카오톡이나 문자로 공유하세요.');
  };

  // 📤 3. 외부 공유 기능 (선택 사항)
  const shareCode = async (code: string) => {
    try {
      await Share.share({
        message: `[필름 재단 계산기] 임시 게스트 접속 승인코드입니다.\n코드: ${code}\n\n앱에 접속하여 게스트 인증 칸에 입력해 주세요.`,
      });
    } catch (error) {
      console.log(error);
    }
  };

  return (
    <View style={styles.container}>
      {/* 상단 헤더 */}
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <Text style={styles.headerTitle}>관리자 대시보드 🛡️</Text>
          <TouchableOpacity 
            style={styles.logoutBtn}
            onPress={() => router.replace('/login')}
          >
            <Text style={styles.logoutBtnText}>로그아웃</Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.headerSub}>임시 게스트 승인코드 발급 및 관리 시스템</Text>
      </View>

      <ScrollView style={styles.content}>
        {/* 코드 생성 컨트롤 패널 */}
        <View style={styles.panel}>
          <Text style={styles.panelTitle}>🎁 게스트 코드 신규 발급</Text>
          
          {/* 유효 기간 설정 UI */}
          <View style={styles.expiryRow}>
            <Text style={styles.expiryLabel}>유효 기간 설정:</Text>
            <TextInput
              style={styles.expiryInput}
              keyboardType="numeric"
              value={expiryHours}
              onChangeText={setExpiryHours}
              maxLength={3}
            />
            <Text style={styles.expiryLabel}>시간 동안만 유효</Text>
          </View>

          {/* 생성 버튼 */}
          <TouchableOpacity 
            style={styles.generateBtn}
            onPress={generateRandomGuestCode}
          >
            <Text style={styles.generateBtnText}>무작위 승인코드 자동 생성</Text>
          </TouchableOpacity>
        </View>

        {/* 발급된 코드 현황 리스트 */}
        <View style={styles.listContainer}>
          <Text style={styles.listTitle}>
            발급된 코드 내역 ({generatedCodes.length}건)
          </Text>

          {generatedCodes.length === 0 ? (
            <View style={styles.emptyBox}>
              <Text style={styles.emptyText}>현재 생성된 임시 승인코드가 없습니다.</Text>
            </View>
          ) : (
            generatedCodes.map((item, index) => (
              <View key={index} style={styles.codeCard}>
                <View style={styles.codeCardTop}>
                  <Text style={styles.codeText}>
                    {item.code}
                  </Text>
                  <View style={styles.activeBadge}>
                    <Text style={styles.activeBadgeText}>활성화됨</Text>
                  </View>
                </View>
                
                <View style={styles.codeCardBottom}>
                  <Text style={styles.codeDate}>생성: {item.createdAt} ({item.expiresIn})</Text>
                  
                  {/* 제어 버튼 묶음 */}
                  <View style={styles.btnGroup}>
                    <TouchableOpacity 
                      style={styles.cardBtn}
                      onPress={() => copyToClipboard(item.code)}
                    >
                      <Text style={styles.cardBtnText}>복사</Text>
                    </TouchableOpacity>
                    <TouchableOpacity 
                      style={[styles.cardBtn, styles.shareBtn]}
                      onPress={() => shareCode(item.code)}
                    >
                      <Text style={styles.shareBtnText}>공유</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            ))
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f3f4f6' },
  header: { backgroundColor: '#2563eb', paddingTop: 60, paddingBottom: 24, paddingHorizontal: 24, borderBottomLeftRadius: 30, borderBottomRightRadius: 30 },
  headerTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  headerTitle: { fontSize: 24, fontWeight: 'bold', color: 'white' },
  logoutBtn: { backgroundColor: '#1e40af', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  logoutBtnText: { color: 'white', fontSize: 12, fontWeight: '600' },
  headerSub: { color: '#dbeafe', fontSize: 14, marginTop: 4 },
  content: { flex: 1, paddingHorizontal: 16, paddingTop: 24 },
  panel: { backgroundColor: 'white', padding: 20, borderRadius: 20, marginBottom: 24, elevation: 2 },
  panelTitle: { fontSize: 16, fontWeight: 'bold', color: '#1f2937', marginBottom: 12 },
  expiryRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  expiryLabel: { fontSize: 14, color: '#4b5563' },
  expiryInput: { width: 64, height: 36, borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, textAlign: 'center', marginHorizontal: 8, fontSize: 14, fontWeight: 'bold', backgroundColor: '#f9fafb' },
  generateBtn: { backgroundColor: '#2563eb', height: 48, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  generateBtnText: { color: 'white', fontSize: 16, fontWeight: 'bold' },
  listContainer: { paddingBottom: 40 },
  listTitle: { fontSize: 16, fontWeight: 'bold', color: '#1f2937', marginBottom: 12, paddingHorizontal: 4 },
  emptyBox: { backgroundColor: 'white', paddingVertical: 48, borderRadius: 20, justifyContent: 'center', alignItems: 'center', borderStyle: 'dashed', borderWidth: 1, borderColor: '#d1d5db' },
  emptyText: { color: '#9ca3af', fontSize: 14 },
  codeCard: { backgroundColor: 'white', padding: 16, borderRadius: 12, marginBottom: 12, borderLeftWidth: 4, borderLeftColor: '#3b82f6', elevation: 1 },
  codeCardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  codeText: { fontSize: 18, fontWeight: 'bold', color: '#1f2937', fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace' },
  activeBadge: { backgroundColor: '#dcfce7', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4 },
  activeBadgeText: { color: '#15803d', fontSize: 10, fontWeight: '600' },
  codeCardBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderTopWidth: 1, borderTopColor: '#f3f4f6', paddingTop: 8 },
  codeDate: { color: '#6b7280', fontSize: 12 },
  btnGroup: { flexDirection: 'row', gap: 8 },
  cardBtn: { backgroundColor: '#f3f4f6', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 },
  cardBtnText: { color: '#374151', fontSize: 12, fontWeight: '600' },
  shareBtn: { backgroundColor: '#1f2937' },
  shareBtnText: { color: 'white', fontSize: 12, fontWeight: '600' }
});
