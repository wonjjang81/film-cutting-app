import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";

import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";

// ─── 업체 정보 타입 ───────────────────────────────────────────

export interface CompanyInfo {
  companyName: string;   // 업체명
  managerName: string;   // 담당자 이름
  phone: string;         // 연락처
  email: string;         // 이메일
  address: string;       // 주소
  note: string;          // 비고 (한 줄 메모)
}

export const COMPANY_INFO_KEY = "@film_company_info";

export const DEFAULT_COMPANY_INFO: CompanyInfo = {
  companyName: "",
  managerName: "",
  phone: "",
  email: "",
  address: "",
  note: "",
};

export async function loadCompanyInfo(): Promise<CompanyInfo> {
  try {
    const raw = await AsyncStorage.getItem(COMPANY_INFO_KEY);
    if (raw) return { ...DEFAULT_COMPANY_INFO, ...JSON.parse(raw) };
  } catch {}
  return DEFAULT_COMPANY_INFO;
}

export async function saveCompanyInfo(info: CompanyInfo): Promise<void> {
  await AsyncStorage.setItem(COMPANY_INFO_KEY, JSON.stringify(info));
}

// ─── 입력 필드 컴포넌트 ───────────────────────────────────────

interface FieldProps {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  onBlur?: () => void;
  placeholder?: string;
  keyboardType?: "default" | "phone-pad" | "email-address";
  multiline?: boolean;
  colors: ReturnType<typeof useColors>;
}

function Field({ label, value, onChangeText, onBlur, placeholder, keyboardType = "default", multiline = false, colors }: FieldProps) {
  return (
    <View style={fieldStyles.container}>
      <Text style={[fieldStyles.label, { color: colors.muted }]}>{label}</Text>
      <TextInput
        style={[
          fieldStyles.input,
          multiline && fieldStyles.multilineInput,
          { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background },
        ]}
        value={value}
        onChangeText={onChangeText}
        onBlur={onBlur}
        placeholder={placeholder}
        placeholderTextColor={colors.muted + "80"}
        keyboardType={keyboardType}
        returnKeyType={multiline ? "default" : "done"}
        multiline={multiline}
        numberOfLines={multiline ? 3 : 1}
      />
    </View>
  );
}

const fieldStyles = StyleSheet.create({
  container: { gap: 6 },
  label: { fontSize: 12, fontWeight: "600", letterSpacing: 0.3 },
  input: {
    borderWidth: 1.5,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: 15,
    lineHeight: 20,
  },
  multilineInput: {
    minHeight: 72,
    textAlignVertical: "top",
    paddingTop: 11,
  },
});

// ─── 설정 화면 ────────────────────────────────────────────────

