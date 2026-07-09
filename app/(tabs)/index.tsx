import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";

import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { SavedProject, useFilm } from "@/lib/filmContext";
import { formatNumber } from "@/lib/filmCutting";
import { exportProjectAsFile, exportAllProjectsAsFile, importProjectFromFile, importMultipleProjectsFromFile, extractProjectInfo } from "@/lib/projectExport";
import { useAuth as useGuestAuth } from "@/app/contexts/AuthContext";
import { useAuth } from "@/hooks/use-auth";

// ─── 날짜 포맷 ───────────────────────────────────────────────

function formatDate(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// ─── 저장 프로젝트 카드 ──────────────────────────────────────

interface ProjectCardProps {
  project: SavedProject;
  colors: ReturnType<typeof useColors>;
  onLoad: () => void;
  onDelete: () => void;
}

function ProjectCard({ project, colors, onLoad, onDelete }: ProjectCardProps) {
  const totalPieces = project.groups.reduce((s, g) => s + g.pieces.filter((p) => p.width > 0).length, 0);
  const groupNames = project.groups.map((g) => g.groupName).join(", ");

  return (
    <View style={[styles.projectCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <TouchableOpacity style={styles.projectCardMain} onPress={onLoad} activeOpacity={0.7}>
        <View style={styles.projectCardHeader}>
          <Text style={[styles.projectCardName, { color: colors.foreground }]} numberOfLines={1}>
            {project.name}
          </Text>
          <Text style={[styles.projectCardDate, { color: colors.muted }]}>
            {formatDate(project.savedAt)}
          </Text>
        </View>
        <View style={styles.projectCardMeta}>
          <Text style={[styles.projectCardMetaText, { color: colors.muted }]}>
            그룹: {project.groups.length}개  ·  조각: {totalPieces}개
          </Text>
          {groupNames ? (
            <Text style={[styles.projectCardMetaText, { color: colors.muted }]} numberOfLines={1}>
              {groupNames}
            </Text>
          ) : null}
        </View>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.projectDeleteBtn, { borderLeftColor: colors.border }]}
        onPress={onDelete}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Text style={{ color: colors.error, fontSize: 18 }}>🗑</Text>
      </TouchableOpacity>
    </View>
  );
}

// ─── 홈 탭 ───────────────────────────────────────────────────

export default function HomeScreen() {
  const colors = useColors();
  const { state, dispatch, saveCurrentProject, loadProject, deleteProject, startNewProject } = useFilm();
  const [isSaving, setIsSaving] = useState(false);
  const [nameModalVisible, setNameModalVisible] = useState(false);
  const [nameText, setNameText] = useState(state.projectName);
  const [loadConfirmProject, setLoadConfirmProject] = useState<SavedProject | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);

  // 인증 상태 확인
  const { guestSession } = useGuestAuth();
  const { isAuthenticated, loading: authLoading } = useAuth();
  const isLoggedIn = !!guestSession || !!isAuthenticated;

  // 미로그인 시 로그인 화면으로 리다이렉트
  React.useEffect(() => {
    if (!authLoading && !isLoggedIn) {
      // 웹 환경에서 GitHub Pages 서브 디렉토리 문제를 피하기 위해 상대 경로 사용 검토
      router.replace("/(tabs)/login");
    }
  }, [isLoggedIn, authLoading]);

  if (authLoading || !isLoggedIn) {
    return (
      <ScreenContainer>
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </ScreenContainer>
    );
  }

  // 프로젝트명 수정
  const handleNameConfirm = useCallback(() => {
    if (!nameText.trim()) return;
    dispatch({ type: "SET_PROJECT_NAME", payload: nameText.trim() });
    setNameModalVisible(false);
  }, [nameText, dispatch]);

  // 저장
  const handleSave = useCallback(async () => {
    setIsSaving(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      await saveCurrentProject();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert("저장 완료", `"${state.projectName}" 프로젝트가 저장되었습니다.`);
    } catch {
      Alert.alert("저장 실패", "저장 중 오류가 발생했습니다.");
    } finally {
      setIsSaving(false);
    }
  }, [saveCurrentProject, state.projectName]);

  // 불러오기 확인
  const handleLoadConfirm = useCallback((project: SavedProject) => {
    const hasData = state.groups.length > 0;
    if (hasData) {
      setLoadConfirmProject(project);
    } else {
      loadProject(project);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  }, [state.groups.length, loadProject]);

  // 삭제
  const handleDelete = useCallback((project: SavedProject) => {
    Alert.alert("프로젝트 삭제", `"${project.name}"을(를) 삭제하시겠습니까?`, [
      { text: "취소", style: "cancel" },
      {
        text: "삭제", style: "destructive",
        onPress: async () => {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
          await deleteProject(project.id);
        },
      },
    ]);
  }, [deleteProject]);

  // 새 프로젝트
  const handleNewProject = useCallback(() => {
    const hasData = state.groups.length > 0;
    const doNew = () => {
      startNewProject();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    };
    if (hasData) {
      if (Platform.OS === "web") {
        const choice = window.confirm(
          "새 프로젝트\n\n현재 작업 내용이 초기화됩니다. 계속하시겠습니까?"
        );
        if (choice) doNew();
      } else {
        Alert.alert("새 프로젝트", "현재 작업 내용이 초기화됩니다.\n먼저 저장하시겠습니까?", [
          { text: "취소", style: "cancel" },
          {
            text: "저장 후 새로 시작",
            onPress: async () => {
              await saveCurrentProject();
              doNew();
            },
          },
          {
            text: "그냥 시작", style: "destructive",
            onPress: doNew,
          },
        ]);
      }
    } else {
      doNew();
    }
  }, [state.groups.length, saveCurrentProject, startNewProject]);

  // 현재 프로젝트 요약
  const totalGroups = state.groups.length;
  const totalPieces = state.groups.reduce(
    (s, g) => s + g.pieces.filter((p) => p.width > 0 && p.height > 0).length, 0,
  );
  const hasResult = !!state.lastResult;

  if (state.isLoading) {
    return (
      <ScreenContainer>
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer containerClassName="bg-background">
      {/* 헤더 */}
      <View style={[styles.header, { backgroundColor: colors.primary }]}>
        <Text style={styles.headerTitle}>필름 재단 계산기</Text>
        <Text style={[styles.headerSub, { color: "rgba(255,255,255,0.75)" }]}>
          필름 너비 1,220mm 고정
        </Text>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>

        {/* ── 현재 프로젝트 카드 ── */}
        <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.sectionLabel, { color: colors.muted }]}>현재 프로젝트</Text>

          {/* 프로젝트명 및 새프로젝트 버튼 */}
          <View style={styles.projectNameRowContainer}>
            <TouchableOpacity
              style={[styles.projectNameRow, { borderColor: colors.primary + "40", backgroundColor: colors.primary + "08", flex: 1 }]}
              onPress={() => { setNameText(state.projectName); setNameModalVisible(true); }}
            >
              <Text style={[styles.projectNameText, { color: colors.primary }]} numberOfLines={1}>
                {state.projectName}
              </Text>
              <Text style={[styles.projectNameEdit, { color: colors.primary + "80" }]}>✏ 수정</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.newProjectBtnCompact, { backgroundColor: colors.primary, marginLeft: 8 }]}
              onPress={handleNewProject}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={styles.newProjectBtnCompactText}>＋</Text>
            </TouchableOpacity>
          </View>

          {/* 현재 작업 요약 */}
          <View style={styles.summaryRow}>
            <View style={[styles.summaryChip, { backgroundColor: colors.primary + "12" }]}>
              <Text style={[styles.summaryChipText, { color: colors.primary }]}>그룹 {totalGroups}개</Text>
            </View>
            <View style={[styles.summaryChip, { backgroundColor: colors.primary + "12" }]}>
              <Text style={[styles.summaryChipText, { color: colors.primary }]}>조각 {totalPieces}개</Text>
            </View>
            {hasResult && (
              <View style={[styles.summaryChip, { backgroundColor: colors.success + "20" }]}>
                <Text style={[styles.summaryChipText, { color: colors.success }]}>계산 완료 ✓</Text>
              </View>
            )}
          </View>

          {/* 액션 버튼 */}
          <View style={styles.actionRow}>
            <TouchableOpacity
              style={[styles.actionBtn, { backgroundColor: colors.primary }]}
              onPress={handleSave}
              disabled={isSaving}
            >
              {isSaving
                ? <ActivityIndicator color="white" size="small" />
                : <Text style={styles.actionBtnText}>💾  저장</Text>
              }
            </TouchableOpacity>
          </View>

          {/* 내보내기/불러오기 버튼 */}
          <View style={styles.exportImportRow}>
            <TouchableOpacity
              style={[styles.exportImportBtn, { backgroundColor: colors.primary + "18", borderColor: colors.primary }]}
              onPress={async () => {
                setIsExporting(true);
                try {
                  const currentProject = {
                    id: Date.now().toString(),
                    name: state.projectName,
                    savedAt: Date.now(),
                    groups: state.groups,
                    materialCostPerM: state.materialCostPerM,
                    constructionPricePerM2: state.constructionPricePerM2,
                  };
                  await exportProjectAsFile(currentProject);
                  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                } catch (error) {
                  Alert.alert("내보내기 실패", "프로젝트를 내보낼 수 없습니다.");
                } finally {
                  setIsExporting(false);
                }
              }}
              disabled={isExporting}
            >
              {isExporting
                ? <ActivityIndicator color={colors.primary} size="small" />
                : <Text style={[styles.exportImportBtnText, { color: colors.primary }]}>📤  내보내기</Text>
              }
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.exportImportBtn, { backgroundColor: colors.success + "18", borderColor: colors.success }]}
              onPress={async () => {
                setIsImporting(true);
                try {
                  const projects = await importMultipleProjectsFromFile();
                  if (projects.length > 0) {
                    loadProject(projects[0]);
                    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                    Alert.alert("불러오기 완료", `${projects.length}개의 프로젝트를 불러왔습니다.`);
                  }
                } catch (error) {
                  Alert.alert("불러오기 실패", "프로젝트를 불러올 수 없습니다.");
                } finally {
                  setIsImporting(false);
                }
              }}
              disabled={isImporting}
            >
              {isImporting
                ? <ActivityIndicator color={colors.success} size="small" />
                : <Text style={[styles.exportImportBtnText, { color: colors.success }]}>📥  불러오기</Text>
              }
            </TouchableOpacity>
          </View>
        </View>

        {/* ── 빠른 이동 ── */}
        <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.sectionLabel, { color: colors.muted }]}>빠른 이동</Text>
          <View style={styles.quickNav}>
            {[
              { label: "✏️  조각 입력", tab: "/input", desc: "그룹/브랜드/치수 입력" },
              { label: "✂️  배치 결과", tab: "/cutting", desc: "모눈종이 시각화" },
              { label: "💰  최종 견적", tab: "/estimate", desc: "비용 계산 및 공유" },
            ].map(({ label, tab, desc }) => (
              <TouchableOpacity
                key={tab}
                style={[styles.quickNavBtn, { backgroundColor: colors.background, borderColor: colors.border }]}
                onPress={() => router.push(tab as any)}
                activeOpacity={0.7}
              >
                <Text style={[styles.quickNavLabel, { color: colors.foreground }]}>{label}</Text>
                <Text style={[styles.quickNavDesc, { color: colors.muted }]}>{desc}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* ── 저장된 프로젝트 목록 ── */}
        <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.sectionHeaderRow}>
            <Text style={[styles.sectionLabel, { color: colors.muted }]}>저장된 프로젝트</Text>
            <Text style={[styles.sectionCount, { color: colors.muted }]}>
              {state.savedProjects.length} / 20
            </Text>
          </View>

          {state.savedProjects.length === 0 ? (
            <View style={styles.emptyProjects}>
              <Text style={[styles.emptyProjectsText, { color: colors.muted }]}>
                저장된 프로젝트가 없습니다.{"\n"}상단의 저장 버튼을 눌러 현재 작업을 저장하세요.
              </Text>
            </View>
          ) : (
            state.savedProjects.map((project) => (
              <ProjectCard
                key={project.id}
                project={project}
                colors={colors}
                onLoad={() => handleLoadConfirm(project)}
                onDelete={() => handleDelete(project)}
              />
            ))
          )}
        </View>

        <View style={{ height: 20 }} />
      </ScrollView>

      {/* 프로젝트명 수정 모달 */}
      <Modal visible={nameModalVisible} transparent animationType="fade" onRequestClose={() => setNameModalVisible(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setNameModalVisible(false)}>
          <Pressable style={[styles.modalBox, { backgroundColor: colors.background }]}>
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>프로젝트명 수정</Text>
            <TextInput
              style={[styles.modalInput, { color: colors.foreground, borderColor: colors.primary, backgroundColor: colors.surface }]}
              value={nameText}
              onChangeText={setNameText}
              autoFocus
              returnKeyType="done"
              onSubmitEditing={handleNameConfirm}
              maxLength={30}
              placeholder="프로젝트명을 입력하세요"
              placeholderTextColor={colors.muted}
            />
            <View style={styles.modalBtns}>
              <TouchableOpacity style={[styles.modalCancelBtn, { borderColor: colors.border }]} onPress={() => setNameModalVisible(false)}>
                <Text style={[styles.modalCancelText, { color: colors.muted }]}>취소</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalConfirmBtn, { backgroundColor: colors.primary }]} onPress={handleNameConfirm}>
                <Text style={styles.modalConfirmText}>확인</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* 불러오기 확인 모달 */}
      <Modal visible={!!loadConfirmProject} transparent animationType="fade" onRequestClose={() => setLoadConfirmProject(null)}>
        <Pressable style={styles.modalOverlay} onPress={() => setLoadConfirmProject(null)}>
          <Pressable style={[styles.modalBox, { backgroundColor: colors.background }]}>
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>프로젝트 불러오기</Text>
            <Text style={[styles.modalDesc, { color: colors.muted }]}>
              현재 작업 중인 데이터가 있습니다.{"\n"}
              "{loadConfirmProject?.name}"을(를) 불러오면 현재 데이터가 초기화됩니다.
            </Text>
            <View style={styles.modalBtns}>
              <TouchableOpacity style={[styles.modalCancelBtn, { borderColor: colors.border }]} onPress={() => setLoadConfirmProject(null)}>
                <Text style={[styles.modalCancelText, { color: colors.muted }]}>취소</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalConfirmBtn, { backgroundColor: colors.primary }]}
                onPress={() => {
                  if (loadConfirmProject) {
                    loadProject(loadConfirmProject);
                    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                  }
                  setLoadConfirmProject(null);
                }}
              >
                <Text style={styles.modalConfirmText}>불러오기</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </ScreenContainer>
  );
}

