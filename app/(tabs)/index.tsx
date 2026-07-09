import React, { useCallback, useState, useEffect } from "react";
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
import { router, Redirect } from "expo-router";
import * as Haptics from "expo-haptics";

import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { SavedProject, useFilm } from "@/lib/filmContext";
import { formatNumber } from "@/lib/filmCutting";
import { exportProjectAsFile, exportAllProjectsAsFile, importProjectFromFile, importMultipleProjectsFromFile, extractProjectInfo } from "@/lib/projectExport";

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
  const [isLoggedIn, setIsLoggedIn] = useState<boolean | null>(null);

  // 인증 상태 확인
  useEffect(() => {
    const checkAuth = () => {
      if (typeof localStorage !== 'undefined') {
        const adminStatus = localStorage.getItem("isAdmin") === "true";
        const guestSession = localStorage.getItem("guestSession");
        const accessCodeValidated = localStorage.getItem("accessCodeValidated") === "true";
        setIsLoggedIn(adminStatus || guestSession !== null || accessCodeValidated);
      } else {
        setIsLoggedIn(false);
      }
    };
    checkAuth();
  }, []);

  // 로그인이 안 되어 있다면 로그인 페이지로 리다이렉트
  if (isLoggedIn === false) {
    return <Redirect href="/login" />;
  }

  if (isLoggedIn === null || state.isLoading) {
    return (
      <ScreenContainer>
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </ScreenContainer>
    );
  }

  // 프로젝트명 수정
  const handleNameConfirm = () => {
    if (!nameText.trim()) return;
    dispatch({ type: "SET_PROJECT_NAME", payload: nameText.trim() });
    setNameModalVisible(false);
  };

  // 저장
  const handleSave = async () => {
    setIsSaving(true);
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      await saveCurrentProject();
      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert("저장 완료", `"${state.projectName}" 프로젝트가 저장되었습니다.`);
    } catch {
      Alert.alert("저장 실패", "저장 중 오류가 발생했습니다.");
    } finally {
      setIsSaving(false);
    }
  };

  // 불러오기 확인
  const handleLoadConfirm = (project: SavedProject) => {
    const hasData = state.groups.length > 0;
    if (hasData) {
      setLoadConfirmProject(project);
    } else {
      loadProject(project);
      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  };

  // 삭제
  const handleDelete = (project: SavedProject) => {
    Alert.alert("프로젝트 삭제", `"${project.name}"을(를) 삭제하시겠습니까?`, [
      { text: "취소", style: "cancel" },
      {
        text: "삭제", style: "destructive",
        onPress: async () => {
          if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
          await deleteProject(project.id);
        },
      },
    ]);
  };

  // 새 프로젝트
  const handleNewProject = () => {
    const hasData = state.groups.length > 0;
    const doNew = () => {
      startNewProject();
      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
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
  };

  // 현재 프로젝트 요약
  const totalGroups = state.groups.length;
  const totalPiecesCount = state.groups.reduce(
    (s, g) => s + g.pieces.filter((p) => p.width > 0 && p.height > 0).length, 0,
  );
  const hasResult = !!state.lastResult;

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
              <Text style={[styles.summaryChipText, { color: colors.primary }]}>조각 {totalPiecesCount}개</Text>
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
                  if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
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
                    if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
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
          <Text style={[styles.sectionLabel, { color: colors.muted }]}>저장된 프로젝트</Text>
          {state.savedProjects.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Text style={[styles.emptyText, { color: colors.muted }]}>저장된 프로젝트가 없습니다.</Text>
            </View>
          ) : (
            state.savedProjects
              .sort((a, b) => b.savedAt - a.savedAt)
              .map((p) => (
                <ProjectCard
                  key={p.id}
                  project={p}
                  colors={colors}
                  onLoad={() => handleLoadConfirm(p)}
                  onDelete={() => handleDelete(p)}
                />
              ))
          )}
        </View>

        {/* 전체 내보내기 버튼 */}
        {state.savedProjects.length > 0 && (
          <TouchableOpacity
            style={[styles.exportAllBtn, { borderColor: colors.primary }]}
            onPress={async () => {
              try {
                await exportAllProjectsAsFile(state.savedProjects);
                if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              } catch (error) {
                Alert.alert("내보내기 실패", "전체 데이터를 내보낼 수 없습니다.");
              }
            }}
          >
            <Text style={[styles.exportAllBtnText, { color: colors.primary }]}>📦  전체 데이터 백업 (JSON)</Text>
          </TouchableOpacity>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* 프로젝트명 수정 모달 */}
      <Modal visible={nameModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.surface }]}>
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>프로젝트 이름 변경</Text>
            <TextInput
              style={[styles.modalInput, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background }]}
              value={nameText}
              onChangeText={setNameText}
              placeholder="프로젝트 이름을 입력하세요"
              placeholderTextColor={colors.muted}
              autoFocus
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity style={styles.modalBtn} onPress={() => setNameModalVisible(false)}>
                <Text style={{ color: colors.muted }}>취소</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalBtn, styles.modalBtnPrimary, { backgroundColor: colors.primary }]} onPress={handleNameConfirm}>
                <Text style={{ color: "white", fontWeight: "bold" }}>변경</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* 불러오기 확인 모달 */}
      <Modal visible={!!loadConfirmProject} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.surface }]}>
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>프로젝트 불러오기</Text>
            <Text style={[styles.modalDesc, { color: colors.muted }]}>
              "{loadConfirmProject?.name}"을(를) 불러오시겠습니까?{"\n"}
              현재 작업 중인 내용은 사라집니다.
            </Text>
            <View style={styles.modalButtons}>
              <TouchableOpacity style={styles.modalBtn} onPress={() => setLoadConfirmProject(null)}>
                <Text style={{ color: colors.muted }}>취소</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, styles.modalBtnPrimary, { backgroundColor: colors.primary }]}
                onPress={() => {
                  if (loadConfirmProject) {
                    loadProject(loadConfirmProject);
                    setLoadConfirmProject(null);
                    if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                  }
                }}
              >
                <Text style={{ color: "white", fontWeight: "bold" }}>불러오기</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  header: { paddingTop: 60, paddingBottom: 25, paddingHorizontal: 20, borderBottomLeftRadius: 24, borderBottomRightRadius: 24 },
  headerTitle: { fontSize: 24, fontWeight: "bold", color: "white", marginBottom: 4 },
  headerSub: { fontSize: 13, fontWeight: "500" },
  scrollContent: { padding: 20 },
  section: { borderRadius: 20, padding: 18, marginBottom: 20, borderWidth: 1 },
  sectionLabel: { fontSize: 12, fontWeight: "bold", marginBottom: 12, textTransform: "uppercase", letterSpacing: 0.5 },
  projectNameRowContainer: { flexDirection: "row", alignItems: "center", marginBottom: 14 },
  projectNameRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 14, paddingVertical: 12, borderRadius: 12, borderWidth: 1 },
  projectNameText: { fontSize: 17, fontWeight: "bold" },
  projectNameEdit: { fontSize: 12, fontWeight: "600" },
  newProjectBtnCompact: { width: 44, height: 44, borderRadius: 12, justifyContent: "center", alignItems: "center" },
  newProjectBtnCompactText: { color: "white", fontSize: 22, fontWeight: "bold" },
  summaryRow: { flexDirection: "row", marginBottom: 18, flexWrap: "wrap", gap: 8 },
  summaryChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
  summaryChipText: { fontSize: 12, fontWeight: "bold" },
  actionRow: { marginBottom: 12 },
  actionBtn: { height: 50, borderRadius: 12, justifyContent: "center", alignItems: "center", shadowOpacity: 0.2, shadowRadius: 4, elevation: 3 },
  actionBtnText: { color: "white", fontSize: 16, fontWeight: "bold" },
  exportImportRow: { flexDirection: "row", gap: 10 },
  exportImportBtn: { flex: 1, height: 44, borderRadius: 10, justifyContent: "center", alignItems: "center", borderWidth: 1 },
  exportImportBtnText: { fontSize: 13, fontWeight: "bold" },
  quickNav: { gap: 10 },
  quickNavBtn: { padding: 15, borderRadius: 14, borderWidth: 1 },
  quickNavLabel: { fontSize: 16, fontWeight: "bold", marginBottom: 4 },
  quickNavDesc: { fontSize: 12 },
  projectCard: { flexDirection: "row", borderRadius: 14, marginBottom: 10, borderWidth: 1, overflow: "hidden" },
  projectCardMain: { flex: 1, padding: 14 },
  projectCardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6 },
  projectCardName: { fontSize: 15, fontWeight: "bold", flex: 1, marginRight: 10 },
  projectCardDate: { fontSize: 11 },
  projectCardMeta: { gap: 2 },
  projectCardMetaText: { fontSize: 12 },
  projectDeleteBtn: { width: 50, justifyContent: "center", alignItems: "center", borderLeftWidth: 1 },
  emptyContainer: { paddingVertical: 30, alignItems: "center" },
  emptyText: { fontSize: 14 },
  exportAllBtn: { marginTop: 10, padding: 15, borderRadius: 14, borderStyle: "dashed", borderWidth: 1, alignItems: "center" },
  exportAllBtnText: { fontSize: 14, fontWeight: "600" },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", alignItems: "center", padding: 20 },
  modalContent: { width: "100%", maxWidth: 340, borderRadius: 20, padding: 24 },
  modalTitle: { fontSize: 18, fontWeight: "bold", marginBottom: 16, textAlign: "center" },
  modalDesc: { fontSize: 14, textAlign: "center", marginBottom: 24, lineHeight: 20 },
  modalInput: { height: 50, borderWidth: 1, borderRadius: 10, paddingHorizontal: 15, marginBottom: 20, fontSize: 16 },
  modalButtons: { flexDirection: "row", gap: 10 },
  modalBtn: { flex: 1, height: 46, borderRadius: 10, justifyContent: "center", alignItems: "center" },
  modalBtnPrimary: { shadowOpacity: 0.1, shadowRadius: 4, elevation: 2 },
});