export default function SettingsScreen() {
  const colors = useColors();
  const [info, setInfo] = useState<CompanyInfo>(DEFAULT_COMPANY_INFO);
  const [saved, setSaved] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 앱 시작 시 저장된 정보 불러오기
  useEffect(() => {
    loadCompanyInfo().then(setInfo);
  }, []);

  // 자동 저장 (입력 후 1초 뒤)
  const autoSave = useCallback((newInfo: CompanyInfo) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      await saveCompanyInfo(newInfo);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    }, 800);
  }, []);

  const update = useCallback((field: keyof CompanyInfo, value: string) => {
    setInfo((prev) => {
      const next = { ...prev, [field]: value };
      autoSave(next);
      return next;
    });
  }, [autoSave]);

  const handleSaveNow = useCallback(async () => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    await saveCompanyInfo(info);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }, [info]);

  const handleReset = useCallback(() => {
    const doReset = async () => {
      const blank = DEFAULT_COMPANY_INFO;
      setInfo(blank);
      await saveCompanyInfo(blank);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    };
    if (Platform.OS === "web") {
      if (window.confirm("업체 정보를 모두 초기화하시겠습니까?")) doReset();
    } else {
      Alert.alert("초기화", "업체 정보를 모두 초기화하시겠습니까?", [
        { text: "취소", style: "cancel" },
        { text: "초기화", style: "destructive", onPress: doReset },
      ]);
    }
  }, [info]);

  const isAnyFilled = Object.values(info).some((v) => v.trim() !== "");

  return (
    <ScreenContainer containerClassName="bg-background">
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        {/* 헤더 */}
        <View style={[styles.header, { backgroundColor: colors.primary }]}>
          <Text style={styles.headerTitle}>설정</Text>
        </View>

        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>

          {/* 업체 정보 섹션 */}
          <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={styles.sectionTitleRow}>
              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>업체 정보</Text>
              {saved && (
                <View style={[styles.savedBadge, { backgroundColor: colors.success + "20", borderColor: colors.success + "40" }]}>
                  <Text style={[styles.savedBadgeText, { color: colors.success }]}>✓ 저장됨</Text>
                </View>
              )}
            </View>
            <Text style={[styles.sectionHint, { color: colors.muted }]}>
              입력한 정보는 견적서 공유 시 자동으로 포함됩니다.
            </Text>

            <Field
              label="업체명"
              value={info.companyName}
              onChangeText={(v) => update("companyName", v)}
              placeholder="예) 홍길동 필름 시공"
              colors={colors}
            />
            <Field
              label="담당자 이름"
              value={info.managerName}
              onChangeText={(v) => update("managerName", v)}
              placeholder="예) 홍길동"
              colors={colors}
            />
            <Field
              label="연락처"
              value={info.phone}
              onChangeText={(v) => update("phone", v)}
              placeholder="예) 010-1234-5678"
              keyboardType="phone-pad"
              colors={colors}
            />
            <Field
              label="이메일"
              value={info.email}
              onChangeText={(v) => update("email", v)}
              placeholder="예) example@email.com"
              keyboardType="email-address"
              colors={colors}
            />
            <Field
              label="주소"
              value={info.address}
              onChangeText={(v) => update("address", v)}
              placeholder="예) 서울시 강남구 ..."
              colors={colors}
            />
            <Field
              label="비고 (견적서 하단 메모)"
              value={info.note}
              onChangeText={(v) => update("note", v)}
              placeholder="예) VAT 별도 / 출장비 협의 가능"
              multiline
              colors={colors}
            />
          </View>

          {/* 미리보기 */}
          {isAnyFilled && (
            <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>견적서 미리보기</Text>
              <View style={[styles.previewBox, { backgroundColor: colors.background, borderColor: colors.border }]}>
                <Text style={[styles.previewLine, { color: colors.muted }]}>─────────────────</Text>
                {info.companyName ? <Text style={[styles.previewText, { color: colors.foreground }]}>🏢 {info.companyName}</Text> : null}
                {info.managerName ? <Text style={[styles.previewText, { color: colors.foreground }]}>👤 담당자: {info.managerName}</Text> : null}
                {info.phone ? <Text style={[styles.previewText, { color: colors.foreground }]}>📞 {info.phone}</Text> : null}
                {info.email ? <Text style={[styles.previewText, { color: colors.foreground }]}>✉️ {info.email}</Text> : null}
                {info.address ? <Text style={[styles.previewText, { color: colors.foreground }]}>📍 {info.address}</Text> : null}
                {info.note ? (
                  <>
                    <Text style={[styles.previewLine, { color: colors.muted }]}>─────────────────</Text>
                    <Text style={[styles.previewNote, { color: colors.muted }]}>{info.note}</Text>
                  </>
                ) : null}
              </View>
            </View>
          )}

          {/* 버튼 영역 */}
          <View style={styles.btnRow}>
            <TouchableOpacity
              style={[styles.saveBtn, { backgroundColor: colors.primary }]}
              onPress={handleSaveNow}
            >
              <Text style={styles.saveBtnText}>💾 저장하기</Text>
            </TouchableOpacity>
            {isAnyFilled && (
              <TouchableOpacity
                style={[styles.resetBtn, { borderColor: colors.error + "60" }]}
                onPress={handleReset}
              >
                <Text style={[styles.resetBtnText, { color: colors.error }]}>초기화</Text>
              </TouchableOpacity>
            )}
          </View>

          <View style={{ height: 32 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </ScreenContainer>
  );
}

// ─── 스타일 ──────────────────────────────────────────────────

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: 16,
    paddingVertical: 16,
    alignItems: "center",
  },
  headerTitle: {
    color: "white",
    fontSize: 18,
    fontWeight: "700",
  },
  scrollContent: {
    padding: 16,
    gap: 14,
  },
  section: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 16,
    gap: 14,
  },
  sectionTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: "700",
    flex: 1,
  },
  sectionHint: {
    fontSize: 12,
    lineHeight: 17,
    marginTop: -6,
  },
  savedBadge: {
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  savedBadgeText: {
    fontSize: 11,
    fontWeight: "600",
  },
  previewBox: {
    borderRadius: 10,
    borderWidth: 1,
    padding: 14,
    gap: 5,
  },
  previewLine: {
    fontSize: 11,
  },
  previewText: {
    fontSize: 13,
    lineHeight: 20,
  },
  previewNote: {
    fontSize: 12,
    lineHeight: 18,
    fontStyle: "italic",
  },
  btnRow: {
    flexDirection: "row",
    gap: 10,
  },
  saveBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
  },
  saveBtnText: {
    color: "white",
    fontSize: 16,
    fontWeight: "700",
  },
  resetBtn: {
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  resetBtnText: {
    fontSize: 14,
    fontWeight: "600",
  },
});
