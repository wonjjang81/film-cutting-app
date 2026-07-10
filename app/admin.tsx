import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Alert, Share, TextInput, StyleSheet, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import * as Clipboard from 'expo-clipboard';

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
  const [activeTab, setActiveTab] = useState<'users' | 'guest'>('users');

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

  const [generatedCodes, setGeneratedCodes] = useState<GuestCodeInfo[]>([]);
  const [expiryHours, setExpiryHours] = useState('24');

  const generateRandomGuestCode = () => {
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let randomCode = 'GUEST-';
    for (let i = 0; i < 6; i++) {
      randomCode += characters[Math.floor(Math.random() * characters.length)];
    }
    const now = new Date();
    const formattedDate = `${now.getMonth() + 1}/${now.getDate()} ${now.getHours()}:${now.getMinutes().toString().padStart(2, '0')}`;

    setGeneratedCodes([{
      code: randomCode,
      createdAt: formattedDate,
      expiresIn: `${expiryHours}시간`
    }, ...generatedCodes]);
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

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <View>
            <Text style={styles.headerTitle}>최고관리자 모드 🛡️</Text>
            <Text style={styles.headerSub}>필름 재단 계산기 시스템 제어</Text>
          </View>
          <TouchableOpacity 
            style={styles.logoutBtn}
            onPress={() => router.replace('/login')}
          >
            <Text style={styles.logoutBtnText}>로그아웃</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.tabBar}>
          <TouchableOpacity 
            style={[styles.tabItem, activeTab === 'users' && styles.tabItemActive]}
            onPress={() => setActiveTab('users')}
          >
            <Text style={[styles.tabText, activeTab === 'users' && styles.tabTextActive]}>
              가입 승인 관리 ({pendingUsers.length})
            </Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.tabItem, activeTab === 'guest' && styles.tabItemActive]}
            onPress={() => setActiveTab('guest')}
          >
            <Text style={[styles.tabText, activeTab === 'guest' && styles.tabTextActive]}>
              게스트 코드 발급
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView style={styles.content}>
        {activeTab === 'users' && (
          <View>
            <Text style={styles.sectionTitle}>승인 대기 중인 회원 명단</Text>
            {pendingUsers.length === 0 ? (
              <View style={styles.emptyBox}>
                <Text style={styles.emptyText}>현재 가입을 신청한 회원이 없습니다.</Text>
              </View>
            ) : (
              pendingUsers.map((user) => (
                <View key={user.id} style={styles.userCard}>
                  <View style={styles.userCardTop}>
                    <View>
                      <Text style={styles.userName}>{user.name}</Text>
                      <Text style={styles.userEmail}>{user.email}</Text>
                    </View>
                    <Text style={styles.requestDate}>{user.requestedAt} 신청</Text>
                  </View>
                  <View style={styles.actionGroup}>
                    <TouchableOpacity 
                      style={styles.rejectBtn}
                      onPress={() => handleRejectUser(user.id, user.name)}
                    >
                      <Text style={styles.rejectBtnText}>가입 거절</Text>
                    </TouchableOpacity>
                    <TouchableOpacity 
                      style={styles.approveBtn}
                      onPress={() => handleApproveUser(user.id, user.name)}
                    >
                      <Text style={styles.approveBtnText}>최종 승인</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))
            )}
          </View>
        )}

        {activeTab === 'guest' && (
          <View>
            <View style={styles.panel}>
              <Text style={styles.panelTitle}>🎁 신규 임시 코드 자동 발급</Text>
              <View style={styles.expiryRow}>
                <Text style={styles.expiryLabel}>유효 제한시간:</Text>
                <TextInput
                  style={styles.expiryInput}
                  keyboardType="numeric"
                  value={expiryHours}
                  onChangeText={setExpiryHours}
                  maxLength={3}
                />
                <Text style={styles.expiryLabel}>시간 설정</Text>
              </View>
              <TouchableOpacity style={styles.generateBtn} onPress={generateRandomGuestCode}>
                <Text style={styles.generateBtnText}>임시 승인코드 즉시 생성</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.sectionTitle}>발급 완료 내역</Text>
            {generatedCodes.length === 0 ? (
              <View style={styles.emptyBoxDashed}>
                <Text style={styles.emptyTextSmall}>생성된 내역이 없습니다.</Text>
              </View>
            ) : (
              generatedCodes.map((item, index) => (
                <View key={index} style={styles.codeCard}>
                  <View style={styles.codeCardTop}>
                    <Text style={styles.codeText}>{item.code}</Text>
                    <View style={styles.codeActionGroup}>
                      <TouchableOpacity style={styles.codeBtn} onPress={() => copyToClipboard(item.code)}>
                        <Text style={styles.codeBtnText}>복사</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={[styles.codeBtn, styles.shareBtn]} onPress={() => shareCode(item.code)}>
                        <Text style={styles.shareBtnText}>공유</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                  <Text style={styles.codeInfo}>발급일: {item.createdAt} / 유효: {item.expiresIn}</Text>
                </View>
              ))
            )}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  header: { backgroundColor: '#0f172a', paddingTop: 60, paddingBottom: 16, paddingHorizontal: 24, borderBottomLeftRadius: 20, borderBottomRightRadius: 20 },
  headerTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  headerTitle: { fontSize: 20, fontWeight: 'bold', color: 'white' },
  headerSub: { fontSize: 12, color: '#94a3b8', marginTop: 2 },
  logoutBtn: { backgroundColor: '#334155', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  logoutBtnText: { color: 'white', fontSize: 12, fontWeight: '600' },
  tabBar: { flexDirection: 'row', backgroundColor: '#1e293b', padding: 4, borderRadius: 12 },
  tabItem: { flex: 1, py: 10, paddingVertical: 10, borderRadius: 8, alignItems: 'center' },
  tabItemActive: { backgroundColor: '#2563eb' },
  tabText: { fontSize: 14, fontWeight: 'bold', color: '#94a3b8' },
  tabTextActive: { color: 'white' },
  content: { flex: 1, paddingHorizontal: 16, paddingTop: 16 },
  sectionTitle: { fontSize: 16, fontWeight: 'bold', color: '#1e293b', marginBottom: 12, paddingHorizontal: 4 },
  emptyBox: { backgroundColor: 'white', paddingVertical: 64, borderRadius: 16, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#e2e8f0' },
  emptyBoxDashed: { backgroundColor: 'white', paddingVertical: 48, borderRadius: 16, justifyContent: 'center', alignItems: 'center', borderStyle: 'dashed', borderWidth: 1, borderColor: '#cbd5e1' },
  emptyText: { color: '#94a3b8', fontSize: 14 },
  emptyTextSmall: { color: '#94a3b8', fontSize: 12 },
  userCard: { backgroundColor: 'white', padding: 16, borderRadius: 16, marginBottom: 12, borderWidth: 1, borderColor: '#e2e8f0' },
  userCardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 },
  userName: { fontSize: 16, fontWeight: 'bold', color: '#1e293b' },
  userEmail: { fontSize: 14, color: '#64748b', marginTop: 2 },
  requestDate: { fontSize: 12, color: '#94a3b8' },
  actionGroup: { flexDirection: 'row', gap: 8, borderTopWidth: 1, borderTopColor: '#f1f5f9', paddingTop: 12 },
  rejectBtn: { flex: 1, height: 40, backgroundColor: '#fff1f2', borderWidth: 1, borderColor: '#fecdd3', borderRadius: 8, justifyContent: 'center', alignItems: 'center' },
  rejectBtnText: { color: '#e11d48', fontSize: 14, fontWeight: '600' },
  approveBtn: { flex: 1, height: 40, backgroundColor: '#2563eb', borderRadius: 8, justifyContent: 'center', alignItems: 'center' },
  approveBtnText: { color: 'white', fontSize: 14, fontWeight: 'bold' },
  panel: { backgroundColor: 'white', padding: 16, borderRadius: 16, borderWidth: 1, borderColor: '#e2e8f0', marginBottom: 16 },
  panelTitle: { fontSize: 14, fontWeight: 'bold', color: '#1e293b', marginBottom: 8 },
  expiryRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  expiryLabel: { fontSize: 12, color: '#64748b' },
  expiryInput: { width: 56, height: 32, borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 4, textAlign: 'center', backgroundColor: '#f8fafc', fontSize: 12, fontWeight: 'bold', marginHorizontal: 8 },
  generateBtn: { backgroundColor: '#2563eb', height: 44, borderRadius: 8, justifyContent: 'center', alignItems: 'center' },
  generateBtnText: { color: 'white', fontSize: 14, fontWeight: 'bold' },
  codeCard: { backgroundColor: 'white', padding: 12, borderRadius: 12, marginBottom: 8, borderWidth: 1, borderColor: '#e2e8f0' },
  codeCardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  codeText: { fontSize: 16, fontWeight: 'bold', color: '#0f172a', fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace' },
  codeActionGroup: { flexDirection: 'row', gap: 6 },
  codeBtn: { backgroundColor: '#f1f5f9', px: 8, py: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  codeBtnText: { color: '#475569', fontSize: 12 },
  shareBtn: { backgroundColor: '#0f172a' },
  shareBtnText: { color: 'white', fontSize: 12 },
  codeInfo: { fontSize: 11, color: '#94a3b8' }
});
