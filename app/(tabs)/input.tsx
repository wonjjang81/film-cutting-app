import React, { useState, useCallback, useRef } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";

import { ScreenContainer } from "@/components/screen-container";
import { ClearableTextInput } from "@/components/clearable-text-input";
import { useColors } from "@/hooks/use-colors";
import { useFilm } from "@/lib/filmContext";

// 웹과 네이티브 환경 모두에서 동작하는 확인 알림
function confirmAlert(title: string, message: string, onConfirm: () => void, confirmText = "확인") {
  if (Platform.OS === "web") {
    if (typeof window !== "undefined" && window.confirm(`${title}\n\n${message}`)) {
      onConfirm();
    }
  } else {
    Alert.alert(title, message, [
      { text: "취소", style: "cancel" },
      { text: confirmText, style: "destructive", onPress: onConfirm },
    ]);
  }
}
import {
  DEFAULT_MATERIAL_COST_PER_M,
  FILM_BRANDS,
  FILM_WIDTH,
  FilmBrand,
  FilmGroup,
  FilmPiece,
  GROUP_BORDER_COLORS,
  GROUP_COLORS,
  calculateFromGroups,
  formatNumber,
} from "@/lib/filmCutting";

// ─── 브랜드 선택 ─────────────────────────────────────────────

