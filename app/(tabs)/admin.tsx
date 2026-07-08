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
  Pressable,
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

  if (!isAuthenticated || !user) {
    return (
      <ScreenContainer>
        <View style={[styles.center, { backgroundColor: colors.background }]}>
          <Text style={[styles.title, { color: colors.foreground }]}>
            로그인이 필요합니다
          </Text>
          <Text style={[styles.subtitle, { color: colors.muted }]}>
            관리자 계정으로 로그인한 후 접근할 수 있습니다.
          </Text>
        </View>
      </ScreenContainer>
    );
  }

  if (!isAdmin) {
    return (
      <ScreenContainer>
        <View style={[styles.center, { backgroundColor: colors.background }]}>
          <Text style={[styles.title, { color: colors.foreground }]}>
            접근 권한이 없습니다
          </Text>
          <Text style={[styles.subtitle, { color: colors.muted }]}>
            관리자 계정으로만 접근할 수 있습니다.
          </Text>
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <ScrollView style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.content}>
          {/* Header */}
          <View style={[styles.header, { borderBottomColor: colors.border }]}>
            <Text style={[styles.pageTitle, { color: colors.foreground }]}>
              관리자 대시보드
            </Text>
            <Text style={[styles.userInfo, { color: colors.muted }]}>
              {user?.name || user?.email || "관리자"}
            </Text>
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
              <View style={styles.statBox}>
                <Text style={[styles.statLabel, { color: colors.muted }]}>
                  활성 세션
                </Text>
                <Text style={[styles.statValue, { color: colors.warning }]}>
                  {stats.activeSessions}
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
                  { backgroundColor: colors.primary + "12", borderLeftColor: colors.primary },
                ]}
              >
                <Text style={[styles.generatedCodeLabel, { color: colors.muted }]}>
                  생성된 코드:
                </Text>
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
                placeholder="코드에 대한 메모 (선택사항)"
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
                생성된 접속코드
              </Text>
              <Text style={[styles.codeCount, { color: colors.muted }]}>
                {accessCodes.length}개
              </Text>
            </View>

            {isLoading ? (
              <ActivityIndicator color={colors.primary} size="small" />
            ) : accessCodes.length === 0 ? (
              <Text style={[styles.emptyText, { color: colors.muted }]}>
                생성된 접속코드가 없습니다.
              </Text>
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
                        backgroundColor: item.isActive ? colors.background : colors.muted + "20",
                        borderColor: colors.border,
                      },
                    ]}
                  >
                    <View style={styles.codeItemContent}>
                      <View style={styles.codeItemHeader}>
                        <Text style={[styles.codeItemCode, { color: colors.primary }]}>
                          {item.code}
                        </Text>
                        <View
                          style={[
                            styles.statusBadge,
                            {
                              backgroundColor: item.isActive
                                ? colors.success + "20"
                                : colors.error + "20",
                            },
                          ]}
                        >
                          <Text
                            style={[
                              styles.statusBadgeText,
                              { color: item.isActive ? colors.success : colors.error },
                            ]}
                          >
                            {item.isActive ? "활성" : "비활성"}
                          </Text>
                        </View>
                      </View>

                      <View style={styles.codeItemDetails}>
                        <Text style={[styles.codeItemDetail, { color: colors.muted }]}>
                          사용: {item.usageCount}
                          {item.usageLimit ? `/${item.usageLimit}` : "/무제한"}
                        </Text>
                        {item.expiresAt && (
                          <Text style={[styles.codeItemDetail, { color: colors.muted }]}>
                            만료: {new Date(item.expiresAt).toLocaleDateString("ko-KR")}
                          </Text>
                        )}
                        {item.notes && (
                          <Text style={[styles.codeItemDetail, { color: colors.muted }]}>
                            메모: {item.notes}
                          </Text>
                        )}
                      </View>
                    </View>

                    <View style={styles.codeItemActions}>
                      <TouchableOpacity
                        style={[styles.actionButton, { borderColor: colors.primary }]}
                        onPress={() => openEditModal(item)}
                      >
                        <Text style={[styles.actionButtonText, { color: colors.primary }]}>
                          수정
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.actionButton, { borderColor: colors.error }]}
                        onPress={() => handleDeleteCode(item)}
                      >
                        <Text style={[styles.actionButtonText, { color: colors.error }]}>
                          삭제
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                )}
              />
            )}
          </View>

          {/* Info Section */}
          <View
            style={[
              styles.infoContainer,
              { backgroundColor: colors.primary + "12", borderLeftColor: colors.primary },
            ]}
          >
            <Text style={[styles.infoTitle, { color: colors.primary }]}>
              💡 접속코드 관리 안내
            </Text>
            <Text style={[styles.infoText, { color: colors.foreground }]}>
              • 생성된 코드는 사용자가 앱 접속 시 입력합니다.{"\n"}
              • 사용 횟수 제한을 설정하면 해당 횟수만큼만 사용 가능합니다.{"\n"}
              • 만료 기간을 설정하면 해당 기간 후 코드가 자동 비활성화됩니다.{"\n"}
              • 메모는 관리자용으로만 표시됩니다.
            </Text>
          </View>
        </View>
      </ScrollView>

      {/* Edit Modal */}
      <Modal
        visible={editModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setEditModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.surface }]}>
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>
              코드 수정: {selectedCode?.code}
            </Text>

            <View style={styles.modalBody}>
              <Text style={[styles.settingLabel, { color: colors.foreground }]}>
                상태
              </Text>
              <View style={styles.toggleContainer}>
                <TouchableOpacity
                  style={[
                    styles.toggleButton,
                    {
                      backgroundColor: editSettings.isActive
                        ? colors.success
                        : colors.muted + "40",
                    },
                  ]}
                  onPress={() =>
                    setEditSettings({ ...editSettings, isActive: true })
                  }
                >
                  <Text
                    style={[
                      styles.toggleButtonText,
                      {
                        color: editSettings.isActive ? "white" : colors.muted,
                      },
                    ]}
                  >
                    활성
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.toggleButton,
                    {
                      backgroundColor: !editSettings.isActive
                        ? colors.error
                        : colors.muted + "40",
                    },
                  ]}
                  onPress={() =>
                    setEditSettings({ ...editSettings, isActive: false })
                  }
                >
                  <Text
                    style={[
                      styles.toggleButtonText,
                      {
                        color: !editSettings.isActive ? "white" : colors.muted,
                      },
                    ]}
                  >
                    비활성
                  </Text>
                </TouchableOpacity>
              </View>

              <Text style={[styles.settingLabel, { color: colors.foreground }]}>
                사용 횟수 제한
              </Text>
              <TextInput
                style={[
                  styles.settingInput,
                  { borderColor: colors.border, color: colors.foreground },
                ]}
                placeholder="비워두면 무제한"
                placeholderTextColor={colors.muted}
                keyboardType="number-pad"
                value={editSettings.usageLimit}
                onChangeText={(text) =>
                  setEditSettings({ ...editSettings, usageLimit: text })
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
                placeholder="메모"
                placeholderTextColor={colors.muted}
                multiline
                numberOfLines={3}
                value={editSettings.notes}
                onChangeText={(text) =>
                  setEditSettings({ ...editSettings, notes: text })
                }
              />
            </View>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalButton, { backgroundColor: colors.muted + "40" }]}
                onPress={() => setEditModalVisible(false)}
              >
                <Text style={[styles.modalButtonText, { color: colors.foreground }]}>
                  취소
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, { backgroundColor: colors.primary }]}
                onPress={handleUpdateCode}
                disabled={isSaving}
              >
                {isSaving ? (
                  <ActivityIndicator color="white" size="small" />
                ) : (
                  <Text style={styles.modalButtonText}>저장</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: 16,
    paddingBottom: 40,
  },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  header: {
    borderBottomWidth: 1,
    paddingBottom: 16,
    marginBottom: 24,
  },
  pageTitle: {
    fontSize: 28,
    fontWeight: "bold",
    marginBottom: 4,
  },
  userInfo: {
    fontSize: 14,
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    marginTop: 8,
  },
  statsContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginBottom: 24,
    borderRadius: 12,
    padding: 12,
    gap: 12,
  },
  statBox: {
    flex: 1,
    minWidth: "45%",
    alignItems: "center",
    paddingVertical: 12,
  },
  statLabel: {
    fontSize: 12,
    marginBottom: 4,
  },
  statValue: {
    fontSize: 24,
    fontWeight: "bold",
  },
  section: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 16,
  },
  codeGeneratorContainer: {
    marginBottom: 16,
  },
  generatedCodeBox: {
    padding: 12,
    borderRadius: 8,
    marginBottom: 12,
    borderLeftWidth: 4,
  },
  generatedCodeLabel: {
    fontSize: 12,
    marginBottom: 4,
  },
  generatedCode: {
    fontSize: 20,
    fontWeight: "bold",
    fontFamily: "monospace",
    letterSpacing: 2,
  },
  generateButton: {
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: "center",
  },
  generateButtonText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
  },
  settingsContainer: {
    marginBottom: 16,
  },
  settingLabel: {
    fontSize: 14,
    fontWeight: "500",
    marginBottom: 6,
    marginTop: 12,
  },
  settingInput: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    marginBottom: 8,
  },
  notesInput: {
    minHeight: 80,
    paddingTop: 10,
    textAlignVertical: "top",
  },
  saveButton: {
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: "center",
  },
  saveButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  listHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  codeCount: {
    fontSize: 14,
    fontWeight: "600",
  },
  emptyText: {
    fontSize: 14,
    textAlign: "center",
    paddingVertical: 20,
  },
  codeItem: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
  },
  codeItemContent: {
    marginBottom: 12,
  },
  codeItemHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  codeItemCode: {
    fontSize: 16,
    fontWeight: "bold",
    fontFamily: "monospace",
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  statusBadgeText: {
    fontSize: 12,
    fontWeight: "600",
  },
  codeItemDetails: {
    gap: 4,
  },
  codeItemDetail: {
    fontSize: 12,
  },
  codeItemActions: {
    flexDirection: "row",
    gap: 8,
  },
  actionButton: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 6,
    paddingVertical: 8,
    alignItems: "center",
  },
  actionButtonText: {
    fontSize: 12,
    fontWeight: "600",
  },
  infoContainer: {
    padding: 16,
    borderRadius: 8,
    borderLeftWidth: 4,
    marginBottom: 20,
  },
  infoTitle: {
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 8,
  },
  infoText: {
    fontSize: 13,
    lineHeight: 20,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalContent: {
    borderRadius: 12,
    padding: 20,
    width: "85%",
    maxWidth: 400,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 16,
  },
  modalBody: {
    marginBottom: 20,
  },
  toggleContainer: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 16,
  },
  toggleButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 6,
    alignItems: "center",
  },
  toggleButtonText: {
    fontSize: 14,
    fontWeight: "600",
  },
  modalActions: {
    flexDirection: "row",
    gap: 8,
  },
  modalButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: "center",
  },
  modalButtonText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
  },
});
