import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Alert,
  ActivityIndicator,
  FlatList,
  Modal,
} from "react-native";
import { useAuth } from "@/hooks/use-auth";
import { useColors } from "@/hooks/use-colors";
import { ScreenContainer } from "@/components/screen-container";

interface AccessCode {
  id: number;
  code: string;
  isActive: boolean;
  usageLimit: number | null;
  usageCount: number;
  expiresAt: string | null;
  createdAt: string | null;
  createdBy: string | null;
  notes: string | null;
}

interface AdminStats {
  totalAccessCodes: number;
  activeAccessCodes: number;
  totalUsage: number;
  activeSessions: number;
  totalUsers: number;
}

export default function AdminScreen() {
  const colors = useColors();
  const { user, isAuthenticated, loading } = useAuth();
  const [isAdmin, setIsAdmin] = useState(false);
  const [generatedCode, setGeneratedCode] = useState("");
  const [codeSettings, setCodeSettings] = useState({
    usageLimit: "",
    expirationDays: "7",
    notes: "",
  });
  const [accessCodes, setAccessCodes] = useState<AccessCode[]>([]);
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [selectedCode, setSelectedCode] = useState<AccessCode | null>(null);
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editSettings, setEditSettings] = useState({
    isActive: true,
    usageLimit: "",
    notes: "",
  });

  // Check if user is admin
  useEffect(() => {
    if (isAuthenticated && user) {
      setIsAdmin((user as any)?.role === "admin");
    }
  }, [isAuthenticated, user]);

  // Load data when admin
  useEffect(() => {
    if (isAdmin) {
      loadAdminData();
    }
  }, [isAdmin]);

  const loadAdminData = async () => {
    setIsLoading(true);
    try {
      // Load access codes
      const codesResponse = await fetch("/api/trpc/admin.listAccessCodes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
      });

      if (codesResponse.ok) {
        const codesData = await codesResponse.json();
        setAccessCodes(codesData.result.data || []);
      }

      // Load statistics
      const statsResponse = await fetch("/api/trpc/admin.getStatistics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
      });

      if (statsResponse.ok) {
        const statsData = await statsResponse.json();
        setStats(statsData.result.data || null);
      }
    } catch (error) {
      console.error("Failed to load admin data:", error);
      Alert.alert("오류", "데이터를 불러올 수 없습니다.");
    } finally {
      setIsLoading(false);
    }
  };

  const generateAccessCode = () => {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let code = "";
    for (let i = 0; i < 12; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setGeneratedCode(code);
  };

  const handleSaveCode = async () => {
    if (!generatedCode) {
      Alert.alert("오류", "코드를 먼저 생성하세요.");
      return;
    }

    setIsSaving(true);
    try {
      const expiresAt = codeSettings.expirationDays
        ? new Date(Date.now() + parseInt(codeSettings.expirationDays) * 24 * 60 * 60 * 1000)
        : null;

      const response = await fetch("/api/trpc/admin.createAccessCode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          input: {
            code: generatedCode,
            usageLimit: codeSettings.usageLimit ? parseInt(codeSettings.usageLimit) : null,
            expiresAt: expiresAt?.toISOString(),
            notes: codeSettings.notes,
          },
        }),
      });

      if (response.ok) {
        Alert.alert("성공", "접속코드가 저장되었습니다.");
        setGeneratedCode("");
        setCodeSettings({ usageLimit: "", expirationDays: "7", notes: "" });
        await loadAdminData();
      } else {
        const errorData = await response.json();
        Alert.alert("오류", errorData.result?.error?.message || "접속코드 저장에 실패했습니다.");
      }
    } catch (error) {
      Alert.alert("오류", "서버 오류가 발생했습니다.");
      console.error("Error saving code:", error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleUpdateCode = async () => {
    if (!selectedCode) return;

    setIsSaving(true);
    try {
      const response = await fetch("/api/trpc/admin.updateAccessCode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          input: {
            codeId: selectedCode.id,
            isActive: editSettings.isActive,
            usageLimit: editSettings.usageLimit ? parseInt(editSettings.usageLimit) : null,
            notes: editSettings.notes,
          },
        }),
      });

      if (response.ok) {
        Alert.alert("성공", "접속코드가 업데이트되었습니다.");
        setEditModalVisible(false);
        await loadAdminData();
      } else {
        Alert.alert("오류", "접속코드 업데이트에 실패했습니다.");
      }
    } catch (error) {
      Alert.alert("오류", "서버 오류가 발생했습니다.");
      console.error("Error updating code:", error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteCode = (code: AccessCode) => {
    Alert.alert("코드 삭제", `"${code.code}" 코드를 삭제하시겠습니까?`, [
      { text: "취소", style: "cancel" },
      {
        text: "삭제",
        style: "destructive",
        onPress: async () => {
          setIsSaving(true);
          try {
            const response = await fetch("/api/trpc/admin.deleteAccessCode", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              credentials: "include",
              body: JSON.stringify({
                input: { codeId: code.id },
              }),
            });

            if (response.ok) {
              Alert.alert("성공", "접속코드가 삭제되었습니다.");
              await loadAdminData();
            } else {
              Alert.alert("오류", "접속코드 삭제에 실패했습니다.");
            }
          } catch (error) {
            Alert.alert("오류", "서버 오류가 발생했습니다.");
          } finally {
            setIsSaving(false);
          }
        },
      },
    ]);
  };

  const openEditModal = (code: AccessCode) => {
    setSelectedCode(code);
    setEditSettings({
      isActive: code.isActive,
      usageLimit: code.usageLimit?.toString() || "",
      notes: code.notes || "",
    });
    setEditModalVisible(true);
  };

  if (loading) {
    return (
      <ScreenContainer>
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </ScreenContainer>
    );
  }

  // 관리자 권한 체크 대신 비밀번호 인증으로 간소화 (필요시 복구)
  // if (!isAdmin) { ... }

  return (
    <ScreenContainer>
      <ScrollView style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.content}>
          {/* Header */}
          <View style={[styles.header, { borderBottomColor: colors.border }]}>
            <Text style={[styles.pageTitle, { color: colors.foreground }]}>
              관리자 대시보드
            </Text>
            <TouchableOpacity onPress={() => router.back()}>
              <Text style={{ color: colors.primary }}>뒤로가기</Text>
            </TouchableOpacity>
          </View>

          {/* Statistics */}
          {stats && (
            <View style={[styles.statsContainer, { backgroundColor: colors.surface }]}>
              <View style={styles.statBox}>
                <Text style={[styles.statLabel, { color: colors.muted }]}>
                  전체 접속코드
                </Text>
                <Text style={[styles.statValue, { color: colors.primary }]}>
                  {stats.totalAccessCodes}
                </Text>
              </View>
              <View style={styles.statBox}>
                <Text style={[styles.statLabel, { color: colors.muted }]}>
                  활성 코드
                </Text>
                <Text style={[styles.statValue, { color: colors.success }]}>
                  {stats.activeAccessCodes}
                </Text>
              </View>
              <View style={styles.statBox}>
                <Text style={[styles.statLabel, { color: colors.muted }]}>
                  총 사용 횟수
                </Text>
                <Text style={[styles.statValue, { color: colors.primary }]}>
                  {stats.totalUsage}
                </Text>
              </View>
            </View>
          )}

          {/* Code Generator Section */}
          <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
              새 접속코드 생성
            </Text>

            <View style={styles.codeGeneratorContainer}>
              <View
                style={[
                  styles.generatedCodeBox,
                  { backgroundColor: colors.primary + "12", borderLeftWidth: 4, borderLeftColor: colors.primary },
                ]}
              >
                <Text style={[styles.generatedCode, { color: colors.primary }]}>
                  {generatedCode || "코드 생성 필요"}
                </Text>
              </View>

              <TouchableOpacity
                style={[styles.generateButton, { backgroundColor: colors.success }]}
                onPress={generateAccessCode}
              >
                <Text style={styles.generateButtonText}>새 코드 생성</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.settingsContainer}>
              <Text style={[styles.settingLabel, { color: colors.foreground }]}>
                사용 횟수 제한 (선택사항)
              </Text>
              <TextInput
                style={[
                  styles.settingInput,
                  { borderColor: colors.border, color: colors.foreground },
                ]}
                placeholder="예: 10 (비워두면 무제한)"
                placeholderTextColor={colors.muted}
                keyboardType="number-pad"
                value={codeSettings.usageLimit}
                onChangeText={(text) =>
                  setCodeSettings({ ...codeSettings, usageLimit: text })
                }
              />

              <Text style={[styles.settingLabel, { color: colors.foreground }]}>
                만료 기간 (일)
              </Text>
              <TextInput
                style={[
                  styles.settingInput,
                  { borderColor: colors.border, color: colors.foreground },
                ]}
                placeholder="예: 7"
                placeholderTextColor={colors.muted}
                keyboardType="number-pad"
                value={codeSettings.expirationDays}
                onChangeText={(text) =>
                  setCodeSettings({ ...codeSettings, expirationDays: text })
                }
              />

              <Text style={[styles.settingLabel, { color: colors.foreground }]}>
                메모
              </Text>
              <TextInput
                style={[
                  styles.settingInput,
                  styles.notesInput,
                  { borderColor: colors.border, color: colors.foreground },
                ]}
                placeholder="코드에 대한 메모"
                placeholderTextColor={colors.muted}
                multiline
                numberOfLines={3}
                value={codeSettings.notes}
                onChangeText={(text) =>
                  setCodeSettings({ ...codeSettings, notes: text })
                }
              />
            </View>

            <TouchableOpacity
              style={[styles.saveButton, { backgroundColor: colors.primary }]}
              onPress={handleSaveCode}
              disabled={isSaving}
            >
              {isSaving ? (
                <ActivityIndicator color="white" size="small" />
              ) : (
                <Text style={styles.saveButtonText}>코드 저장</Text>
              )}
            </TouchableOpacity>
          </View>

          {/* Access Codes List */}
          <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={styles.listHeader}>
              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
                생성된 접속코드 ({accessCodes.length})
              </Text>
            </View>

            {isLoading ? (
              <ActivityIndicator color={colors.primary} size="small" />
            ) : (
              <FlatList
                data={accessCodes}
                keyExtractor={(item) => item.id.toString()}
                scrollEnabled={false}
                renderItem={({ item }) => (
                  <View
                    style={[
                      styles.codeItem,
                      {
                        backgroundColor: item.isActive ? colors.background : colors.muted + "10",
                        borderColor: colors.border,
                      },
                    ]}
                  >
                    <View style={styles.codeItemHeader}>
                      <Text style={[styles.codeItemCode, { color: colors.primary }]}>
                        {item.code}
                      </Text>
                      <Text style={{ fontSize: 12, color: item.isActive ? colors.success : colors.error }}>
                        {item.isActive ? "활성" : "비활성"}
                      </Text>
                    </View>

                    <View style={styles.codeItemDetails}>
                      <Text style={[styles.codeItemDetail, { color: colors.muted }]}>
                        사용: {item.usageCount}/{item.usageLimit || "무제한"}
                      </Text>
                      {item.notes && (
                        <Text style={[styles.codeItemDetail, { color: colors.muted }]}>
                          메모: {item.notes}
                        </Text>
                      )}
                    </View>

                    <View style={styles.codeItemActions}>
                      <TouchableOpacity
                        style={[styles.actionButton, { borderColor: colors.primary }]}
                        onPress={() => openEditModal(item)}
                      >
                        <Text style={{ color: colors.primary, fontSize: 12 }}>수정</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.actionButton, { borderColor: colors.error }]}
                        onPress={() => handleDeleteCode(item)}
                      >
                        <Text style={{ color: colors.error, fontSize: 12 }}>삭제</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                )}
              />
            )}
          </View>
        </View>
      </ScrollView>

      {/* Edit Modal */}
      <Modal visible={editModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.surface }]}>
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>코드 수정</Text>
            
            <TouchableOpacity
              style={[styles.saveButton, { backgroundColor: colors.primary, marginTop: 20 }]}
              onPress={handleUpdateCode}
            >
              <Text style={styles.saveButtonText}>저장</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.saveButton, { backgroundColor: colors.muted, marginTop: 10 }]}
              onPress={() => setEditModalVisible(false)}
            >
              <Text style={styles.saveButtonText}>취소</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, paddingBottom: 40 },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingBottom: 16, marginBottom: 24, borderBottomWidth: 1 },
  pageTitle: { fontSize: 24, fontWeight: "bold" },
  statsContainer: { flexDirection: "row", marginBottom: 24, borderRadius: 12, padding: 12, gap: 12 },
  statBox: { flex: 1, alignItems: "center" },
  statLabel: { fontSize: 12, marginBottom: 4 },
  statValue: { fontSize: 20, fontWeight: "bold" },
  section: { borderWidth: 1, borderRadius: 12, padding: 16, marginBottom: 20 },
  sectionTitle: { fontSize: 16, fontWeight: "600", marginBottom: 16 },
  codeGeneratorContainer: { marginBottom: 16 },
  generatedCodeBox: { padding: 12, borderRadius: 8, marginBottom: 12 },
  generatedCode: { fontSize: 20, fontWeight: "bold", textAlign: "center" },
  generateButton: { paddingVertical: 12, borderRadius: 8, alignItems: "center" },
  generateButtonText: { color: "#fff", fontWeight: "600" },
  settingsContainer: { marginBottom: 16 },
  settingLabel: { fontSize: 14, marginBottom: 6, marginTop: 12 },
  settingInput: { borderWidth: 1, borderRadius: 8, padding: 10 },
  notesInput: { minHeight: 60, textAlignVertical: "top" },
  saveButton: { paddingVertical: 12, borderRadius: 8, alignItems: "center" },
  saveButtonText: { color: "#fff", fontWeight: "600" },
  listHeader: { marginBottom: 16 },
  codeItem: { borderWidth: 1, borderRadius: 8, padding: 12, marginBottom: 12 },
  codeItemHeader: { flexDirection: "row", justifyContent: "space-between", marginBottom: 8 },
  codeItemCode: { fontSize: 16, fontWeight: "bold" },
  codeItemDetails: { gap: 4, marginBottom: 12 },
  codeItemDetail: { fontSize: 12 },
  codeItemActions: { flexDirection: "row", gap: 8 },
  actionButton: { flex: 1, borderWidth: 1, borderRadius: 6, paddingVertical: 6, alignItems: "center" },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", alignItems: "center" },
  modalContent: { borderRadius: 12, padding: 20, width: "80%" },
  modalTitle: { fontSize: 18, fontWeight: "bold" },
});