function BrandSelector({ selected, onSelect, colors, groupIndex }: {
  selected: FilmBrand;
  onSelect: (b: FilmBrand) => void;
  colors: ReturnType<typeof useColors>;
  groupIndex: number;
}) {
  const bc = GROUP_BORDER_COLORS[groupIndex % GROUP_BORDER_COLORS.length];
  return (
    <View style={styles.brandRow}>
      {FILM_BRANDS.map((brand) => {
        const isSelected = selected === brand;
        return (
          <TouchableOpacity
            key={brand}
            style={[styles.brandBtn, { backgroundColor: isSelected ? bc : colors.background, borderColor: isSelected ? bc : colors.border }]}
            onPress={() => onSelect(brand)}
          >
            <Text style={[styles.brandBtnText, { color: isSelected ? "white" : colors.muted }]}>{brand}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

// ─── 조각 행 ─────────────────────────────────────────────────

/** 반응형 컬럼 크기 */
interface ColSizes {
  idW: number;
  qtyW: number;
  delW: number;
  inputH: number;
  fontSize: number;
}

interface PieceRowProps {
  piece: FilmPiece;
  onUpdate: (field: "width" | "height" | "quantity", value: number) => void;
  onDelete: () => void;
  onRenameId: (newId: string) => void;
  colors: ReturnType<typeof useColors>;
  focusBorderColor: string;
  /** 이 조각의 수량 필드에서 다음 조각(또는 다음 그룹)으로 포커스를 이동하는 콜백 */
  onQuantitySubmit?: () => void;
  colSizes: ColSizes;
}

// forwardRef를 사용하여 부모(GroupCard)에서 첫 번째 조각의 가로 입력 필드에 직접 포커스를 부여할 수 있도록 합니다.
const PieceRow = React.memo(React.forwardRef<TextInput, PieceRowProps>(({ piece, onUpdate, onDelete, onRenameId, colors, focusBorderColor, onQuantitySubmit, colSizes }, forwardedRef) => {
  const [wText, setWText] = useState(piece.width > 0 ? String(piece.width) : "");
  const [hText, setHText] = useState(piece.height > 0 ? String(piece.height) : "");
  const [qText, setQText] = useState(String(piece.quantity));
  const [idText, setIdText] = useState(piece.id);
  const [editingId, setEditingId] = useState(false);

  // forwardedRef가 있으면 widthRef를 외부에 노출 (그룹 간 포커스 이동에 사용)
  const internalWidthRef = useRef<TextInput>(null);
  const widthRef = (forwardedRef as React.RefObject<TextInput> | null) ?? internalWidthRef;
  const heightRef = useRef<TextInput>(null);
  const quantityRef = useRef<TextInput>(null);

  const handleBlur = (field: "width" | "height" | "quantity", text: string) => {
    const num = parseFloat(text) || 0;
    if (field === "width" && num > FILM_WIDTH) {
      Alert.alert("입력 오류", `가로는 최대 ${FILM_WIDTH}mm를 초과할 수 없습니다.`);
      setWText(piece.width > 0 ? String(piece.width) : "");
      return;
    }
    onUpdate(field, num);
  };

  const focusNext = useCallback((field: string) => {
    if (field === "width") heightRef.current?.focus();
    else if (field === "height") quantityRef.current?.focus();
    else if (field === "quantity") {
      // 수량 필드에서 엔터 → 다음 조각 또는 다음 그룹의 첫 번째 필드로 이동
      onQuantitySubmit?.();
    }
  }, [onQuantitySubmit]);

  const dynInput = { height: colSizes.inputH, fontSize: colSizes.fontSize };

  return (
    <View style={[styles.pieceRow, { borderBottomColor: colors.border }]}>
      <View style={[styles.cellId, { width: colSizes.idW }]}>
        {editingId ? (
          <TextInput
            style={[styles.idInput, { color: colors.foreground, borderColor: focusBorderColor, backgroundColor: colors.background, width: colSizes.idW - 4, fontSize: colSizes.fontSize }]}
            value={idText}
            onChangeText={setIdText}
            autoFocus
            selectTextOnFocus
            returnKeyType="done"
            maxLength={20}
            onBlur={() => {
              setEditingId(false);
              const trimmed = idText.trim();
              if (trimmed && trimmed !== piece.id) onRenameId(trimmed);
              else setIdText(piece.id);
            }}
            onSubmitEditing={() => {
              setEditingId(false);
              const trimmed = idText.trim();
              if (trimmed && trimmed !== piece.id) onRenameId(trimmed);
              else setIdText(piece.id);
            }}
          />
        ) : (
          <TouchableOpacity onPress={() => { setIdText(piece.id); setEditingId(true); }} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
            <Text style={[styles.idText, { color: colors.primary, fontSize: colSizes.fontSize }]} numberOfLines={1}>{piece.id}</Text>
            <Text style={[styles.idEditHint, { color: colors.muted }]}>✏</Text>
          </TouchableOpacity>
        )}
      </View>
      {(["width", "height"] as const).map((field) => {
        const val = field === "width" ? wText : hText;
        const setter = field === "width" ? setWText : setHText;
        const ref = field === "width" ? widthRef : heightRef;
        return (
          <View key={field} style={styles.cellInput}>
            <ClearableTextInput
              ref={ref}
              style={[styles.input, dynInput, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background }]}
              value={val}
              onChangeText={setter}
              onBlur={() => handleBlur(field, val)}
              onSubmitEditing={() => {
                handleBlur(field, val);
                focusNext(field);
              }}
              keyboardType="numeric" placeholder="0" placeholderTextColor={colors.muted} returnKeyType="next"
              showClearButton={true}
              clearButtonColor={colors.muted}
              focusBorderColor={focusBorderColor}
            />
          </View>
        );
      })}
      <View style={[styles.cellQty, { width: colSizes.qtyW }]}>
        <ClearableTextInput
          ref={quantityRef}
          style={[styles.input, dynInput, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background }]}
          value={qText}
          onChangeText={setQText}
          onBlur={() => handleBlur("quantity", qText)}
          onSubmitEditing={() => {
            handleBlur("quantity", qText);
            focusNext("quantity");
          }}
          keyboardType="numeric" placeholder="1" placeholderTextColor={colors.muted} returnKeyType="next"
          showClearButton={true}
          clearButtonColor={colors.muted}
          focusBorderColor={focusBorderColor}
        />
      </View>
      <TouchableOpacity style={[styles.cellDelete, { width: colSizes.delW }]} onPress={onDelete} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
        <Text style={{ color: colors.error, fontSize: Math.max(12, colSizes.fontSize) }}>✕</Text>
      </TouchableOpacity>
    </View>
  );
}));

PieceRow.displayName = 'PieceRow';

// ─── 그룹 카드 ───────────────────────────────────────────────

interface GroupCardProps {
  group: FilmGroup;
  groupIndex: number;
  colors: ReturnType<typeof useColors>;
  onRenamePress: () => void;
  onDeleteGroup: () => void;
  onAddPiece: () => void;
  onUpdatePiece: (pieceId: string, field: "width" | "height" | "quantity", value: number) => void;
  onDeletePiece: (pieceId: string) => void;
  onRenamePiece: (pieceId: string, newId: string) => void;
  onBrandChange: (brand: FilmBrand) => void;
  onFilmNameChange: (name: string) => void;
  onMaterialCostChange: (cost: number | undefined) => void;
  onPatternFixedChange: (patternFixed: boolean) => void;
  /** 이 그룹의 마지막 조각 수량 입력 완료 시 다음 그룹 첫 번째 필드로 포커스 이동하는 콜백 */
  onLastPieceQuantitySubmit?: () => void;
  /** 이 그룹의 첫 번째 조각 가로 입력 필드에 포커스를 부여하는 ref 등록 콜백 */
  registerFirstFieldRef?: (ref: TextInput | null) => void;
  colSizes: ColSizes;
}

function GroupCard({
  group, groupIndex, colors, onRenamePress, onDeleteGroup, onAddPiece,
  onUpdatePiece, onDeletePiece, onRenamePiece, onBrandChange, onFilmNameChange,
  onMaterialCostChange, onPatternFixedChange, onLastPieceQuantitySubmit, registerFirstFieldRef, colSizes,
}: GroupCardProps) {
  const [filmNameText, setFilmNameText] = useState(group.filmName);
  const [costText, setCostText] = useState(group.materialCostPerM ? String(group.materialCostPerM) : "");
  const [useCustomCost, setUseCustomCost] = useState(group.materialCostPerM !== undefined);
  const bgColor = GROUP_COLORS[groupIndex % GROUP_COLORS.length];
  const borderColor = GROUP_BORDER_COLORS[groupIndex % GROUP_BORDER_COLORS.length];

  // 각 조각의 첫 번째 필드(가로) ref를 보관하는 배열
  const pieceFirstFieldRefs = useRef<(TextInput | null)[]>([]);

  // 조각 수량 필드 submit 핸들러: 다음 조각의 가로 필드로 이동, 마지막이면 그룹 간 이동
  const handlePieceQuantitySubmit = useCallback((pieceIndex: number) => {
    const nextRef = pieceFirstFieldRefs.current[pieceIndex + 1];
    if (nextRef) {
      nextRef.focus();
    } else {
      // 이 그룹의 마지막 조각 → 다음 그룹으로 이동
      onLastPieceQuantitySubmit?.();
    }
  }, [onLastPieceQuantitySubmit]);

  return (
    <View style={[styles.groupCard, { backgroundColor: colors.surface, borderColor }]}>
      <View style={[styles.groupHeader, { backgroundColor: bgColor, borderBottomColor: borderColor + "60" }]}>
        <TouchableOpacity onPress={onRenamePress} style={styles.groupNameBtn}>
          <Text style={[styles.groupName, { color: borderColor }]}>{group.groupName}</Text>
          <Text style={[styles.groupNameHint, { color: borderColor + "80" }]}> ✏</Text>
        </TouchableOpacity>
        <Text style={[styles.groupPieceCount, { color: colors.muted }]}>{group.pieces.length}개</Text>
        <TouchableOpacity onPress={onDeleteGroup} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={{ color: colors.error, fontSize: 14, fontWeight: "600" }}>삭제</Text>
        </TouchableOpacity>
      </View>

      <View style={[styles.materialSection, { borderBottomColor: colors.border }]}>
        <View style={styles.materialRow}>
          <Text style={[styles.materialLabel, { color: colors.muted }]}>브랜드</Text>
          <BrandSelector selected={group.brand} onSelect={onBrandChange} colors={colors} groupIndex={groupIndex} />
        </View>
        <View style={styles.materialRow}>
          <Text style={[styles.materialLabel, { color: colors.muted }]}>필름명</Text>
          <ClearableTextInput
            style={[styles.filmNameInput, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background }]}
            value={filmNameText}
            onChangeText={setFilmNameText}
            onBlur={() => onFilmNameChange(filmNameText)}
            placeholder="예: 우드 오크, 화이트 무광..." placeholderTextColor={colors.muted} returnKeyType="done"
            showClearButton={true}
            clearButtonColor={colors.muted}
            focusBorderColor={borderColor}
          />
        </View>
        <View style={styles.materialRow}>
          <Text style={[styles.materialLabel, { color: colors.muted }]}>단가</Text>
          <View style={styles.costRow}>
            <TouchableOpacity
              style={[styles.costToggle, { backgroundColor: useCustomCost ? borderColor : colors.background, borderColor: useCustomCost ? borderColor : colors.border }]}
              onPress={() => {
                const next = !useCustomCost;
                setUseCustomCost(next);
                if (!next) {
                  setCostText("");
                  onMaterialCostChange(undefined);
                }
              }}
            >
              <Text style={[styles.costToggleText, { color: useCustomCost ? "white" : colors.muted }]}>
                {useCustomCost ? "개별" : "기본"}
              </Text>
            </TouchableOpacity>
            {useCustomCost ? (
              <View style={styles.costInputWrapper}>
                <ClearableTextInput
                  style={[styles.costInput, { color: colors.foreground, borderColor: borderColor, backgroundColor: colors.background }]}
                  value={costText}
                  onChangeText={setCostText}
                  onBlur={() => {
                    const num = parseFloat(costText) || 0;
                    if (num > 0) {
                      onMaterialCostChange(num);
                    } else {
                      setCostText("");
                      setUseCustomCost(false);
                      onMaterialCostChange(undefined);
                    }
                  }}
                  keyboardType="numeric"
                  placeholder={String(DEFAULT_MATERIAL_COST_PER_M)}
                  placeholderTextColor={colors.muted}
                  returnKeyType="done"
                  showClearButton={true}
                  clearButtonColor={colors.muted}
                  focusBorderColor={borderColor}
                />
                <Text style={[styles.costUnit, { color: colors.muted }]}>원/m</Text>
              </View>
            ) : (
              <Text style={[styles.costDefaultText, { color: colors.muted }]}>
                {formatNumber(DEFAULT_MATERIAL_COST_PER_M)}원/m (전역 기본값)
              </Text>
            )}
          </View>
        </View>

        {/* 무늬 고정 체크버튼 */}
        <TouchableOpacity
          style={styles.patternFixedRow}
          onPress={() => onPatternFixedChange(!group.patternFixed)}
          activeOpacity={0.7}
        >
          <View style={[
            styles.patternFixedCheckbox,
            {
              backgroundColor: group.patternFixed ? borderColor : colors.background,
              borderColor: group.patternFixed ? borderColor : colors.border,
            }
          ]}>
            {group.patternFixed && (
              <Text style={styles.patternFixedCheckmark}>✓</Text>
            )}
          </View>
          <Text style={[styles.patternFixedLabel, { color: group.patternFixed ? borderColor : colors.muted }]}>
            무늬 고정 (방향 고정 배치)
          </Text>
          <Text style={[styles.patternFixedDesc, { color: colors.muted }]}>
            {group.patternFixed ? '• 회전 금지' : '• 회전 허용'}
          </Text>
        </TouchableOpacity>
      </View>

      <View style={[styles.tableHeader, { borderBottomColor: colors.border }]}>
        <Text style={[styles.thId, { color: colors.muted, width: colSizes.idW }]} numberOfLines={1}>ID</Text>
        <Text style={[styles.thInput, { color: colors.muted, fontSize: colSizes.fontSize }]} numberOfLines={1}>{colSizes.fontSize < 12 ? '가로' : '가로(mm)'}</Text>
        <Text style={[styles.thInput, { color: colors.muted, fontSize: colSizes.fontSize }]} numberOfLines={1}>{colSizes.fontSize < 12 ? '세로' : '세로(mm)'}</Text>
        <Text style={[styles.thQty, { color: colors.muted, width: colSizes.qtyW, fontSize: colSizes.fontSize }]} numberOfLines={1}>수량</Text>
        <View style={[styles.cellDelete, { width: colSizes.delW }]} />
      </View>

      {group.pieces.map((piece, pieceIndex) => (
        <PieceRow
          key={piece.id}
          ref={(r) => {
            // 첫 번째 조각의 widthRef를 pieceFirstFieldRefs에 등록
            // 또한 pieceIndex === 0이면 그룹의 첫 번째 필드로서 registerFirstFieldRef에도 등록
            pieceFirstFieldRefs.current[pieceIndex] = r;
            if (pieceIndex === 0) registerFirstFieldRef?.(r);
          }}
          piece={piece}
          colors={colors}
          focusBorderColor={borderColor}
          onUpdate={(field, value) => onUpdatePiece(piece.id, field, value)}
          onDelete={() => onDeletePiece(piece.id)}
          onRenameId={(newId) => onRenamePiece(piece.id, newId)}
          onQuantitySubmit={() => handlePieceQuantitySubmit(pieceIndex)}
          colSizes={colSizes}
        />
      ))}

      <TouchableOpacity style={[styles.addPieceBtn, { borderColor: borderColor + "60" }]} onPress={onAddPiece}>
        <Text style={[styles.addPieceBtnText, { color: borderColor }]}>+ 조각 추가</Text>
      </TouchableOpacity>
    </View>
  );
}

// ─── 입력 탭 화면 ─────────────────────────────────────────────

/** 화면 폭에 따른 반응형 컬럼 크기 계산
 * 테이블 구조: [ID | 가로 | 세로 | 수량 | 삭제]
 * - ID, 수량, 삭제는 고정 최소 폭 보장
 * - 가로/세로는 남은 공간을 flex:1로 균등 분배
 */
function calcColSizes(screenW: number): ColSizes {
  // 카드 패딩(12*2) + 테이블 패딩(6*2) = 36
  const usable = Math.max(screenW - 36, 200);

  // 화면 폭 기준 비례 계수 (320px 기준 1.0, 최대 1.3)
  const scale = Math.min(Math.max(usable / 360, 0.72), 1.3);

  const idW   = Math.round(Math.max(36, 48 * scale));
  const qtyW  = Math.round(Math.max(44, 60 * scale));
  const delW  = Math.round(Math.max(22, 28 * scale));
  const inputH = Math.round(Math.max(32, 40 * scale));
  const fontSize = Math.round(Math.max(10, 13 * scale));

  return { idW, qtyW, delW, inputH, fontSize };
}

export default function InputScreen() {
  const colors = useColors();
  const { state, dispatch } = useFilm();
  const [renameModalVisible, setRenameModalVisible] = useState(false);
  const [renameTarget, setRenameTarget] = useState<{ groupId: string; groupName: string } | null>(null);
  const [renameText, setRenameText] = useState("");
  const [isCalculating, setIsCalculating] = useState(false);

  // 화면 폭 감지 → 반응형 컬럼 크기 계산
  const { width: screenW } = useWindowDimensions();
  const colSizes = calcColSizes(screenW);

  // 각 그룹의 첫 번째 조각 가로 필드 ref를 보관 (그룹 간 포커스 이동에 사용)
  const groupFirstFieldRefs = useRef<(TextInput | null)[]>([]);

  const handleAddGroup = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    dispatch({ type: "ADD_GROUP" });
  }, [dispatch]);

  const handleReset = useCallback(() => {
    if (state.groups.length === 0) {
      if (Platform.OS === "web") {
        if (typeof window !== "undefined") window.alert("초기화할 데이터가 없습니다.");
      } else {
        Alert.alert("알림", "초기화할 데이터가 없습니다.");
      }
      return;
    }
    confirmAlert(
      "입력 초기화",
      "모든 그룹과 조각 데이터가 삭제됩니다. 계속하시겠습니까?",
      () => {
        if (Platform.OS !== "web") {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        }
        dispatch({ type: "RESET_GROUPS" });
      },
      "초기화",
    );
  }, [state.groups, dispatch]);

  const handleDeleteGroup = useCallback((groupId: string) => {
    confirmAlert(
      "그룹 삭제",
      "이 그룹의 모든 조각이 삭제됩니다. 계속하시겠습니까?",
      () => dispatch({ type: "DELETE_GROUP", payload: groupId }),
      "삭제",
    );
  }, [dispatch]);

  const handleRenameConfirm = useCallback(() => {
    if (!renameTarget || !renameText.trim()) return;
    dispatch({ type: "UPDATE_GROUP", payload: { groupId: renameTarget.groupId, groupName: renameText.trim() } });
    setRenameModalVisible(false);
  }, [dispatch, renameTarget, renameText]);

  const handleCalculate = useCallback(async () => {
    const validGroups = state.groups
      .map((g) => ({ ...g, pieces: g.pieces.filter((p) => p.width > 0 && p.height > 0 && p.quantity > 0) }))
      .filter((g) => g.pieces.length > 0);

    if (validGroups.length === 0) {
      Alert.alert("입력 오류", "유효한 조각 데이터를 하나 이상 입력해 주세요.");
      return;
    }

    setIsCalculating(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      // 이전 배치 결과를 먼저 완전히 제거하여 React가 변경을 정확히 감지하도록 함
      dispatch({ type: "CLEAR_RESULTS" });
      const result = calculateFromGroups(validGroups, state.materialCostPerM, state.constructionPricePerM2);
      dispatch({ type: "SET_RESULT", payload: result });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.push("/(tabs)/cutting" as any);
    } catch {
      Alert.alert("계산 오류", "배치 계산 중 오류가 발생했습니다.");
    } finally {
      setIsCalculating(false);
    }
  }, [state, dispatch]);

  const hasValidPieces = state.groups.some((g) =>
    g.pieces.some((p) => p.width > 0 && p.height > 0 && p.quantity > 0),
  );

  return (
    <ScreenContainer containerClassName="bg-background">
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"} keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 20}>
        <View style={[styles.header, { backgroundColor: colors.primary }]}>
          <View style={styles.headerLeft}>
            <Text style={styles.headerTitle}>조각 입력</Text>
            <Text style={[styles.headerSub, { color: "rgba(255,255,255,0.75)" }]}>
              {state.projectName}  ·  필름 너비 {FILM_WIDTH}mm
            </Text>
          </View>
          <TouchableOpacity
            style={styles.resetBtn}
            onPress={handleReset}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={styles.resetBtnIcon}>🗑</Text>
            <Text style={styles.resetBtnText}>초기화</Text>
          </TouchableOpacity>
        </View>

        {state.groups.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyIcon}>✏️</Text>
            <Text style={[styles.emptyTitle, { color: colors.foreground }]}>그룹을 추가해 주세요</Text>
            <Text style={[styles.emptyDesc, { color: colors.muted }]}>그룹별로 브랜드, 필름명, 조각 치수를 입력합니다</Text>
            <TouchableOpacity style={[styles.emptyAddBtn, { backgroundColor: colors.primary }]} onPress={handleAddGroup}>
              <Text style={styles.emptyAddBtnText}>+ 첫 번째 그룹 추가하기</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <FlatList
            data={state.groups}
            keyExtractor={(item) => item.groupId}
            contentContainerStyle={styles.listContent}
            renderItem={({ item: group, index }) => (
              <GroupCard
                group={group} groupIndex={index} colors={colors}
                onRenamePress={() => { setRenameTarget({ groupId: group.groupId, groupName: group.groupName }); setRenameText(group.groupName); setRenameModalVisible(true); }}
                onDeleteGroup={() => handleDeleteGroup(group.groupId)}
                onAddPiece={() => dispatch({ type: "ADD_PIECE", payload: { groupId: group.groupId } })}
                onUpdatePiece={(pieceId, field, value) => dispatch({ type: "UPDATE_PIECE", payload: { groupId: group.groupId, pieceId, field, value } })}
                onDeletePiece={(pieceId) => dispatch({ type: "DELETE_PIECE", payload: { groupId: group.groupId, pieceId } })}
                onRenamePiece={(pieceId, newId) => dispatch({ type: "RENAME_PIECE", payload: { groupId: group.groupId, pieceId, newId } })}
                onBrandChange={(brand) => dispatch({ type: "UPDATE_GROUP_BRAND", payload: { groupId: group.groupId, brand } })}
                onFilmNameChange={(filmName) => dispatch({ type: "UPDATE_GROUP_FILM_NAME", payload: { groupId: group.groupId, filmName } })}
                onMaterialCostChange={(cost) => dispatch({ type: "UPDATE_GROUP_MATERIAL_COST", payload: { groupId: group.groupId, materialCostPerM: cost } })}
                onPatternFixedChange={(patternFixed) => dispatch({ type: "UPDATE_GROUP_PATTERN_FIXED", payload: { groupId: group.groupId, patternFixed } })}
                onLastPieceQuantitySubmit={() => {
                  // 다음 그룹의 첫 번째 필드로 포커스 이동
                  const nextRef = groupFirstFieldRefs.current[index + 1];
                  if (nextRef) {
                    nextRef.focus();
                  }
                }}
                registerFirstFieldRef={(ref) => {
                  groupFirstFieldRefs.current[index] = ref;
                }}
                colSizes={colSizes}
              />
            )}
            ListFooterComponent={
              <TouchableOpacity style={[styles.addGroupBtn, { borderColor: colors.primary }]} onPress={handleAddGroup}>
                <Text style={[styles.addGroupBtnText, { color: colors.primary }]}>+ 새 그룹 추가</Text>
              </TouchableOpacity>
            }
          />
        )}

        {state.groups.length > 0 && (
          <View style={[styles.bottomBar, { backgroundColor: colors.background, borderTopColor: colors.border }]}>
            <TouchableOpacity
              style={[styles.calcBtn, { backgroundColor: hasValidPieces ? colors.primary : colors.muted }]}
              onPress={handleCalculate} disabled={!hasValidPieces || isCalculating}
            >
              {isCalculating ? <ActivityIndicator color="white" /> : <Text style={styles.calcBtnText}>✂️  배치 계산하기</Text>}
            </TouchableOpacity>
          </View>
        )}
      </KeyboardAvoidingView>

      <Modal visible={renameModalVisible} transparent animationType="fade" onRequestClose={() => setRenameModalVisible(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setRenameModalVisible(false)}>
          <Pressable style={[styles.modalBox, { backgroundColor: colors.background }]}>
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>그룹명 수정</Text>
            <TextInput
              style={[styles.modalInput, { color: colors.foreground, borderColor: colors.primary, backgroundColor: colors.surface }]}
              value={renameText} onChangeText={setRenameText} autoFocus returnKeyType="done"
              onSubmitEditing={handleRenameConfirm} maxLength={20}
            />
            <View style={styles.modalBtns}>
              <TouchableOpacity style={[styles.modalCancelBtn, { borderColor: colors.border }]} onPress={() => setRenameModalVisible(false)}>
                <Text style={[styles.modalCancelText, { color: colors.muted }]}>취소</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalConfirmBtn, { backgroundColor: colors.primary }]} onPress={handleRenameConfirm}>
                <Text style={styles.modalConfirmText}>확인</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: 16, paddingVertical: 14, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  headerLeft: { flex: 1 },
  headerTitle: { fontSize: 18, fontWeight: "700", color: "white" },
  headerSub: { fontSize: 12, marginTop: 2 },
  resetBtn: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: "rgba(255,255,255,0.15)", paddingHorizontal: 13, paddingVertical: 8, borderRadius: 20, marginLeft: 12, borderWidth: 1, borderColor: "rgba(255,255,255,0.35)" },
  resetBtnIcon: { fontSize: 14 },
  resetBtnText: { color: "rgba(255,255,255,0.95)", fontSize: 13, fontWeight: "600" },
  emptyContainer: { flex: 1, justifyContent: "center", alignItems: "center", paddingHorizontal: 32 },
  emptyIcon: { fontSize: 48, marginBottom: 14 },
  emptyTitle: { fontSize: 17, fontWeight: "600", marginBottom: 8, textAlign: "center" },
  emptyDesc: { fontSize: 13, textAlign: "center", lineHeight: 20, marginBottom: 24 },
  emptyAddBtn: { paddingHorizontal: 22, paddingVertical: 13, borderRadius: 12 },
  emptyAddBtnText: { color: "white", fontSize: 15, fontWeight: "600" },
  listContent: { padding: 12, gap: 12, paddingBottom: 16 },
  groupCard: { borderRadius: 12, borderWidth: 1.5, overflow: "hidden" },
  groupHeader: { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1 },
  groupNameBtn: { flexDirection: "row", alignItems: "center", flex: 1 },
  groupName: { fontSize: 15, fontWeight: "700" },
  groupNameHint: { fontSize: 12 },
  groupPieceCount: { fontSize: 12, marginRight: 12 },
  materialSection: { paddingHorizontal: 12, paddingVertical: 10, gap: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  materialRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  materialLabel: { fontSize: 12, fontWeight: "600", width: 40 },
  brandRow: { flex: 1, flexDirection: "row", gap: 6 },
  brandBtn: { flex: 1, paddingVertical: 5, borderRadius: 6, borderWidth: 1, alignItems: "center" },
  brandBtnText: { fontSize: 12, fontWeight: "600" },
  filmNameInput: { flex: 1, borderWidth: 1.5, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, fontSize: 13, fontWeight: "500" },
  costRow: { flex: 1, flexDirection: "row", alignItems: "center", gap: 8 },
  costToggle: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 6, borderWidth: 1 },
  costToggleText: { fontSize: 11, fontWeight: "700" },
  costInputWrapper: { flex: 1, flexDirection: "row", alignItems: "center", gap: 4 },
  costInput: { flex: 1, borderWidth: 1.5, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, fontSize: 14, textAlign: "right", fontWeight: "500" },
  costUnit: { fontSize: 11, fontWeight: "500" },
  costDefaultText: { fontSize: 12 },
  tableHeader: { flexDirection: "row", alignItems: "center", paddingHorizontal: 6, paddingVertical: 7, borderBottomWidth: 1 },
  thId: { width: 48, fontSize: 11, fontWeight: "600", textAlign: "center" },
  thInput: { flex: 1, fontSize: 11, fontWeight: "600", textAlign: "center", overflow: "hidden" },
  thQty: { width: 60, fontSize: 11, fontWeight: "600", textAlign: "center" },
  pieceRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 6, paddingVertical: 4, borderBottomWidth: StyleSheet.hairlineWidth },
  cellId: { width: 48, alignItems: "center", flexShrink: 0 },
  idText: { fontSize: 11, fontWeight: "600", textDecorationLine: "underline" },
  idEditHint: { fontSize: 8, textAlign: "center", marginTop: 1 },
  idInput: { fontSize: 11, borderWidth: 1.5, borderRadius: 6, paddingHorizontal: 4, paddingVertical: 4, width: 44, textAlign: "center", fontWeight: "500" },
  cellInput: { flex: 1, paddingHorizontal: 2, minWidth: 0, flexShrink: 1 },
  cellQty: { width: 60, paddingHorizontal: 2, flexShrink: 0 },
  cellDelete: { width: 28, alignItems: "center", flexShrink: 0 },
  input: { borderWidth: 1.5, borderRadius: 8, paddingHorizontal: 6, paddingVertical: 6, fontSize: 13, textAlign: "center", height: 40, fontWeight: "500", minWidth: 0 },
  addPieceBtn: { margin: 10, paddingVertical: 9, borderRadius: 8, borderWidth: 1, borderStyle: "dashed", alignItems: "center" },
  addPieceBtnText: { fontSize: 13, fontWeight: "600" },
  addGroupBtn: { marginHorizontal: 12, marginVertical: 8, paddingVertical: 13, borderRadius: 10, borderWidth: 1.5, alignItems: "center" },
  addGroupBtnText: { fontSize: 15, fontWeight: "600" },
  bottomBar: { paddingHorizontal: 16, paddingVertical: 12, borderTopWidth: StyleSheet.hairlineWidth },
  calcBtn: { paddingVertical: 15, borderRadius: 12, alignItems: "center" },
  calcBtnText: { color: "white", fontSize: 16, fontWeight: "700" },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "center", alignItems: "center" },
  modalBox: { width: "80%", borderRadius: 16, padding: 24, elevation: 8, shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8 },
  modalTitle: { fontSize: 17, fontWeight: "700", marginBottom: 16, textAlign: "center" },
  modalInput: { borderWidth: 1.5, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16, marginBottom: 20 },
  modalBtns: { flexDirection: "row", gap: 10 },
  modalCancelBtn: { flex: 1, paddingVertical: 12, borderRadius: 8, borderWidth: 1, alignItems: "center" },
  modalCancelText: { fontSize: 15, fontWeight: "500" },
  modalConfirmBtn: { flex: 1, paddingVertical: 12, borderRadius: 8, alignItems: "center" },
  modalConfirmText: { color: "white", fontSize: 15, fontWeight: "700" },
  patternFixedRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingVertical: 9, gap: 8 },
  patternFixedCheckbox: { width: 20, height: 20, borderRadius: 5, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
  patternFixedCheckmark: { color: "white", fontSize: 13, fontWeight: "700", lineHeight: 16 },
  patternFixedLabel: { fontSize: 13, fontWeight: "600" },
  patternFixedDesc: { fontSize: 11, marginLeft: 4 },
});
