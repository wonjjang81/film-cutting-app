import React, { useState, useCallback, useRef, useEffect } from "react";
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
import { useAuth } from "@/app/contexts/AuthContext";
import LoginScreen from "./login";

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

function BrandSelector({ selected, onSelect, colors, groupIndex, disabled }: {
  selected: FilmBrand;
  onSelect: (b: FilmBrand) => void;
  colors: ReturnType<typeof useColors>;
  groupIndex: number;
  disabled?: boolean;
}) {
  const bc = GROUP_BORDER_COLORS[groupIndex % GROUP_BORDER_COLORS.length];
  return (
    <View style={styles.brandRow}>
      {FILM_BRANDS.map((brand) => {
        const isSelected = selected === brand;
        return (
          <TouchableOpacity
            key={brand}
            style={[styles.brandBtn, { backgroundColor: isSelected ? bc : colors.background, borderColor: isSelected ? bc : colors.border, opacity: disabled ? 0.5 : 1 }]}
            onPress={() => !disabled && onSelect(brand)}
            disabled={disabled}
          >
            <Text style={[styles.brandBtnText, { color: isSelected ? "white" : colors.muted }]}>{brand}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

// ─── 조각 행 ─────────────────────────────────────────────────

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
  onQuantitySubmit?: () => void;
  colSizes: ColSizes;
  disabled?: boolean;
}

const PieceRow = React.memo(React.forwardRef<TextInput, PieceRowProps>(({ piece, onUpdate, onDelete, onRenameId, colors, focusBorderColor, onQuantitySubmit, colSizes, disabled }, forwardedRef) => {
  const [wText, setWText] = useState(piece.width > 0 ? String(piece.width) : "");
  const [hText, setHText] = useState(piece.height > 0 ? String(piece.height) : "");
  const [qText, setQText] = useState(String(piece.quantity));
  const [idText, setIdText] = useState(piece.id);
  const [editingId, setEditingId] = useState(false);

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
      onQuantitySubmit?.();
    }
  }, [onQuantitySubmit]);

  const dynInput = { height: colSizes.inputH, fontSize: colSizes.fontSize };

  return (
    <View style={[styles.pieceRow, { borderBottomColor: colors.border }]}>
      <View style={[styles.cellId, { width: colSizes.idW }]}>
        {editingId && !disabled ? (
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
          <TouchableOpacity onPress={() => !disabled && (setIdText(piece.id), setEditingId(true))} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }} disabled={disabled}>
            <Text style={[styles.idText, { color: disabled ? colors.muted : colors.primary, fontSize: colSizes.fontSize }]} numberOfLines={1}>{piece.id}</Text>
            {!disabled && <Text style={[styles.idEditHint, { color: colors.muted }]}>✏</Text>}
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
              style={[styles.input, dynInput, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background, opacity: disabled ? 0.6 : 1 }]}
              value={val}
              onChangeText={setter}
              onBlur={() => handleBlur(field, val)}
              onSubmitEditing={() => {
                handleBlur(field, val);
                focusNext(field);
              }}
              keyboardType="numeric" placeholder="0" placeholderTextColor={colors.muted} returnKeyType="next"
              showClearButton={!disabled}
              clearButtonColor={colors.muted}
              focusBorderColor={focusBorderColor}
              editable={!disabled}
            />
          </View>
        );
      })}
      <View style={[styles.cellQty, { width: colSizes.qtyW }]}>
        <ClearableTextInput
          ref={quantityRef}
          style={[styles.input, dynInput, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background, opacity: disabled ? 0.6 : 1 }]}
          value={qText}
          onChangeText={setQText}
          onBlur={() => handleBlur("quantity", qText)}
          onSubmitEditing={() => {
            handleBlur("quantity", qText);
            focusNext("quantity");
          }}
          keyboardType="numeric" placeholder="1" placeholderTextColor={colors.muted} returnKeyType="next"
          showClearButton={!disabled}
          clearButtonColor={colors.muted}
          focusBorderColor={focusBorderColor}
          editable={!disabled}
        />
      </View>
      <TouchableOpacity style={[styles.cellDelete, { width: colSizes.delW }]} onPress={onDelete} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} disabled={disabled}>
        <Text style={{ color: disabled ? colors.muted : colors.error, fontSize: Math.max(12, colSizes.fontSize) }}>✕</Text>
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
  onMergeGroupIdChange: (mergeGroupId: string | undefined) => void;
  onLastPieceQuantitySubmit?: () => void;
  registerFirstFieldRef?: (ref: TextInput | null) => void;
  colSizes: ColSizes;
  disabled?: boolean;
}