// ─── 스타일 ──────────────────────────────────────────────────

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  header: { paddingHorizontal: 16, paddingVertical: 14 },
  headerTitle: { fontSize: 20, fontWeight: "700", color: "white" },
  headerSub: { fontSize: 12, marginTop: 2 },
  scrollContent: { padding: 14, gap: 14 },
  section: { borderRadius: 14, borderWidth: 1, padding: 16, gap: 12 },
  sectionLabel: { fontSize: 12, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5 },
  sectionHeaderRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  sectionCount: { fontSize: 12 },

  // 현재 프로젝트
  projectNameRowContainer: { flexDirection: "row", alignItems: "center", gap: 8 },
  projectNameRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    borderWidth: 1.5, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12,
  },
  projectNameText: { fontSize: 18, fontWeight: "700", flex: 1 },
  projectNameEdit: { fontSize: 13 },
  newProjectBtnCompact: { width: 44, height: 44, borderRadius: 10, justifyContent: "center", alignItems: "center" },
  newProjectBtnCompactText: { fontSize: 24, color: "white", fontWeight: "700" },
  summaryRow: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  summaryChip: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20 },
  summaryChipText: { fontSize: 12, fontWeight: "600" },
  actionRow: { flexDirection: "row", gap: 10 },
  actionBtn: { flex: 1, paddingVertical: 13, borderRadius: 10, alignItems: "center" },
  actionBtnText: { color: "white", fontSize: 15, fontWeight: "700" },
  actionBtnOutline: { flex: 1, paddingVertical: 13, borderRadius: 10, borderWidth: 1.5, alignItems: "center" },
  actionBtnOutlineText: { fontSize: 15, fontWeight: "600" },
  exportImportRow: { flexDirection: "row", gap: 10, marginTop: 8 },
  exportImportBtn: { flex: 1, paddingVertical: 11, borderRadius: 10, borderWidth: 1.5, alignItems: "center" },
  exportImportBtnText: { fontSize: 14, fontWeight: "600" },

  // 빠른 이동
  quickNav: { gap: 8 },
  quickNavBtn: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 14, paddingVertical: 12, borderRadius: 10, borderWidth: 1 },
  quickNavLabel: { fontSize: 14, fontWeight: "600" },
  quickNavDesc: { fontSize: 12 },

  // 저장 프로젝트 목록
  emptyProjects: { paddingVertical: 20, alignItems: "center" },
  emptyProjectsText: { fontSize: 13, textAlign: "center", lineHeight: 20 },
  projectCard: { flexDirection: "row", borderRadius: 10, borderWidth: 1, overflow: "hidden", marginBottom: 8 },
  projectCardMain: { flex: 1, padding: 12, gap: 6 },
  projectCardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 8 },
  projectCardName: { fontSize: 15, fontWeight: "700", flex: 1 },
  projectCardDate: { fontSize: 11 },
  projectCardMeta: { gap: 2 },
  projectCardMetaText: { fontSize: 12 },
  projectDeleteBtn: { width: 52, justifyContent: "center", alignItems: "center", borderLeftWidth: StyleSheet.hairlineWidth },

  // 모달
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "center", alignItems: "center" },
  modalBox: { width: "82%", borderRadius: 16, padding: 24, elevation: 8, shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8 },
  modalTitle: { fontSize: 17, fontWeight: "700", marginBottom: 12, textAlign: "center" },
  modalDesc: { fontSize: 14, lineHeight: 22, textAlign: "center", marginBottom: 20 },
  modalInput: { borderWidth: 1.5, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16, marginBottom: 20 },
  modalBtns: { flexDirection: "row", gap: 10 },
  modalCancelBtn: { flex: 1, paddingVertical: 12, borderRadius: 8, borderWidth: 1, alignItems: "center" },
  modalCancelText: { fontSize: 15, fontWeight: "500" },
  modalConfirmBtn: { flex: 1, paddingVertical: 12, borderRadius: 8, alignItems: "center" },
  modalConfirmText: { color: "white", fontSize: 15, fontWeight: "700" },
});
