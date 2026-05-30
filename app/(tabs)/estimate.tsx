import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Share,
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
import { useFilm } from "@/lib/filmContext";
import { loadCompanyInfo } from "./settings";
import { shareEstimatePDF } from "@/lib/pdfGenerator";
import {
  CONSTRUCTION_PRICE_DEFAULT,
  CONSTRUCTION_PRICE_MAX,
  CONSTRUCTION_PRICE_MIN,
  DEFAULT_MATERIAL_COST_PER_M,
  GROUP_BORDER_COLORS,
  GROUP_COLORS,
  calculateFromGroups,
  formatM,
  formatNumber,
} from "@/lib/filmCutting";

// ─── 슬라이더 컴포넌트 ───────────────────────────────────────

interface SliderProps {
  value: number;
  min: number;
  max: number;
  step: number;
  onValueChange: (v: number) => void;
  colors: ReturnType<typeof useColors>;
}

function SimpleSlider({ value, min, max, step, onValueChange, colors }: SliderProps) {
  const steps = Math.round((max - min) / step);
  const currentStep = Math.round((value - min) / step);
  const pct = (currentStep / steps) * 100;

  const buttons = [
    { label: "최저", val: min },
    { label: "평균", val: Math.round((min + max) / 2 / step) * step },
    { label: "최고", val: max },
  ];

  return (
    <View style={sliderStyles.container}>
      {/* 슬라이더 트랙 */}
      <View style={[sliderStyles.track, { backgroundColor: colors.border }]}>
        <View style={[sliderStyles.fill, { width: `${pct}%` as any, backgroundColor: colors.primary }]} />
      </View>

      {/* 스텝 버튼 */}
      <View style={sliderStyles.btnRow}>
        {buttons.map(({ label, val }) => {
          const isActive = value === val;
          return (
            <TouchableOpacity
              key={label}
              style={[sliderStyles.btn, { backgroundColor: isActive ? colors.primary : colors.surface, borderColor: isActive ? colors.primary : colors.border }]}
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onValueChange(val); }}
            >
              <Text style={[sliderStyles.btnLabel, { color: isActive ? "white" : colors.muted }]}>{label}</Text>
              <Text style={[sliderStyles.btnPrice, { color: isActive ? "white" : colors.foreground }]}>
                {formatNumber(val)}원
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* 세밀 조정 버튼 */}
      <View style={sliderStyles.fineRow}>
        <TouchableOpacity
          style={[sliderStyles.fineBtn, { borderColor: colors.border }]}
          onPress={() => onValueChange(Math.max(min, value - step))}
        >
          <Text style={[sliderStyles.fineBtnText, { color: colors.foreground }]}>－ {formatNumber(step)}원</Text>
        </TouchableOpacity>
        <View style={[sliderStyles.currentVal, { backgroundColor: colors.primary + "15" }]}>
          <Text style={[sliderStyles.currentValText, { color: colors.primary }]}>
            {formatNumber(value)}원/m²
          </Text>
        </View>
        <TouchableOpacity
          style={[sliderStyles.fineBtn, { borderColor: colors.border }]}
          onPress={() => onValueChange(Math.min(max, value + step))}
        >
          <Text style={[sliderStyles.fineBtnText, { color: colors.foreground }]}>＋ {formatNumber(step)}원</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const sliderStyles = StyleSheet.create({
  container: { gap: 10 },
  track: { height: 6, borderRadius: 3, overflow: "hidden" },
  fill: { height: "100%", borderRadius: 3 },
  btnRow: { flexDirection: "row", gap: 8 },
  btn: { flex: 1, paddingVertical: 8, borderRadius: 8, borderWidth: 1, alignItems: "center", gap: 2 },
  btnLabel: { fontSize: 10 },
  btnPrice: { fontSize: 12, fontWeight: "700" },
  fineRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  fineBtn: { flex: 1, paddingVertical: 8, borderRadius: 8, borderWidth: 1, alignItems: "center" },
  fineBtnText: { fontSize: 12, fontWeight: "600" },
  currentVal: { flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: "center" },
  currentValText: { fontSize: 14, fontWeight: "800" },
});

// ─── 그룹별 시공비 단가 입력 컴포넌트 ────────────────────────

interface GroupConstructionPriceProps {
  groupId: string;
  groupName: string;
  globalConstructionPrice: number;
  groupConstructionPrice: number | undefined;
  borderColor: string;
  colors: ReturnType<typeof useColors>;
  onChangeGroupPrice: (groupId: string, price: number | undefined) => void;
}

function GroupConstructionPriceInput({
  groupId,
  groupName,
  globalConstructionPrice,
  groupConstructionPrice,
  borderColor,
  colors,
  onChangeGroupPrice,
}: GroupConstructionPriceProps) {
  const useCustom = groupConstructionPrice !== undefined;
  const [priceText, setPriceText] = useState(
    groupConstructionPrice !== undefined ? String(groupConstructionPrice) : ""
  );

  // 프로젝트 불러오기 등으로 prop이 외부에서 변경될 때 내부 텍스트 동기화
  useEffect(() => {
    if (groupConstructionPrice !== undefined) {
      setPriceText(String(groupConstructionPrice));
    } else {
      setPriceText("");
    }
  }, [groupConstructionPrice]);

  const handleToggleCustom = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (useCustom) {
      // 개별 → 기본으로 전환: 개별 단가 제거
      onChangeGroupPrice(groupId, undefined);
      setPriceText("");
    } else {
      // 기본 → 개별로 전환: 전역 단가로 초기화
      const initVal = globalConstructionPrice;
      onChangeGroupPrice(groupId, initVal);
      setPriceText(String(initVal));
    }
  }, [useCustom, groupId, globalConstructionPrice, onChangeGroupPrice]);

  const handleBlur = useCallback(() => {
    const val = parseFloat(priceText);
    if (!isNaN(val) && val >= 0) {
      const rounded = Math.round(val / 500) * 500; // 500원 단위 반올림
      const clamped = Math.max(CONSTRUCTION_PRICE_MIN, Math.min(CONSTRUCTION_PRICE_MAX, rounded));
      onChangeGroupPrice(groupId, clamped);
      setPriceText(String(clamped));
    } else {
      // 잘못된 입력 시 전역 단가로 복원
      onChangeGroupPrice(groupId, globalConstructionPrice);
      setPriceText(String(globalConstructionPrice));
    }
  }, [priceText, groupId, globalConstructionPrice, onChangeGroupPrice]);

  return (
    <View style={groupPriceStyles.container}>
      {/* 토글 헤더 */}
      <View style={groupPriceStyles.header}>
        <Text style={[groupPriceStyles.label, { color: colors.muted }]}>시공비 단가</Text>
        <View style={groupPriceStyles.toggleRow}>
          <TouchableOpacity
            style={[
              groupPriceStyles.toggleBtn,
              { backgroundColor: !useCustom ? borderColor : colors.surface, borderColor: borderColor },
            ]}
            onPress={handleToggleCustom}
          >
            <Text style={[groupPriceStyles.toggleBtnText, { color: !useCustom ? "white" : borderColor }]}>기본</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              groupPriceStyles.toggleBtn,
              { backgroundColor: useCustom ? borderColor : colors.surface, borderColor: borderColor },
            ]}
            onPress={handleToggleCustom}
          >
            <Text style={[groupPriceStyles.toggleBtnText, { color: useCustom ? "white" : borderColor }]}>개별</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* 개별 단가 입력 (개별 모드일 때만) */}
      {useCustom ? (
        <View style={groupPriceStyles.inputRow}>
          <TextInput
            style={[
              groupPriceStyles.input,
              { color: colors.foreground, borderColor: borderColor, backgroundColor: colors.background },
            ]}
            value={priceText}
            onChangeText={setPriceText}
            onBlur={handleBlur}
            keyboardType="numeric"
            returnKeyType="done"
          />
          <Text style={[groupPriceStyles.unit, { color: colors.muted }]}>원/m²</Text>
          <Text style={[groupPriceStyles.badge, { color: borderColor, backgroundColor: borderColor + "15" }]}>✦ 개별</Text>
        </View>
      ) : (
        <Text style={[groupPriceStyles.defaultText, { color: colors.muted }]}>
          전역 단가 적용: {formatNumber(globalConstructionPrice)}원/m²
        </Text>
      )}
    </View>
  );
}

