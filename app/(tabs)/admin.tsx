import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  Alert,
  TextInput,
  Modal,
  ScrollView,
  RefreshControl,
} from "react-native";
import { router } from "expo-router";
import { trpc } from "@/lib/trpc";
import { useColors } from "@/hooks/use-colors";
import { ScreenContainer } from "@/components/screen-container";

interface AccessCode {
  id: number;
  code: string;
  isActive: boolean;
  usageLimit: number | null;
  usageCount: number;
  expiresAt: string | null;
  notes: string | null;
  createdAt: string | null;
}

export default function AdminDashboard() {
  const colors = useColors();
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [editingCode, setEditingCode] = useState<AccessCode | null>(null);
  
  // Form state
  const [code, setCode] = useState("");
  const [usageLimit, setUsageLimit] = useState("");
  const [notes, setNotes] = useState("");

  const utils = trpc.useUtils();
  const { data: codes, isLoading, refetch, isRefetching } = trpc.admin.listAccessCodes.useQuery();
  const { data: stats } = trpc.admin.getStatistics.useQuery();

  const createMutation = trpc.admin.createAccessCode.useMutation({
    onSuccess: () => {
      utils.admin.listAccessCodes.invalidate();
      utils.admin.getStatistics.invalidate();
      closeModal();
      Alert.alert("성공", "접속코드가 생성되었습니다.");
    },
    onError: (error) => {
      Alert.alert("오류", error.message);
    },
  });

  const updateMutation = trpc.admin.updateAccessCode.useMutation({
    onSuccess: () => {
      utils.admin.listAccessCodes.invalidate();
      closeModal();
      Alert.alert("성공", "접속코드가 업데이트되었습니다.");
    },
    onError: (error) => {
      Alert.alert("오류", error.message);
    },
  });

  const deleteMutation = trpc.admin.deleteAccessCode.useMutation({
    onSuccess: () => {
      utils.admin.listAccessCodes.invalidate();
      utils.admin.getStatistics.invalidate();
      Alert.alert("성공", "접속코드가 삭제되었습니다.");
    },
    onError: (error) => {
      Alert.alert("오류", error.message);
    },
  });

  const openModal = (item?: AccessCode) => {
    if (item) {
      setEditingCode(item);
      setCode(item.code);
      setUsageLimit(item.usageLimit?.toString() || "");
      setNotes(item.notes || "");
    } else {
      setEditingCode(null);
      setCode("");
      setUsageLimit("");
      setNotes("");
    }
    setIsModalVisible(true);
  };

  const closeModal = () => {
    setIsModalVisible(false);
    setEditingCode(null);
  };

  const handleSubmit = () => {
    if (!code.trim() || code.trim().length < 6) {
      Alert.alert("오류", "접속코드는 최소 6자 이상이어야 합니다.");
      return;
    }

    const limit = usageLimit ? parseInt(usageLimit, 10) : undefined;

    if (editingCode) {
      updateMutation.mutate({
        codeId: editingCode.id,
        usageLimit: limit,
        notes: notes.trim() || undefined,
      });
    } else {
      createMutation.mutate({
        code: code.trim(),
        usageLimit: limit,
        notes: notes.trim() || undefined,
      });
    }
  };

  const handleDelete = (id: number) => {
    Alert.alert(
      "삭제 확인",
      "이 접속코드를 정말 삭제하시겠습니까?",
      [
        { text: "취소", style: "cancel" },
        { text: "삭제", style: "destructive", onPress: () => deleteMutation.mutate({ codeId: id }) },
      ]
    );
  };

  const toggleStatus = (item: AccessCode) => {
    updateMutation.mutate({
      codeId: item.id,
      isActive: !item.isActive,
    });
  };

  const renderItem = ({ item }: { item: AccessCode }) => (
    <View style={[styles.codeCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={styles.codeHeader}>
        <Text style={[styles.codeText, { color: colors.foreground }]}>{item.code}</Text>
        <TouchableOpacity
          style={[
            styles.statusBadge,
            { backgroundColor: item.isActive ? colors.success + "20" : colors.error + "20" }
          ]}
          onPress={() => toggleStatus(item)}
        >
          <Text style={{ color: item.isActive ? colors.success : colors.error, fontSize: 12, fontWeight: "600" }}>
            {item.isActive ? "활성" : "비활성"}
          </Text>
        </TouchableOpacity>
      </View>
      
      <View style={styles.codeDetails}>
        <Text style={[styles.detailText, { color: colors.muted }]}>
          사용: {item.usageCount} / {item.usageLimit || "무제한"}
        </Text>
        {item.notes && (
          <Text style={[styles.detailText, { color: colors.muted }]} numberOfLines={1}>
            메모: {item.notes}
          </Text>
        )}
      </View>

      <View style={styles.cardActions}>
        <TouchableOpacity style={styles.actionButton} onPress={() => openModal(item)}>
          <Text style={{ color: colors.primary, fontWeight: "600" }}>수정</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionButton} onPress={() => handleDelete(item.id)}>
          <Text style={{ color: colors.error, fontWeight: "600" }}>삭제</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <ScreenContainer containerClassName="bg-background">
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Text style={{ color: colors.primary, fontSize: 16 }}>← 뒤로</Text>
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.foreground }]}>관리자 대시보드</Text>
        <TouchableOpacity onPress={() => openModal()} style={styles.addButton}>
          <Text style={{ color: "#fff", fontWeight: "600" }}>+ 추가</Text>
        </TouchableOpacity>
      </View>

      {stats && (
        <View style={styles.statsContainer}>
          <View style={[styles.statBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.statLabel, { color: colors.muted }]}>총 코드</Text>
            <Text style={[styles.statValue, { color: colors.foreground }]}>{stats.totalAccessCodes}</Text>
          </View>
          <View style={[styles.statBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.statLabel, { color: colors.muted }]}>활성 세션</Text>
            <Text style={[styles.statValue, { color: colors.primary }]}>{stats.activeSessions}</Text>
          </View>
          <View style={[styles.statBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.statLabel, { color: colors.muted }]}>총 사용</Text>
            <Text style={[styles.statValue, { color: colors.foreground }]}>{stats.totalUsage}</Text>
          </View>
        </View>
      )}

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={codes}
          renderItem={renderItem}
          keyExtractor={(item) => item.id.toString()}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.primary} />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={{ color: colors.muted }}>생성된 접속코드가 없습니다.</Text>
            </View>
          }
        />
      )}

      <Modal visible={isModalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.background }]}>
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>
              {editingCode ? "접속코드 수정" : "새 접속코드 생성"}
            </Text>
            
            <ScrollView style={styles.modalForm}>
              <View style={styles.inputGroup}>
                <Text style={[styles.label, { color: colors.muted }]}>접속코드 (최소 6자)</Text>
                <TextInput
                  style={[styles.input, { borderColor: colors.border, color: colors.foreground }]}
                  value={code}
                  onChangeText={setCode}
                  placeholder="예: ABC123XYZ"
                  placeholderTextColor={colors.muted}
                  editable={!editingCode}
                  autoCapitalize="characters"
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={[styles.label, { color: colors.muted }]}>사용 횟수 제한 (선택)</Text>
                <TextInput
                  style={[styles.input, { borderColor: colors.border, color: colors.foreground }]}
                  value={usageLimit}
                  onChangeText={setUsageLimit}
                  placeholder="무제한인 경우 비워두세요"
                  placeholderTextColor={colors.muted}
                  keyboardType="numeric"
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={[styles.label, { color: colors.muted }]}>메모 (선택)</Text>
                <TextInput
                  style={[styles.input, styles.textArea, { borderColor: colors.border, color: colors.foreground }]}
                  value={notes}
                  onChangeText={setNotes}
                  placeholder="관리용 메모를 입력하세요"
                  placeholderTextColor={colors.muted}
                  multiline
                  numberOfLines={3}
                />
              </View>
            </ScrollView>

            <View style={styles.modalActions}>
              <TouchableOpacity style={[styles.modalButton, styles.cancelButton]} onPress={closeModal}>
                <Text style={{ color: colors.muted, fontWeight: "600" }}>취소</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.modalButton, styles.submitButton, { backgroundColor: colors.primary }]} 
                onPress={handleSubmit}
                disabled={createMutation.isLoading || updateMutation.isLoading}
              >
                {createMutation.isLoading || updateMutation.isLoading ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={{ color: "#fff", fontWeight: "600" }}>저장</Text>
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
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
  },
  backButton: { padding: 4 },
  title: { fontSize: 18, fontWeight: "bold" },
  addButton: {
    backgroundColor: "#007AFF",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  statsContainer: {
    flexDirection: "row",
    padding: 16,
    gap: 12,
  },
  statBox: {
    flex: 1,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center",
  },
  statLabel: { fontSize: 12, marginBottom: 4 },
  statValue: { fontSize: 18, fontWeight: "bold" },
  listContent: { padding: 16, gap: 12 },
  codeCard: {
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
  },
  codeHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  codeText: { fontSize: 18, fontWeight: "bold", letterSpacing: 1 },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  codeDetails: { marginBottom: 12 },
  detailText: { fontSize: 13, marginBottom: 2 },
  cardActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 16,
    borderTopWidth: 1,
    borderTopColor: "#f0f0f0",
    paddingTop: 12,
  },
  actionButton: { padding: 4 },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  emptyContainer: { flex: 1, alignItems: "center", marginTop: 100 },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    padding: 20,
  },
  modalContent: {
    borderRadius: 20,
    padding: 24,
    maxHeight: "80%",
  },
  modalTitle: { fontSize: 20, fontWeight: "bold", marginBottom: 20 },
  modalForm: { marginBottom: 20 },
  inputGroup: { marginBottom: 16 },
  label: { fontSize: 14, marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
  },
  textArea: { minHeight: 80, textAlignVertical: "top" },
  modalActions: { flexDirection: "row", gap: 12 },
  modalButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: "center",
  },
  cancelButton: { backgroundColor: "#f0f0f0" },
  submitButton: {},
});