const MERGE_OPTIONS = ['1', '2', '3', '4', '5'] as const;

function GroupCard({
  group, groupIndex, colors, onRenamePress, onDeleteGroup, onAddPiece,
  onUpdatePiece, onDeletePiece, onRenamePiece, onBrandChange, onFilmNameChange,
  onMaterialCostChange, onPatternFixedChange, onMergeGroupIdChange, onLastPieceQuantitySubmit, registerFirstFieldRef, colSizes, disabled
}: GroupCardProps) {
  const [filmNameText, setFilmNameText] = useState(group.filmName);
  const [costText, setCostText] = useState(group.materialCostPerM ? String(group.materialCostPerM) : "");
  const [useCustomCost, setUseCustomCost] = useState(group.materialCostPerM !== undefined);
  const bgColor = GROUP_COLORS[groupIndex % GROUP_COLORS.length];
  const borderColor = GROUP_BORDER_COLORS[groupIndex % GROUP_BORDER_COLORS.length];
  const hasMerge = !!group.mergeGroupId;

  const pieceFirstFieldRefs = useRef<(TextInput | null)[]>([]);

  const handlePieceQuantitySubmit = useCallback((pieceIndex: number) => {
    const nextRef = pieceFirstFieldRefs.current[pieceIndex + 1];
    if (nextRef) {
      nextRef.focus();
    } else {
      onLastPieceQuantitySubmit?.();
    }
  }, [onLastPieceQuantitySubmit]);

  return (
    <View style={[styles.groupCard, { backgroundColor: colors.surface, borderColor: hasMerge ? borderColor : colors.border, borderWidth: hasMerge ? 2 : 1.5, opacity: disabled ? 0.8 : 1 }]}>
      <View style={[styles.groupHeader, { backgroundColor: hasMerge ? bgColor : colors.surface, borderBottomColor: borderColor + "60" }]}>
        <TouchableOpacity onPress={onRenamePress} style={styles.groupNameBtn} disabled={disabled}>
          <Text style={[styles.groupName, { color: hasMerge ? borderColor : colors.foreground }]}>{group.groupName}</Text>
          {!disabled && <Text style={[styles.groupNameHint, { color: (hasMerge ? borderColor : colors.muted) + "80" }]}> ✏</Text>}
        </TouchableOpacity>
        {hasMerge && (
          <View style={[styles.mergeGroupBadge, { backgroundColor: borderColor }]}>
            <Text style={styles.mergeGroupBadgeText}>합치기 {group.mergeGroupId}</Text>
          </View>
        )}
        <Text style={[styles.groupPieceCount, { color: colors.muted }]}>{group.pieces.length}개</Text>
        <TouchableOpacity onPress={onDeleteGroup} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} disabled={disabled}>
          <Text style={{ color: disabled ? colors.muted : colors.error, fontSize: 14, fontWeight: "600" }}>삭제</Text>
        </TouchableOpacity>
      </View>

      <View style={[styles.materialSection, { borderBottomColor: colors.border }]}>
        <View style={styles.materialRow}>
          <Text style={[styles.materialLabel, { color: colors.muted }]}>브랜드</Text>
          <BrandSelector selected={group.brand} onSelect={onBrandChange} colors={colors} groupIndex={groupIndex} disabled={disabled} />
        </View>
        <View style={styles.materialRow}>
          <Text style={[styles.materialLabel, { color: colors.muted }]}>필름명</Text>
          <ClearableTextInput
            style={[styles.filmNameInput, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background }]}
            value={filmNameText}
            onChangeText={setFilmNameText}
            onBlur={() => onFilmNameChange(filmNameText)}
            placeholder="예: 우드 오크, 화이트 무광..." placeholderTextColor={colors.muted} returnKeyType="done"
            showClearButton={!disabled}
            clearButtonColor={colors.muted}
            focusBorderColor={borderColor}
            editable={!disabled}
          />
        </View>
        <View style={styles.materialRow}>
          <Text style={[styles.materialLabel, { color: colors.muted }]}>단가</Text>
          <View style={styles.costRow}>
            <TouchableOpacity
              style={[styles.costToggle, { backgroundColor: useCustomCost ? borderColor : colors.background, borderColor: useCustomCost ? borderColor : colors.border, opacity: disabled ? 0.5 : 1 }]}
              onPress={() => {
                if (disabled) return;
                const next = !useCustomCost;
                setUseCustomCost(next);
                if (!next) {
                  setCostText("");
                  onMaterialCostChange(undefined);
                }
              }}
              disabled={disabled}
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
                  keyboardType="numeric" placeholder="원/m" placeholderTextColor={colors.muted} returnKeyType="done"
                  showClearButton={!disabled}
                  clearButtonColor={colors.muted}
                  focusBorderColor={borderColor}
                  editable={!disabled}
                />
                <Text style={[styles.costUnit, { color: colors.muted }]}>원/m</Text>
              </View>
            ) : (
              <Text style={[styles.costDefaultText, { color: colors.muted }]}>{formatNumber(DEFAULT_MATERIAL_COST_PER_M)}원/m (설정값 적용)</Text>
            )}
          </View>
        </View>

        <View style={styles.patternFixedRow}>
          <TouchableOpacity
            style={[styles.patternFixedCheckbox, { borderColor: group.patternFixed ? borderColor : colors.border, backgroundColor: group.patternFixed ? borderColor : "transparent" }]}
            onPress={() => !disabled && onPatternFixedChange(!group.patternFixed)}
            disabled={disabled}
          >
            {group.patternFixed && <Text style={styles.patternFixedCheckmark}>✓</Text>}
          </TouchableOpacity>
          <Text style={[styles.patternFixedLabel, { color: colors.foreground }]}>무늬 고정</Text>
          <Text style={[styles.patternFixedDesc, { color: colors.muted }]}>가로/세로 회전 방지</Text>
        </View>

        <View style={styles.mergeGroupRow}>
          <Text style={[styles.materialLabel, { color: colors.muted }]}>합치기</Text>
          <View style={styles.mergeGroupBtns}>
            {MERGE_OPTIONS.map((opt) => {
              const isSelected = group.mergeGroupId === opt;
              return (
                <TouchableOpacity
                  key={opt}
                  style={[styles.mergeGroupBtn, { backgroundColor: isSelected ? borderColor : colors.background, borderColor: isSelected ? borderColor : colors.border, opacity: disabled ? 0.5 : 1 }]}
                  onPress={() => !disabled && onMergeGroupIdChange(isSelected ? undefined : opt)}
                  disabled={disabled}
                >
                  <Text style={[styles.mergeGroupBtnText, { color: isSelected ? "white" : colors.muted }]}>{opt}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <Text style={[styles.mergeGroupHint, { color: colors.muted }]}>같은 번호끼리 한 롤에 배치</Text>
        </View>
      </View>

      <View style={[styles.tableHeader, { borderBottomColor: colors.border, backgroundColor: colors.background + "50" }]}>
        <Text style={[styles.thId, { width: colSizes.idW, color: colors.muted }]}>ID</Text>
        <Text style={[styles.thInput, { color: colors.muted }]}>가로(mm)</Text>
        <Text style={[styles.thInput, { color: colors.muted }]}>세로(mm)</Text>
        <Text style={[styles.thQty, { width: colSizes.qtyW, color: colors.muted }]}>수량</Text>
        <View style={{ width: colSizes.delW }} />
      </View>

      {group.pieces.map((p, i) => (
        <PieceRow
          key={p.pieceId}
          ref={(ref) => { pieceFirstFieldRefs.current[i] = ref; if (i === 0) registerFirstFieldRef?.(ref); }}
          piece={p}
          onUpdate={(f, v) => onUpdatePiece(p.pieceId, f, v)}
          onDelete={() => onDeletePiece(p.pieceId)}
          onRenameId={(nid) => onRenamePiece(p.pieceId, nid)}
          colors={colors}
          focusBorderColor={borderColor}
          onQuantitySubmit={() => handlePieceQuantitySubmit(i)}
          colSizes={colSizes}
          disabled={disabled}
        />
      ))}

      <TouchableOpacity
        style={[styles.addPieceBtn, { borderColor: borderColor, opacity: disabled ? 0.5 : 1 }]}
        onPress={onAddPiece}
        disabled={disabled}
      >
        <Text style={[styles.addPieceBtnText, { color: borderColor }]}>+ 조각 추가</Text>
      </TouchableOpacity>
    </View>
  );
}

// ─── 입력 탭 메인 ─────────────────────────────────────────────

export default function InputScreen() {
  const { width } = useWindowDimensions();
  const colors = useColors();
  const { state, dispatch } = useFilm();
  const { isAdmin, guestSession, accessCodeValidated, isLoading: authLoading } = useAuth();
  
  const [isCalculating, setIsCalculating] = useState(false);
  const [renameModalVisible, setRenameModalVisible] = useState(false);
  const [renameText, setRenameText] = useState("");
  const [renameTarget, setRenameTarget] = useState<{ groupId: string; groupName: string } | null>(null);
  const [loginModalVisible, setLoginModalVisible] = useState(false);

  const isLoggedIn = isAdmin || guestSession !== null || accessCodeValidated;

  const groupFirstFieldRefs = useRef<(TextInput | null)[]>([]);

  useEffect(() => {
    if (isLoggedIn && loginModalVisible) {
      setLoginModalVisible(false);
    }
  }, [isLoggedIn]);

  const colSizes: ColSizes = {
    idW: width < 360 ? 40 : 50,
    qtyW: width < 360 ? 50 : 65,
    delW: 32,
    inputH: width < 360 ? 36 : 42,
    fontSize: width < 360 ? 12 : 14,
  };

  const handleAddGroup = useCallback(() => {
    if (!isLoggedIn) {
      setLoginModalVisible(true);
      return;
    }
    dispatch({ type: "ADD_GROUP" });
  }, [dispatch, isLoggedIn]);

  const handleReset = useCallback(() => {
    if (!isLoggedIn) return;
    if (state.groups.length === 0) return;
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
  }, [state.groups, dispatch, isLoggedIn]);

  const handleDeleteGroup = useCallback((groupId: string) => {
    if (!isLoggedIn) return;
    confirmAlert(
      "그룹 삭제",
      "이 그룹의 모든 조각이 삭제됩니다. 계속하시겠습니까?",
      () => dispatch({ type: "DELETE_GROUP", payload: groupId }),
      "삭제",
    );
  }, [dispatch, isLoggedIn]);

  const handleRenameConfirm = useCallback(() => {
    if (!renameTarget || !renameText.trim()) return;
    dispatch({ type: "UPDATE_GROUP", payload: { groupId: renameTarget.groupId, groupName: renameText.trim() } });
    setRenameModalVisible(false);
  }, [dispatch, renameTarget, renameText]);

  const handleCalculate = useCallback(async () => {
    if (!isLoggedIn) {
      setLoginModalVisible(true);
      return;
    }
    const hasValid = state.groups.some((g) =>
      g.pieces.some((p) => p.width > 0 && p.height > 0 && p.quantity > 0)
    );
    if (!hasValid) {
      if (Platform.OS === "web") {
        window.alert("유효한 조각 데이터를 하나 이상 입력해 주세요.");
      } else {
        Alert.alert("입력 오류", "유효한 조각 데이터를 하나 이상 입력해 주세요.");
      }
      return;
    }

    setIsCalculating(true);
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      dispatch({ type: "CLEAR_RESULTS" });
      const result = calculateFromGroups(state.groups, state.materialCostPerM, state.constructionPricePerM2);
      dispatch({ type: "SET_RESULT", payload: result });
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.push("/(tabs)/cutting" as any);
    } catch {
      if (Platform.OS === "web") {
        window.alert("배치 계산 중 오류가 발생했습니다.");
      } else {
        Alert.alert("계산 오류", "배치 계산 중 오류가 발생했습니다.");
      }
    } finally {
      setIsCalculating(false);
    }
  }, [state, dispatch, isLoggedIn]);

  const hasValidPieces = state.groups.some((g) =>
    g.pieces.some((p) => p.width > 0 && p.height > 0 && p.quantity > 0)
  );

  return (
    <ScreenContainer containerClassName="bg-background">
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"} keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 20}>
        <View style={[styles.header, { backgroundColor: colors.primary }]}>
          <View style={styles.headerLeft}>
            <Text style={styles.headerTitle}>조각 입력</Text>
            <Text style={[styles.headerSub, { color: "rgba(255,255,255,0.75)" }]}>
              {state.projectName}  ·  너비 {FILM_WIDTH}mm
            </Text>
          </View>
          
          <View style={styles.headerRight}>
            {!isLoggedIn ? (
              <TouchableOpacity
                style={styles.loginHeaderBtn}
                onPress={() => setLoginModalVisible(true)}
              >
                <Text style={styles.loginHeaderBtnText}>로그인</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={styles.resetBtn}
                onPress={handleReset}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Text style={styles.resetBtnIcon}>🗑</Text>
                <Text style={styles.resetBtnText}>초기화</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {!isLoggedIn && (
          <View style={styles.loginRequiredBanner}>
            <Text style={styles.loginRequiredText}>로그인 후 데이터를 입력하고 계산할 수 있습니다.</Text>
          </View>
        )}

        {state.groups.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyIcon}>✏️</Text>
            <Text style={[styles.emptyTitle, { color: colors.foreground }]}>그룹을 추가해 주세요</Text>
            <Text style={[styles.emptyDesc, { color: colors.muted }]}>그룹별로 브랜드, 필름명, 조각 치수를 입력합니다</Text>
            <TouchableOpacity 
              style={[styles.emptyAddBtn, { backgroundColor: colors.primary }]} 
              onPress={handleAddGroup}
            >
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
                onRenamePress={() => { if(!isLoggedIn) return; setRenameTarget({ groupId: group.groupId, groupName: group.groupName }); setRenameText(group.groupName); setRenameModalVisible(true); }}
                onDeleteGroup={() => handleDeleteGroup(group.groupId)}
                onAddPiece={() => dispatch({ type: "ADD_PIECE", payload: { groupId: group.groupId } })}
                onUpdatePiece={(pieceId, field, value) => dispatch({ type: "UPDATE_PIECE", payload: { groupId: group.groupId, pieceId, field, value } })}
                onDeletePiece={(pieceId) => dispatch({ type: "DELETE_PIECE", payload: { groupId: group.groupId, pieceId } })}
                onRenamePiece={(pieceId, newId) => dispatch({ type: "RENAME_PIECE", payload: { groupId: group.groupId, pieceId, newId } })}
                onBrandChange={(brand) => dispatch({ type: "UPDATE_GROUP_BRAND", payload: { groupId: group.groupId, brand } })}
                onFilmNameChange={(filmName) => dispatch({ type: "UPDATE_GROUP_FILM_NAME", payload: { groupId: group.groupId, filmName } })}
                onMaterialCostChange={(cost) => dispatch({ type: "UPDATE_GROUP_MATERIAL_COST", payload: { groupId: group.groupId, materialCostPerM: cost } })}
                onPatternFixedChange={(patternFixed) => dispatch({ type: "UPDATE_GROUP_PATTERN_FIXED", payload: { groupId: group.groupId, patternFixed } })}
                onMergeGroupIdChange={(mergeGroupId) => dispatch({ type: "UPDATE_GROUP_MERGE_ID", payload: { groupId: group.groupId, mergeGroupId } })}
                onLastPieceQuantitySubmit={() => {
                  const nextRef = groupFirstFieldRefs.current[index + 1];
                  if (nextRef) nextRef.focus();
                }}
                registerFirstFieldRef={(ref) => { groupFirstFieldRefs.current[index] = ref; }}
                colSizes={colSizes}
                disabled={!isLoggedIn}
              />
            )}
            ListFooterComponent={
              <TouchableOpacity 
                style={[styles.addGroupBtn, { borderColor: colors.primary, opacity: !isLoggedIn ? 0.5 : 1 }]} 
                onPress={handleAddGroup}
              >
                <Text style={[styles.addGroupBtnText, { color: colors.primary }]}>+ 새 그룹 추가</Text>
              </TouchableOpacity>
            }
          />
        )}

        {state.groups.length > 0 && (
          <View style={[styles.bottomBar, { backgroundColor: colors.background, borderTopColor: colors.border }]}>
            <TouchableOpacity
              style={[styles.calcBtn, { backgroundColor: (hasValidPieces && isLoggedIn) ? colors.primary : colors.muted }]}
              onPress={handleCalculate} disabled={(!hasValidPieces && isLoggedIn) || isCalculating}
            >
              {isCalculating ? <ActivityIndicator color="white" /> : (
                <Text style={styles.calcBtnText}>{isLoggedIn ? "✂️  배치 계산하기" : "로그인 후 계산 가능"}</Text>
              )}
            </TouchableOpacity>
          </View>
        )}
      </KeyboardAvoidingView>

      {/* 그룹명 수정 모달 */}
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

      {/* 로그인 모달 */}
      <Modal 
        visible={loginModalVisible} 
        transparent 
        animationType="slide" 
        onRequestClose={() => setLoginModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.loginModalContent}>
            <View style={styles.loginModalHeader}>
              <TouchableOpacity 
                onPress={() => setLoginModalVisible(false)}
                style={styles.closeModalBtn}
              >
                <Text style={styles.closeModalBtnText}>✕</Text>
              </TouchableOpacity>
            </View>
            <LoginScreen />
          </View>
        </View>
      </Modal>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: 16, paddingVertical: 14, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  headerLeft: { flex: 1 },
  headerRight: { flexDirection: "row", alignItems: "center" },
  headerTitle: { fontSize: 18, fontWeight: "700", color: "white" },
  headerSub: { fontSize: 12, marginTop: 2 },
  loginHeaderBtn: { backgroundColor: "white", paddingHorizontal: 15, paddingVertical: 7, borderRadius: 15 },
  loginHeaderBtnText: { color: "#007AFF", fontSize: 13, fontWeight: "700" },
  resetBtn: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: "rgba(255,255,255,0.15)", paddingHorizontal: 13, paddingVertical: 8, borderRadius: 20, marginLeft: 12, borderWidth: 1, borderColor: "rgba(255,255,255,0.35)" },
  resetBtnIcon: { fontSize: 14 },
  resetBtnText: { color: "rgba(255,255,255,0.95)", fontSize: 13, fontWeight: "600" },
  loginRequiredBanner: { backgroundColor: "#FFF9C4", paddingVertical: 8, alignItems: "center", borderBottomWidth: 1, borderBottomColor: "#FBC02D" },
  loginRequiredText: { fontSize: 12, color: "#F57F17", fontWeight: "600" },
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
  mergeGroupRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, paddingVertical: 8 },
  mergeGroupBtns: { flexDirection: "row", gap: 5 },
  mergeGroupBtn: { width: 36, height: 30, borderRadius: 6, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
  mergeGroupBtnText: { fontSize: 12, fontWeight: "700" },
  mergeGroupHint: { fontSize: 11, flex: 1 },
  mergeGroupBadge: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 10, marginRight: 4 },
  mergeGroupBadgeText: { color: "white", fontSize: 10, fontWeight: "700" },
  // 로그인 모달 관련
  loginModalContent: { width: "100%", height: "90%", backgroundColor: "#f5f5f5", borderTopLeftRadius: 25, borderTopRightRadius: 25, overflow: "hidden" },
  loginModalHeader: { padding: 15, alignItems: "flex-end", backgroundColor: "#f5f5f5" },
  closeModalBtn: { width: 30, height: 30, borderRadius: 15, backgroundColor: "#ddd", justifyContent: "center", alignItems: "center" },
  closeModalBtnText: { fontSize: 16, fontWeight: "bold", color: "#666" },
});