const groupPriceStyles = StyleSheet.create({
  container: { gap: 6 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  label: { fontSize: 11 },
  toggleRow: { flexDirection: "row", gap: 4 },
  toggleBtn: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6, borderWidth: 1 },
  toggleBtnText: { fontSize: 11, fontWeight: "700" },
  inputRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  input: { borderWidth: 1.5, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, fontSize: 14, width: 110, textAlign: "right" },
  unit: { fontSize: 12 },
  badge: { fontSize: 11, fontWeight: "700", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  defaultText: { fontSize: 11 },
});

// ─── 견적 화면 ────────────────────────────────────────────────

export default function EstimateScreen() {
  const colors = useColors();
  const { state, dispatch } = useFilm();

  const [materialCostText, setMaterialCostText] = useState(
    String(state.materialCostPerM ?? DEFAULT_MATERIAL_COST_PER_M),
  );
  const [constructionPrice, setConstructionPrice] = useState(
    state.constructionPricePerM2 ?? CONSTRUCTION_PRICE_DEFAULT,
  );

  const result = state.lastResult;

  // 할인 상태
  const [discountEnabled, setDiscountEnabled] = useState(false);
  const [customDiscountRate, setCustomDiscountRate] = useState<number | null>(null);
  const [discountRateText, setDiscountRateText] = useState("");

  // 재계산 헬퍼: mergeGroupId 기준 자동 병합 배치
  const recalculate = useCallback((matCost: number, constrPrice: number) => {
    const newResult = calculateFromGroups(state.groups, matCost, constrPrice);
    dispatch({ type: "SET_RESULT", payload: newResult });
  }, [state.groups, dispatch]);

  // 시공비 변경 시 재계산
  const handleConstructionChange = useCallback((val: number) => {
    setConstructionPrice(val);
    dispatch({ type: "SET_CONSTRUCTION_PRICE", payload: val });
    recalculate(parseFloat(materialCostText) || DEFAULT_MATERIAL_COST_PER_M, val);
  }, [materialCostText, dispatch, recalculate]);

  const handleMaterialCostBlur = useCallback(() => {
    const val = parseFloat(materialCostText) || DEFAULT_MATERIAL_COST_PER_M;
    setMaterialCostText(String(val));
    dispatch({ type: "SET_MATERIAL_COST_PER_M", payload: val });
    recalculate(val, constructionPrice);
  }, [materialCostText, constructionPrice, dispatch, recalculate]);

  // 그룹별 시공비 단가 변경 핸들러
  const handleGroupConstructionPriceChange = useCallback((groupId: string, price: number | undefined) => {
    dispatch({ type: "UPDATE_GROUP_CONSTRUCTION_PRICE", payload: { groupId, constructionPricePerM2: price } });
    const matCost = parseFloat(materialCostText) || DEFAULT_MATERIAL_COST_PER_M;
    const updatedGroups = state.groups.map((g) =>
      g.groupId === groupId ? { ...g, constructionPricePerM2: price } : g
    );
    const newResult = calculateFromGroups(updatedGroups, matCost, constructionPrice);
    dispatch({ type: "SET_RESULT", payload: newResult });
  }, [state.groups, materialCostText, constructionPrice, dispatch]);

  // 할인율 계산
  const autoDiscountRate = result ? result.invoice.discountRate : 0;
  const activeDiscountRate = discountEnabled
    ? (customDiscountRate !== null ? customDiscountRate : autoDiscountRate)
    : 0;

  // 할인 적용된 최종 금액 계산 (사용자 설정 시공비 단가 기준 단일 합계)
  const adjustedInvoice = useMemo(() => {
    if (!result) return null;
    const inv = result.invoice;
    const dr = activeDiscountRate;
    const discount = Math.round(inv.subtotal * dr);
    // 그룹별 시공비가 개별 설정된 경우 groupInvoices에서 합산
    const totalConstructionCost = inv.groupInvoices.reduce((sum, gi) => sum + gi.constructionCost, 0);
    const totalAmount = Math.round((inv.totalMaterialCost + totalConstructionCost) * (1 - dr));
    return {
      ...inv,
      totalConstructionCost,
      discount,
      discountRate: dr,
      total: { min: totalAmount, max: totalAmount },
    };
  }, [result, activeDiscountRate]);

  const handleDiscountToggle = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setDiscountEnabled((prev) => !prev);
  }, []);

  const handleDiscountRateBlur = useCallback(() => {
    const val = parseFloat(discountRateText);
    if (!isNaN(val) && val >= 0 && val <= 50) {
      setCustomDiscountRate(val / 100);
    } else {
      setDiscountRateText("");
      setCustomDiscountRate(null);
    }
  }, [discountRateText]);

  const handleResetDiscount = useCallback(() => {
    setCustomDiscountRate(null);
    setDiscountRateText("");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, []);

  const handleShare = useCallback(async () => {
    if (!result || !adjustedInvoice) return;
    const invoice = adjustedInvoice;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    // 업체 정보 불러오기
    const company = await loadCompanyInfo();

    const groupLines = invoice.groupInvoices.map((gi) => {
      const hasCustomConstr = gi.constructionPricePerM2 !== constructionPrice;
      const constrNote = hasCustomConstr ? ` (개별 ${formatNumber(gi.constructionPricePerM2)}원/m²)` : "";
      return `  [${gi.groupName}] ${gi.brand}${gi.filmName ? ` · ${gi.filmName}` : ""}\n  필름 ${formatM(gi.filmLengthM)}m (${gi.filmAreaM2.toFixed(3)}m²)\n  단가 ${formatNumber(gi.materialCostPerM)}원/m · 자재비 ${formatNumber(gi.materialCost)}원 · 시공비 ${formatNumber(gi.constructionCost)}원${constrNote}`;
    }).join("\n");

    // 업체 정보 섹션 구성
    const companyLines: string[] = [];
    if (company.companyName || company.managerName || company.phone || company.email || company.address) {
      companyLines.push("─────────────────");
      if (company.companyName) companyLines.push(`🏢 ${company.companyName}`);
      if (company.managerName) companyLines.push(`👤 담당자: ${company.managerName}`);
      if (company.phone) companyLines.push(`📞 ${company.phone}`);
      if (company.email) companyLines.push(`✉️ ${company.email}`);
      if (company.address) companyLines.push(`📍 ${company.address}`);
    }
    const noteLines: string[] = [];
    if (company.note) {
      noteLines.push("─────────────────");
      noteLines.push(company.note);
    }

    // 작성 날짜
    const today = new Date();
    const dateStr = `${today.getFullYear()}.${String(today.getMonth() + 1).padStart(2, "0")}.${String(today.getDate()).padStart(2, "0")}`;

    // 그룹별 개별 단가 여부 확인
    const hasGroupCustomConstr = invoice.groupInvoices.some((gi) => gi.constructionPricePerM2 !== constructionPrice);
    const constrSummary = hasGroupCustomConstr
      ? `그룹별 개별 단가 적용`
      : `${formatNumber(constructionPrice)}원/m²`;

    const shareText = [
      "📋 필름 재단 견적서",
      `작성일: ${dateStr}`,
      "─────────────────",
      `총 필름 길이: ${formatM(invoice.totalFilmLengthM)}m`,
      `총 면적: ${invoice.totalFilmAreaM2.toFixed(3)} m²`,
      "",
      "[ 그룹별 내역 ]",
      groupLines,
      "",
      "[ 비용 합계 ]",
      `자재비 합계: ${formatNumber(invoice.totalMaterialCost)}원`,
      `시공비 합계: ${formatNumber(invoice.totalConstructionCost)}원 (${constrSummary})`,
      activeDiscountRate > 0 ? `할인 (${(activeDiscountRate * 100).toFixed(0)}%): -${formatNumber(Math.round(invoice.subtotal * activeDiscountRate))}원` : null,
      `소계: ${formatNumber(invoice.subtotal)}원`,
      "",
      `💰 최종 견적: ${formatNumber(invoice.total.min)}원`,
      `  (시공비 ${constrSummary} 기준, VAT 별도)`,
      ...companyLines,
      ...noteLines,
    ].filter(Boolean).join("\n");

    try {
      // PDF 공유 시도
      await shareEstimatePDF(
        invoice,
        state.projectName,
        constructionPrice,
        {
          companyName: company.companyName,
          managerName: company.managerName,
          phone: company.phone,
          email: company.email,
          address: company.address,
          note: company.note,
        }
      );
    } catch (error) {
      console.error('PDF 공유 오류:', error);
      // PDF 공유 실패 시 텍스트로 폴백
      Alert.alert('PDF 공유 실패', '견적서 PDF를 생성하거나 공유할 수 없습니다. 텍스트로 공유를 시도하시겠어요?', [
        {
          text: '취소',
          onPress: () => {},
          style: 'cancel',
        },
        {
          text: '텍스트로 공유',
          onPress: async () => {
            try {
              await Share.share({ message: shareText, title: "필름 재단 견적서" });
            } catch (e) {
              Alert.alert("공유 실패", "공유 기능을 사용할 수 없습니다.");
            }
          },
        },
      ]);
    }
  }, [result, adjustedInvoice, activeDiscountRate, constructionPrice, state.projectName]);

  if (!result || !adjustedInvoice) {
    return (
      <ScreenContainer>
        <View style={styles.center}>
          <Text style={[styles.noDataText, { color: colors.muted }]}>배치 결과가 없습니다.{"\n"}먼저 배치 계산을 실행해 주세요.</Text>
          <TouchableOpacity
            style={[styles.backBtn, { backgroundColor: colors.primary }]}
            onPress={() => router.back()}
          >
            <Text style={styles.backBtnText}>← 입력 화면으로</Text>
          </TouchableOpacity>
        </View>
      </ScreenContainer>
    );
  }

  const invoice = adjustedInvoice;

  return (
    <ScreenContainer containerClassName="bg-background">
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        {/* 헤더 */}
        <View style={[styles.header, { backgroundColor: colors.primary }]}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backArrow}>
            <Text style={styles.backArrowText}>← 결과</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>최종 견적</Text>
          <View style={{ width: 60 }} />
        </View>

        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>

          {/* ── 자재비 설정 ── */}
          <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>자재비 단가</Text>
            <View style={styles.row}>
              <Text style={[styles.rowLabel, { color: colors.muted }]}>m(선형미터)당</Text>
              <View style={styles.inputWrapper}>
                <TextInput
                  style={[styles.costInput, { color: colors.foreground, borderColor: colors.primary, backgroundColor: colors.background }]}
                  value={materialCostText}
                  onChangeText={setMaterialCostText}
                  onBlur={handleMaterialCostBlur}
                  keyboardType="numeric"
                  returnKeyType="done"
                />
                <Text style={[styles.unitText, { color: colors.muted }]}>원/m</Text>
              </View>
            </View>
            <Text style={[styles.hintText, { color: colors.muted }]}>
              * 필름 너비 1.22m 고정 기준 선형미터 단가
            </Text>
            <Text style={[styles.hintText, { color: colors.muted }]}>
              * ✦ 표시는 입력 화면에서 개별 단가가 설정된 그룹입니다
            </Text>
          </View>

          {/* ── 시공비 슬라이더 (전역 기본값) ── */}
          <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={styles.sectionTitleRow}>
              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>시공비 단가 (기본)</Text>
              <Text style={[styles.sectionBadge, { backgroundColor: colors.primary + "18", color: colors.primary }]}>
                2025년 시세 기준
              </Text>
            </View>
            <Text style={[styles.hintText, { color: colors.muted }]}>
              시세 범위: {formatNumber(CONSTRUCTION_PRICE_MIN)}~{formatNumber(CONSTRUCTION_PRICE_MAX)}원/m² · 평균 {formatNumber(CONSTRUCTION_PRICE_DEFAULT)}원/m²
            </Text>
            <Text style={[styles.hintText, { color: colors.muted }]}>
              * 그룹별 개별 단가가 설정된 경우 해당 단가가 우선 적용됩니다
            </Text>
            <SimpleSlider
              value={constructionPrice}
              min={CONSTRUCTION_PRICE_MIN}
              max={CONSTRUCTION_PRICE_MAX}
              step={500}
              onValueChange={handleConstructionChange}
              colors={colors}
            />
          </View>

          {/* ── 그룹별 내역 ── */}
          <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>그룹별 내역</Text>
            {invoice.groupInvoices.map((gi, idx) => {
              const bc = GROUP_BORDER_COLORS[idx % GROUP_BORDER_COLORS.length];
              const bgc = GROUP_COLORS[idx % GROUP_COLORS.length];
              const globalMatCost = parseFloat(materialCostText) || DEFAULT_MATERIAL_COST_PER_M;
              const hasCustomMat = gi.materialCostPerM !== globalMatCost;
              const hasCustomConstr = gi.constructionPricePerM2 !== constructionPrice;
              // 현재 그룹의 constructionPricePerM2 (state.groups에서 가져옴)
              const groupState = state.groups.find((g) => g.groupId === gi.groupId);
              const groupCustomConstrPrice = groupState?.constructionPricePerM2;

              return (
                <View key={gi.groupId} style={[styles.groupRow, { backgroundColor: bgc, borderLeftColor: bc }]}>
                  <View style={styles.groupRowHeader}>
                    <Text style={[styles.groupRowName, { color: bc }]}>{gi.groupName}</Text>
                    <Text style={[styles.groupRowBrand, { color: bc + "CC" }]}>{gi.brand}{gi.filmName ? ` · ${gi.filmName}` : ""}</Text>
                  </View>
                  <View style={styles.groupRowDetails}>
                    <View style={styles.groupRowItem}>
                      <Text style={[styles.groupRowItemLabel, { color: colors.muted }]}>필름 길이</Text>
                      <Text style={[styles.groupRowItemValue, { color: colors.foreground }]}>{formatM(gi.filmLengthM)}m</Text>
                    </View>
                    <View style={styles.groupRowItem}>
                      <Text style={[styles.groupRowItemLabel, { color: colors.muted }]}>면적</Text>
                      <Text style={[styles.groupRowItemValue, { color: colors.foreground }]}>{gi.filmAreaM2.toFixed(3)}m²</Text>
                    </View>
                    <View style={styles.groupRowItem}>
                      <Text style={[styles.groupRowItemLabel, { color: colors.muted }]}>자재 단가</Text>
                      <Text style={[styles.groupRowItemValue, { color: hasCustomMat ? bc : colors.foreground }]}>
                        {formatNumber(gi.materialCostPerM)}원/m{hasCustomMat ? " ✦" : ""}
                      </Text>
                    </View>
                    <View style={styles.groupRowItem}>
                      <Text style={[styles.groupRowItemLabel, { color: colors.muted }]}>자재비</Text>
                      <Text style={[styles.groupRowItemValue, { color: colors.foreground }]}>{formatNumber(gi.materialCost)}원</Text>
                    </View>
                    <View style={styles.groupRowItem}>
                      <Text style={[styles.groupRowItemLabel, { color: colors.muted }]}>시공 단가</Text>
                      <Text style={[styles.groupRowItemValue, { color: hasCustomConstr ? bc : colors.foreground }]}>
                        {formatNumber(gi.constructionPricePerM2)}원/m²{hasCustomConstr ? " ✦" : ""}
                      </Text>
                    </View>
                    <View style={styles.groupRowItem}>
                      <Text style={[styles.groupRowItemLabel, { color: colors.muted }]}>시공비</Text>
                      <Text style={[styles.groupRowItemValue, { color: colors.foreground }]}>{formatNumber(gi.constructionCost)}원</Text>
                    </View>
                  </View>

                  {/* 그룹별 시공비 단가 개별 입력 */}
                  <View style={[styles.groupConstrPriceArea, { borderTopColor: bc + "25" }]}>
                    <GroupConstructionPriceInput
                      groupId={gi.groupId}
                      groupName={gi.groupName}
                      globalConstructionPrice={constructionPrice}
                      groupConstructionPrice={groupCustomConstrPrice}
                      borderColor={bc}
                      colors={colors}
                      onChangeGroupPrice={handleGroupConstructionPriceChange}
                    />
                  </View>

                  <View style={[styles.groupRowTotal, { borderTopColor: bc + "30" }]}>
                    <Text style={[styles.groupRowTotalLabel, { color: colors.muted }]}>소계</Text>
                    <Text style={[styles.groupRowTotalValue, { color: bc }]}>{formatNumber(gi.subtotal)}원</Text>
                  </View>
                </View>
              );
            })}
          </View>

          {/* ── 합계 내역 ── */}
          <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>합계 내역</Text>
            {[
              { label: "자재비 합계", val: invoice.totalMaterialCost },
              { label: "시공비 합계", val: invoice.totalConstructionCost },
            ].map(({ label, val }) => (
              <View key={label} style={styles.detailRow}>
                <Text style={[styles.detailLabel, { color: colors.muted }]}>{label}</Text>
                <Text style={[styles.detailValue, { color: colors.foreground }]}>{formatNumber(val)}원</Text>
              </View>
            ))}

            {/* ── 할인 설정 섹션 ── */}
            <View style={[styles.discountSection, { borderColor: colors.border }]}>
              {/* 할인 토글 헤더 */}
              <View style={styles.discountHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.discountTitle, { color: colors.foreground }]}>할인 적용</Text>
                  {autoDiscountRate > 0 && (
                    <Text style={[styles.discountHint, { color: colors.muted }]}>
                      면적 기준 자동: {(autoDiscountRate * 100).toFixed(0)}%
                      ({invoice.totalFilmAreaM2 >= 10 ? "10m²" : invoice.totalFilmAreaM2 >= 5 ? "5m²" : "1m²"} 이상)
                    </Text>
                  )}
                </View>
                <TouchableOpacity
                  style={[styles.toggleBtn, { backgroundColor: discountEnabled ? colors.success : colors.border }]}
                  onPress={handleDiscountToggle}
                >
                  <View style={[styles.toggleThumb, { transform: [{ translateX: discountEnabled ? 20 : 2 }] }]} />
                </TouchableOpacity>
              </View>

              {/* 할인율 조정 (토글 ON일 때만) */}
              {discountEnabled && (
                <View style={{ gap: 8 }}>
                  <Text style={[styles.discountRateLabel, { color: colors.muted }]}>할인율 선택</Text>
                  <View style={styles.discountRateButtons}>
                    {[0, 5, 10, 15, 20, 30].map((pct) => {
                      const rateVal = pct / 100;
                      const isActive = customDiscountRate !== null
                        ? customDiscountRate === rateVal
                        : autoDiscountRate === rateVal;
                      return (
                        <TouchableOpacity
                          key={pct}
                          style={[styles.rateBtn, { backgroundColor: isActive ? colors.primary : colors.background, borderColor: isActive ? colors.primary : colors.border }]}
                          onPress={() => {
                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                            setCustomDiscountRate(rateVal);
                            setDiscountRateText(String(pct));
                          }}
                        >
                          <Text style={[styles.rateBtnText, { color: isActive ? "white" : colors.foreground }]}>{pct}%</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                  {/* 직접 입력 */}
                  <View style={styles.discountInputRow}>
                    <TextInput
                      style={[styles.discountInput, { color: colors.foreground, borderColor: colors.primary, backgroundColor: colors.background }]}
                      value={discountRateText}
                      onChangeText={setDiscountRateText}
                      onBlur={handleDiscountRateBlur}
                      keyboardType="numeric"
                      returnKeyType="done"
                      placeholder={`${(activeDiscountRate * 100).toFixed(0)}`}
                      placeholderTextColor={colors.muted}
                    />
                    <Text style={[styles.discountInputUnit, { color: colors.muted }]}>% 직접 입력 (0~50)</Text>
                    {customDiscountRate !== null && (
                      <TouchableOpacity style={[styles.resetBtn, { borderColor: colors.border }]} onPress={handleResetDiscount}>
                        <Text style={[styles.resetBtnText, { color: colors.muted }]}>초기화</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              )}

              {/* 할인 금액 표시 */}
              {discountEnabled && activeDiscountRate > 0 ? (
                <View style={[styles.discountBadge, { backgroundColor: colors.success + "18", borderColor: colors.success + "40" }]}>
                  <Text style={[styles.discountText, { color: colors.success }]}>
                    할인 {(activeDiscountRate * 100).toFixed(0)}% 적용
                  </Text>
                  <Text style={[styles.discountAmount, { color: colors.success }]}>-{formatNumber(invoice.discount)}원</Text>
                </View>
              ) : !discountEnabled ? (
                <Text style={[styles.discountHint, { color: colors.muted }]}>할인이 비활성화되어 있습니다.</Text>
              ) : null}
            </View>
          </View>

          {/* ── 최종 금액 ── */}
          <View style={[styles.totalCard, { backgroundColor: colors.primary + "10", borderColor: colors.primary + "30" }]}>
            <Text style={[styles.totalLabel, { color: colors.muted }]}>최종 견적 (VAT 별도)</Text>
            <Text style={[styles.totalMin, { color: colors.primary }]}>{formatNumber(invoice.total.min)}원</Text>
            <Text style={[styles.totalNote, { color: colors.muted }]}>
              {invoice.groupInvoices.some((gi) => gi.constructionPricePerM2 !== constructionPrice)
                ? "그룹별 개별 시공비 단가 적용"
                : `시공비 ${formatNumber(constructionPrice)}원/m² 기준`}
              {activeDiscountRate > 0 && discountEnabled ? ` · 할인 ${(activeDiscountRate * 100).toFixed(0)}% 적용` : ""}
            </Text>
          </View>

          <View style={{ height: 16 }} />
        </ScrollView>

        {/* 하단 공유 버튼 */}
        <View style={[styles.bottomBar, { backgroundColor: colors.background, borderTopColor: colors.border }]}>
          <TouchableOpacity
            style={[styles.shareBtn, { backgroundColor: colors.primary }]}
            onPress={handleShare}
          >
            <Text style={styles.shareBtnText}>견적서 공유하기  ↑</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </ScreenContainer>
  );
}

// ─── 스타일 ──────────────────────────────────────────────────

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: "center", alignItems: "center", padding: 24 },
  noDataText: { fontSize: 16, textAlign: "center", lineHeight: 26, marginBottom: 24 },
  backBtn: { paddingHorizontal: 20, paddingVertical: 12, borderRadius: 10 },
  backBtnText: { color: "white", fontSize: 15, fontWeight: "600" },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 14 },
  backArrow: { width: 60 },
  backArrowText: { color: "white", fontSize: 15 },
  headerTitle: { flex: 1, color: "white", fontSize: 18, fontWeight: "700", textAlign: "center" },
  scrollContent: { padding: 16, gap: 14 },
  section: { borderRadius: 12, borderWidth: 1, padding: 16, gap: 12 },
  sectionTitle: { fontSize: 15, fontWeight: "700" },
  sectionTitleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  sectionBadge: { fontSize: 11, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10, fontWeight: "600" },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  rowLabel: { fontSize: 14 },
  inputWrapper: { flexDirection: "row", alignItems: "center", gap: 6 },
  costInput: { borderWidth: 1.5, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7, fontSize: 15, width: 120, textAlign: "right" },
  unitText: { fontSize: 13 },
  hintText: { fontSize: 11, lineHeight: 16 },
  // 그룹별 내역
  groupRow: { borderRadius: 8, borderLeftWidth: 3, padding: 12, gap: 8 },
  groupRowHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
  groupRowName: { fontSize: 14, fontWeight: "700" },
  groupRowBrand: { fontSize: 12 },
  groupRowDetails: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  groupRowItem: { minWidth: "45%", flex: 1 },
  groupRowItemLabel: { fontSize: 11 },
  groupRowItemValue: { fontSize: 13, fontWeight: "600" },
  groupConstrPriceArea: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 8 },
  groupRowTotal: { flexDirection: "row", justifyContent: "space-between", paddingTop: 8, borderTopWidth: StyleSheet.hairlineWidth },
  groupRowTotalLabel: { fontSize: 12 },
  groupRowTotalValue: { fontSize: 14, fontWeight: "700" },
  // 합계
  detailRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 4 },
  detailLabel: { fontSize: 13 },
  detailValue: { fontSize: 13, fontWeight: "600" },
  discountSection: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 12, marginTop: 4, gap: 10 },
  discountHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
  discountTitle: { fontSize: 14, fontWeight: "700" },
  discountHint: { fontSize: 11, marginTop: 2 },
  toggleBtn: { width: 44, height: 26, borderRadius: 13, justifyContent: "center" },
  toggleThumb: { width: 22, height: 22, borderRadius: 11, backgroundColor: "white", shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.2, shadowRadius: 2, elevation: 2 },
  discountRateLabel: { fontSize: 12 },
  discountRateButtons: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  rateBtn: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 1, minWidth: 44, alignItems: "center" },
  rateBtnText: { fontSize: 13, fontWeight: "600" },
  discountInputRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  discountInput: { borderWidth: 1.5, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, fontSize: 14, width: 64, textAlign: "right" },
  discountInputUnit: { fontSize: 12, flex: 1 },
  resetBtn: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 1 },
  resetBtnText: { fontSize: 12 },
  discountBadge: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", borderRadius: 8, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 8 },
  discountText: { fontSize: 12, flex: 1 },
  discountAmount: { fontSize: 13, fontWeight: "700" },
  // 최종 금액
  totalCard: { borderRadius: 14, borderWidth: 1, padding: 20, alignItems: "center", gap: 6 },
  totalLabel: { fontSize: 13, marginBottom: 4 },
  totalMin: { fontSize: 28, fontWeight: "800" },
  totalNote: { fontSize: 11, marginTop: 4 },
  // 하단
  bottomBar: { paddingHorizontal: 16, paddingVertical: 12, borderTopWidth: StyleSheet.hairlineWidth },
  shareBtn: { paddingVertical: 15, borderRadius: 12, alignItems: "center" },
  shareBtnText: { color: "white", fontSize: 17, fontWeight: "700" },
});
