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
      <View style={[sliderStyles.track, { backgroundColor: colors.border }]}>
        <View style={[sliderStyles.fill, { width: `${pct}%` as any, backgroundColor: colors.primary }]} />
      </View>

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
      onChangeGroupPrice(groupId, undefined);
      setPriceText("");
    } else {
      const initVal = globalConstructionPrice;
      onChangeGroupPrice(groupId, initVal);
      setPriceText(String(initVal));
    }
  }, [useCustom, groupId, globalConstructionPrice, onChangeGroupPrice]);

  const handleBlur = useCallback(() => {
    const val = parseFloat(priceText);
    if (!isNaN(val) && val >= 0) {
      const rounded = Math.round(val / 500) * 500;
      const clamped = Math.max(CONSTRUCTION_PRICE_MIN, Math.min(CONSTRUCTION_PRICE_MAX, rounded));
      onChangeGroupPrice(groupId, clamped);
      setPriceText(String(clamped));
    } else {
      onChangeGroupPrice(groupId, globalConstructionPrice);
      setPriceText(String(globalConstructionPrice));
    }
  }, [priceText, groupId, globalConstructionPrice, onChangeGroupPrice]);

  return (
    <View style={groupPriceStyles.container}>
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

  const [discountEnabled, setDiscountEnabled] = useState(false);
  const [customDiscountRate, setCustomDiscountRate] = useState<number | null>(null);
  const [discountRateText, setDiscountRateText] = useState("");

  const recalculate = useCallback((matCost: number, constrPrice: number) => {
    const newResult = calculateFromGroups(state.groups, matCost, constrPrice);
    dispatch({ type: "SET_RESULT", payload: newResult });
  }, [state.groups, dispatch]);

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

  const handleGroupConstructionPriceChange = useCallback((groupId: string, price: number | undefined) => {
    dispatch({ type: "UPDATE_GROUP_CONSTRUCTION_PRICE", payload: { groupId, constructionPricePerM2: price } });
    const matCost = parseFloat(materialCostText) || DEFAULT_MATERIAL_COST_PER_M;
    const updatedGroups = state.groups.map((g) =>
      g.groupId === groupId ? { ...g, constructionPricePerM2: price } : g
    );
    const newResult = calculateFromGroups(updatedGroups, matCost, constructionPrice);
    dispatch({ type: "SET_RESULT", payload: newResult });
  }, [state.groups, materialCostText, constructionPrice, dispatch]);

  const autoDiscountRate = result ? result.invoice.discountRate : 0;
  const activeDiscountRate = discountEnabled
    ? (customDiscountRate !== null ? customDiscountRate : autoDiscountRate)
    : 0;

  const adjustedInvoice = useMemo(() => {
    if (!result) return null;
    const inv = result.invoice;
    const dr = activeDiscountRate;
    const totalConstructionCost = inv.groupInvoices.reduce((sum, gi) => sum + gi.constructionCost, 0);
    const subtotal = inv.totalMaterialCost + totalConstructionCost;
    const discount = Math.round(subtotal * dr);
    const totalAmount = subtotal - discount;
    return {
      ...inv,
      totalConstructionCost,
      subtotal,
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

    const company = await loadCompanyInfo();

    const groupLines = invoice.groupInvoices.map((gi) => {
      const hasCustomConstr = gi.constructionPricePerM2 !== constructionPrice;
      const constrNote = hasCustomConstr ? ` (개별 ${formatNumber(gi.constructionPricePerM2)}원/m²)` : "";
      return `  [${gi.groupName}] ${gi.brand}${gi.filmName ? ` · ${gi.filmName}` : ""}\n  필름 ${formatM(gi.filmLengthM)}m (${gi.filmAreaM2.toFixed(3)}m²)\n  단가 ${formatNumber(gi.materialCostPerM)}원/m · 자재비 ${formatNumber(gi.materialCost)}원 · 시공비 ${formatNumber(gi.constructionCost)}원${constrNote}`;
    }).join("\n");

    const companyLines: string[] = [];
    if (company.companyName || company.managerName || company.phone || company.email || company.address) {
      companyLines.push("─────────────────");
      if (company.companyName) companyLines.push(`🏢 업체명: ${company.companyName}`);
      if (company.managerName) companyLines.push(`👤 담당자: ${company.managerName}`);
      if (company.phone) companyLines.push(`📞 연락처: ${company.phone}`);
      if (company.email) companyLines.push(`✉️ 이메일: ${company.email}`);
      if (company.address) companyLines.push(`📍 주소: ${company.address}`);
    }

    const noteLine = company.note ? `\n─────────────────\n📝 비고: ${company.note}` : "";

    const message = `[필름 재단 견적서]\n\n총 견적 금액: ${formatNumber(invoice.total.min)}원\n(할인 ${formatNumber(invoice.discount)}원 적용)\n\n상세 내역:\n${groupLines}\n\n자재비 합계: ${formatNumber(invoice.totalMaterialCost)}원\n시공비 합계: ${formatNumber(invoice.totalConstructionCost)}원\n합계(세전): ${formatNumber(invoice.subtotal)}원\n\n${companyLines.join("\n")}${noteLine}`;

    try {
      await Share.share({ message });
    } catch (error) {
      console.log(error);
    }
  }, [result, adjustedInvoice, constructionPrice]);

  const handleSharePDF = useCallback(async () => {
    if (!result || !adjustedInvoice) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const company = await loadCompanyInfo();
    await shareEstimatePDF(result, adjustedInvoice, company);
  }, [result, adjustedInvoice]);

  if (!result || !adjustedInvoice) {
    return (
      <ScreenContainer containerClassName="bg-background">
        <View style={styles.emptyContainer}>
          <Text style={[styles.emptyText, { color: colors.muted }]}>
            먼저 '입력' 탭에서 데이터를 입력하고{"\n"}재단 계산을 완료해 주세요.
          </Text>
          <TouchableOpacity
            style={[styles.emptyBtn, { backgroundColor: colors.primary }]}
            onPress={() => router.push("/(tabs)/input")}
          >
            <Text style={styles.emptyBtnText}>입력 탭으로 이동</Text>
          </TouchableOpacity>
        </View>
      </ScreenContainer>
    );
  }

  const invoice = adjustedInvoice;

  return (
    <ScreenContainer containerClassName="bg-background">
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <View style={[styles.header, { backgroundColor: colors.primary }]}>
          <Text style={styles.headerTitle}>견적서</Text>
        </View>

        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          {/* 총 합계 카드 */}
          <View style={[styles.totalCard, { backgroundColor: colors.primary }]}>
            <Text style={styles.totalLabel}>최종 견적 금액 (세전)</Text>
            <Text style={styles.totalAmount}>{formatNumber(invoice.total.min)}원</Text>
            <View style={styles.totalDivider} />
            <View style={styles.totalRow}>
              <Text style={styles.totalSubLabel}>할인 금액</Text>
              <Text style={styles.totalSubValue}>-{formatNumber(invoice.discount)}원 ({Math.round(invoice.discountRate * 100)}%)</Text>
            </View>
          </View>

          {/* 단가 설정 섹션 */}
          <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>⚙️ 단가 및 할인 설정</Text>

            {/* 전역 자재 단가 */}
            <View style={styles.inputGroup}>
              <Text style={[styles.inputLabel, { color: colors.muted }]}>자재 단가 (평균)</Text>
              <View style={styles.inputRow}>
                <TextInput
                  style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background }]}
                  value={materialCostText}
                  onChangeText={setMaterialCostText}
                  onBlur={handleMaterialCostBlur}
                  keyboardType="numeric"
                  returnKeyType="done"
                />
                <Text style={[styles.inputUnit, { color: colors.muted }]}>원/m</Text>
              </View>
            </View>

            {/* 전역 시공 단가 슬라이더 */}
            <View style={styles.inputGroup}>
              <Text style={[styles.inputLabel, { color: colors.muted }]}>전역 시공비 단가</Text>
              <SimpleSlider
                value={constructionPrice}
                min={CONSTRUCTION_PRICE_MIN}
                max={CONSTRUCTION_PRICE_MAX}
                step={500}
                onValueChange={handleConstructionChange}
                colors={colors}
              />
            </View>

            {/* 할인 설정 */}
            <View style={styles.inputGroup}>
              <View style={styles.discountHeader}>
                <Text style={[styles.inputLabel, { color: colors.muted }]}>할인 적용</Text>
                <TouchableOpacity
                  style={[styles.toggle, { backgroundColor: discountEnabled ? colors.primary : colors.border }]}
                  onPress={handleDiscountToggle}
                >
                  <View style={[styles.toggleThumb, { transform: [{ translateX: discountEnabled ? 20 : 2 }] }]} />
                </TouchableOpacity>
              </View>

              {discountEnabled && (
                <View style={styles.discountInputRow}>
                  <TextInput
                    style={[styles.input, { flex: 1, color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background }]}
                    value={discountRateText}
                    onChangeText={setDiscountRateText}
                    onBlur={handleDiscountRateBlur}
                    placeholder={`${Math.round(autoDiscountRate * 100)}`}
                    keyboardType="numeric"
                    maxLength={2}
                  />
                  <Text style={[styles.inputUnit, { color: colors.muted }]}>% 할인</Text>
                  <TouchableOpacity style={styles.resetBtn} onPress={handleResetDiscount}>
                    <Text style={{ color: colors.primary, fontSize: 12, fontWeight: "600" }}>초기화</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          </View>

          {/* 그룹별 개별 시공비 설정 섹션 */}
          <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>🎨 그룹별 개별 시공 단가</Text>
            <Text style={[styles.sectionHint, { color: colors.muted }]}>
              특정 품목만 시공비를 다르게 책정해야 할 때 사용하세요.
            </Text>
            <View style={styles.groupList}>
              {invoice.groupInvoices.map((gi, idx) => (
                <View key={gi.groupId} style={[styles.groupItem, idx !== 0 && { borderTopWidth: 1, borderTopColor: colors.border + "40", paddingTop: 12 }]}>
                  <View style={styles.groupInfo}>
                    <View style={[styles.groupBadge, { backgroundColor: GROUP_COLORS[idx % GROUP_COLORS.length] }]}>
                      <Text style={styles.groupBadgeText}>{gi.groupName}</Text>
                    </View>
                    <Text style={[styles.groupSubText, { color: colors.muted }]}>
                      {gi.brand} {gi.filmName} ({gi.filmAreaM2.toFixed(2)}m²)
                    </Text>
                  </View>
                  <GroupConstructionPriceInput
                    groupId={gi.groupId}
                    groupName={gi.groupName}
                    globalConstructionPrice={constructionPrice}
                    groupConstructionPrice={gi.constructionPricePerM2 !== constructionPrice ? gi.constructionPricePerM2 : undefined}
                    borderColor={GROUP_BORDER_COLORS[idx % GROUP_BORDER_COLORS.length]}
                    colors={colors}
                    onChangeGroupPrice={handleGroupConstructionPriceChange}
                  />
                </View>
              ))}
            </View>
          </View>

          {/* 상세 항목 리스트 섹션 (추가된 기능) */}
          <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>📋 상세 항목 리스트</Text>
            <View style={styles.tableContainer}>
              <View style={[styles.tableHeader, { backgroundColor: colors.background }]}>
                <Text style={[styles.tableHeaderText, { flex: 2, color: colors.muted }]}>품목/규격</Text>
                <Text style={[styles.tableHeaderText, { flex: 1, textAlign: "right", color: colors.muted }]}>수량</Text>
                <Text style={[styles.tableHeaderText, { flex: 1.5, textAlign: "right", color: colors.muted }]}>단가</Text>
                <Text style={[styles.tableHeaderText, { flex: 1.5, textAlign: "right", color: colors.muted }]}>합계</Text>
              </View>
              {invoice.groupInvoices.map((gi, idx) => (
                <View key={gi.groupId} style={[styles.tableRow, { borderBottomColor: colors.border + "40" }]}>
                  <View style={{ flex: 2 }}>
                    <Text style={[styles.tableRowTitle, { color: colors.foreground }]} numberOfLines={1}>
                      {gi.groupName}
                    </Text>
                    <Text style={[styles.tableRowSub, { color: colors.muted }]} numberOfLines={1}>
                      {gi.brand} {gi.filmName}
                    </Text>
                  </View>
                  <Text style={[styles.tableRowText, { flex: 1, textAlign: "right", color: colors.foreground }]}>
                    {formatM(gi.filmLengthM)}m
                  </Text>
                  <View style={{ flex: 1.5, alignItems: "flex-end" }}>
                    <Text style={[styles.tableRowText, { color: colors.foreground }]}>
                      {formatNumber(gi.materialCostPerM)}
                    </Text>
                    <Text style={[styles.tableRowSub, { color: colors.muted }]}>
                      {formatNumber(gi.constructionPricePerM2)}/m²
                    </Text>
                  </View>
                  <Text style={[styles.tableRowText, { flex: 1.5, textAlign: "right", fontWeight: "700", color: colors.foreground }]}>
                    {formatNumber(gi.materialCost + gi.constructionCost)}
                  </Text>
                </View>
              ))}
              <View style={styles.tableFooter}>
                <View style={styles.footerRow}>
                  <Text style={[styles.footerLabel, { color: colors.muted }]}>자재비 합계</Text>
                  <Text style={[styles.footerValue, { color: colors.foreground }]}>{formatNumber(invoice.totalMaterialCost)}원</Text>
                </View>
                <View style={styles.footerRow}>
                  <Text style={[styles.footerLabel, { color: colors.muted }]}>시공비 합계</Text>
                  <Text style={[styles.footerValue, { color: colors.foreground }]}>{formatNumber(invoice.totalConstructionCost)}원</Text>
                </View>
                <View style={[styles.footerRow, { marginTop: 4, paddingTop: 8, borderTopWidth: 1, borderTopColor: colors.border }]}>
                  <Text style={[styles.footerLabel, { color: colors.foreground, fontWeight: "bold" }]}>총 합계 (세전)</Text>
                  <Text style={[styles.footerValue, { color: colors.primary, fontWeight: "900", fontSize: 16 }]}>{formatNumber(invoice.subtotal)}원</Text>
                </View>
              </View>
            </View>
          </View>

          {/* 공유 버튼 섹션 */}
          <View style={styles.actionRow}>
            <TouchableOpacity
              style={[styles.shareBtn, { backgroundColor: colors.surface, borderColor: colors.primary, borderWidth: 1.5 }]}
              onPress={handleShare}
            >
              <Text style={[styles.shareBtnText, { color: colors.primary }]}>💬 텍스트 공유</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.shareBtn, { backgroundColor: colors.primary }]}
              onPress={handleSharePDF}
            >
              <Text style={[styles.shareBtnText, { color: "white" }]}>📄 PDF 견적서</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.infoBox}>
            <Text style={[styles.infoText, { color: colors.muted }]}>
              • 위 금액은 부가세(VAT) 별도 금액입니다.{"\n"}
              • 시공비 단가는 면적(m²) 기준으로 계산됩니다.{"\n"}
              • '설정' 탭에서 업체 정보를 입력하면 견적서에 포함됩니다.
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 20 },
  headerTitle: { fontSize: 24, fontWeight: "bold", color: "white" },
  scrollContent: { padding: 16, gap: 16, paddingBottom: 40 },
  emptyContainer: { flex: 1, justifyContent: "center", alignItems: "center", padding: 40, gap: 20 },
  emptyText: { fontSize: 15, textAlign: "center", lineHeight: 22 },
  emptyBtn: { paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12 },
  emptyBtnText: { color: "white", fontWeight: "bold" },
  totalCard: { padding: 24, borderRadius: 20, gap: 4, elevation: 4, shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8 },
  totalLabel: { color: "rgba(255,255,255,0.8)", fontSize: 13, fontWeight: "600" },
  totalAmount: { color: "white", fontSize: 32, fontWeight: "900" },
  totalDivider: { height: 1, backgroundColor: "rgba(255,255,255,0.2)", marginVertical: 12 },
  totalRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  totalSubLabel: { color: "rgba(255,255,255,0.7)", fontSize: 12 },
  totalSubValue: { color: "white", fontSize: 14, fontWeight: "700" },
  section: { padding: 20, borderRadius: 16, borderWidth: 1, gap: 16 },
  sectionTitle: { fontSize: 17, fontWeight: "bold" },
  sectionHint: { fontSize: 12, marginTop: -8, lineHeight: 16 },
  inputGroup: { gap: 8 },
  inputLabel: { fontSize: 12, fontWeight: "700" },
  inputRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  input: { flex: 1, height: 44, borderWidth: 1.5, borderRadius: 10, paddingHorizontal: 12, fontSize: 16, fontWeight: "600" },
  inputUnit: { fontSize: 14, fontWeight: "600" },
  discountHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  toggle: { width: 44, height: 24, borderRadius: 12, justifyContent: "center" },
  toggleThumb: { width: 20, height: 20, borderRadius: 10, backgroundColor: "white" },
  discountInputRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 4 },
  resetBtn: { padding: 8 },
  groupList: { gap: 16 },
  groupItem: { gap: 12 },
  groupInfo: { flexDirection: "row", alignItems: "center", gap: 8 },
  groupBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  groupBadgeText: { color: "white", fontSize: 11, fontWeight: "bold" },
  groupSubText: { fontSize: 11 },
  tableContainer: { marginTop: 4, borderWidth: 1, borderColor: "rgba(0,0,0,0.05)", borderRadius: 12, overflow: "hidden" },
  tableHeader: { flexDirection: "row", padding: 10, borderBottomWidth: 1, borderBottomColor: "rgba(0,0,0,0.05)" },
  tableHeaderText: { fontSize: 11, fontWeight: "bold" },
  tableRow: { flexDirection: "row", padding: 12, borderBottomWidth: 1, alignItems: "center" },
  tableRowTitle: { fontSize: 13, fontWeight: "bold" },
  tableRowSub: { fontSize: 10, marginTop: 2 },
  tableRowText: { fontSize: 12 },
  tableFooter: { padding: 16, backgroundColor: "rgba(0,0,0,0.02)", gap: 6 },
  footerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  footerLabel: { fontSize: 12 },
  footerValue: { fontSize: 13, fontWeight: "600" },
  actionRow: { flexDirection: "row", gap: 12, marginTop: 8 },
  shareBtn: { flex: 1, height: 54, borderRadius: 14, justifyContent: "center", alignItems: "center" },
  shareBtnText: { fontSize: 15, fontWeight: "bold" },
  infoBox: { padding: 16, borderRadius: 12, backgroundColor: "rgba(0,0,0,0.03)" },
  infoText: { fontSize: 12, lineHeight: 18 },
});
