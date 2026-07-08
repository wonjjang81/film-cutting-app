import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  ActivityIndicator,
  Alert,
} from "react-native";
import { router } from "expo-router";
import { useAuth } from "@/hooks/use-auth";
import { useAuth as useGuestAuth } from "@/app/contexts/AuthContext";
import { useColors } from "@/hooks/use-colors";
import { ScreenContainer } from "@/components/screen-container";

type LoginMode = "accessCode" | "guestDuration" | "admin";

export default function LoginScreen() {
  const colors = useColors();
  const { user, isAuthenticated, loading } = useAuth();
  const {
    validateAccessCode,
    loginAsGuest,
    isLoading: guestLoading,
    error: guestError,
    guestSession,
    accessCodeValidated,
  } = useGuestAuth();

  const [loginMode, setLoginMode] = useState<LoginMode>("accessCode");
  const [accessCode, setAccessCode] = useState("");
  const [accessCodeError, setAccessCodeError] = useState<string | null>(null);
  const [selectedDuration, setSelectedDuration] = useState<number>(1440);
  const [adminPassword, setAdminPassword] = useState("");
  const [adminError, setAdminError] = useState<string | null>(null);
  const [isAdminAuthenticated, setIsAdminAuthenticated] = useState(false);

  const ADMIN_PASSWORD = "won81";

  const durationOptions = [
    { label: "1시간", value: 60 },
    { label: "6시간", value: 360 },
    { label: "24시간", value: 1440 },
    { label: "7일", value: 10080 },
  ];

  useEffect(() => {
    if (isAuthenticated && user) {
      router.push("/(tabs)/index");
    }
  }, [isAuthenticated, user]);

  useEffect(() => {
    if (guestSession && !guestLoading) {
      router.push("/(tabs)/input");
    }
  }, [guestSession, guestLoading]);

  useEffect(() => {
    if (accessCodeValidated && !guestLoading) {
      setLoginMode("guestDuration");
    }
  }, [accessCodeValidated, guestLoading]);

  const handleValidateAccessCode = async () => {
    if (!accessCode.trim()) {
      setAccessCodeError("접속코드를 입력해주세요.");
      return;
    }

    if (accessCode.trim().length < 6) {
      setAccessCodeError("접속코드는 최소 6자 이상이어야 합니다.");
      return;
    }

    setAccessCodeError(null);
    await validateAccessCode(accessCode.trim());
  };

  const handleGuestLogin = async () => {
    await loginAsGuest(selectedDuration);
  };

  const handleAdminLogin = () => {
    const trimmedPassword = adminPassword.trim();
    if (trimmedPassword === ADMIN_PASSWORD) {
      setIsAdminAuthenticated(true);
      setAdminPassword("");
      setAdminError(null);
    } else {
      setAdminError(`비밀번호가 일치하지 않습니다. (입력: ${trimmedPassword.length}자)`);
      setAdminPassword("");
    }
  };

  const handleAdminLogout = () => {
    setIsAdminAuthenticated(false);
    setLoginMode("admin");
  };

  const formatDuration = (minutes: number): string => {
    if (minutes < 60) return `${minutes}분`;
    if (minutes < 1440) return `${Math.floor(minutes / 60)}시간`;
    return `${Math.floor(minutes / 1440)}일`;
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

  return (
    <ScreenContainer containerClassName="bg-background">
      <ScrollView style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.content}>
          <View style={styles.header}>
            <Text style={[styles.title, { color: colors.foreground }]}>
              필름 재단 계산기
            </Text>
            <Text style={[styles.subtitle, { color: colors.muted }]}>
              로그인
            </Text>
          </View>

          <View
            style={[
              styles.modeSelector,
              { backgroundColor: colors.surface, borderColor: colors.border },
            ]}
          >
            <TouchableOpacity
              style={[
                styles.modeTab,
                {
                  backgroundColor:
                    loginMode === "accessCode"
                      ? colors.primary
                      : colors.background,
                  borderBottomColor:
                    loginMode === "accessCode" ? colors.primary : colors.border,
                },
              ]}
              onPress={() => {
                setLoginMode("accessCode");
                setAccessCodeError(null);
              }}
            >
              <Text
                style={[
                  styles.modeTabText,
                  {
                    color:
                      loginMode === "accessCode"
                        ? "#fff"
                        : colors.foreground,
                    fontWeight:
                      loginMode === "accessCode" ? "600" : "500",
                  },
                ]}
              >
                게스트
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.modeTab,
                {
                  backgroundColor:
                    loginMode === "admin"
                      ? colors.primary
                      : colors.background,
                  borderBottomColor:
                    loginMode === "admin" ? colors.primary : colors.border,
                },
              ]}
              onPress={() => {
                setLoginMode("admin");
                setAdminError(null);
              }}
            >
              <Text
                style={[
                  styles.modeTabText,
                  {
                    color:
                      loginMode === "admin"
                        ? "#fff"
                        : colors.foreground,
                    fontWeight:
                      loginMode === "admin" ? "600" : "500",
                  },
                ]}
              >
                관리자
              </Text>
            </TouchableOpacity>
          </View>

          {/* Guest Login Mode */}
          {loginMode === "accessCode" && (
            <View>
              {!accessCodeValidated && (
                <View
                  style={[
                    styles.section,
                    { backgroundColor: colors.surface, borderColor: colors.border },
                  ]}
                >
                  <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
                    1단계: 접속코드 입력
                  </Text>
                  <Text style={[styles.description, { color: colors.muted }]}>
                    관리자로부터 받은 접속코드를 입력하세요.
                  </Text>

                  <TextInput
                    style={[
                      styles.input,
                      {
                        borderColor:
                          accessCodeError || guestError
                            ? colors.error
                            : colors.border,
                        color: colors.foreground,
                        backgroundColor: colors.background,
                      },
                    ]}
                    placeholder="접속코드 입력 (예: ABC123XYZ789)"
                    placeholderTextColor={colors.muted}
                    value={accessCode}
                    onChangeText={(text) => {
                      setAccessCode(text);
                      setAccessCodeError(null);
                    }}
                    editable={!guestLoading}
                    autoCapitalize="characters"
                    maxLength={32}
                  />

                  {(accessCodeError || guestError) && (
                    <View
                      style={[
                        styles.errorContainer,
                        { backgroundColor: colors.error + "15" },
                      ]}
                    >
                      <Text style={[styles.errorText, { color: colors.error }]}>
                        ⚠️ {accessCodeError || guestError}
                      </Text>
                    </View>
                  )}

                  <TouchableOpacity
                    style={[
                      styles.button,
                      {
                        backgroundColor: colors.primary,
                        opacity: guestLoading || !accessCode.trim() ? 0.6 : 1,
                      },
                    ]}
                    onPress={handleValidateAccessCode}
                    disabled={guestLoading || !accessCode.trim()}
                  >
                    {guestLoading ? (
                      <ActivityIndicator color="white" size="small" />
                    ) : (
                      <Text style={styles.buttonText}>접속코드 검증</Text>
                    )}
                  </TouchableOpacity>
                </View>
              )}

              {accessCodeValidated && (
                <View
                  style={[
                    styles.section,
                    { backgroundColor: colors.surface, borderColor: colors.border },
                  ]}
                >
                  <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
                    2단계: 세션 기간 선택
                  </Text>
                  <Text style={[styles.description, { color: colors.muted }]}>
                    게스트 계정의 유효 기간을 선택하세요.
                  </Text>

                  <View style={styles.optionsContainer}>
                    {durationOptions.map((option) => (
                      <TouchableOpacity
                        key={option.value}
                        style={[
                          styles.optionButton,
                          {
                            borderColor:
                              selectedDuration === option.value
                                ? colors.primary
                                : colors.border,
                            backgroundColor:
                              selectedDuration === option.value
                                ? colors.primary + "08"
                                : colors.background,
                          },
                        ]}
                        onPress={() => setSelectedDuration(option.value)}
                      >
                        <Text
                          style={[
                            styles.optionText,
                            {
                              color:
                                selectedDuration === option.value
                                  ? colors.primary
                                  : colors.foreground,
                              fontWeight:
                                selectedDuration === option.value
                                  ? "600"
                                  : "500",
                            },
                          ]}
                        >
                          {option.label}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  <View
                    style={[
                      styles.durationInfo,
                      { backgroundColor: colors.primary + "12" },
                    ]}
                  >
                    <Text style={[styles.durationInfoText, { color: colors.primary }]}>
                      ✓ 선택된 기간: {formatDuration(selectedDuration)}
                    </Text>
                  </View>

                  <TouchableOpacity
                    style={[
                      styles.button,
                      {
                        backgroundColor: colors.primary,
                        opacity: guestLoading ? 0.6 : 1,
                      },
                    ]}
                    onPress={handleGuestLogin}
                    disabled={guestLoading}
                  >
                    {guestLoading ? (
                      <ActivityIndicator color="white" size="small" />
                    ) : (
                      <Text style={styles.buttonText}>게스트로 시작</Text>
                    )}
                  </TouchableOpacity>
                </View>
              )}

              {!accessCodeValidated && (
                <>
                  <View
                    style={[
                      styles.infoContainer,
                      {
                        backgroundColor: colors.primary + "12",
                        borderLeftColor: colors.primary,
                      },
                    ]}
                  >
                    <Text style={[styles.infoTitle, { color: colors.primary }]}>
                      💡 게스트 로그인 안내
                    </Text>
                    <Text style={[styles.infoText, { color: colors.foreground }]}>
                      • 접속코드는 관리자만 발행할 수 있습니다.{"\n"}
                      • 한 번 사용한 코드도 다시 사용할 수 있습니다.{"\n"}
                      • 기간 만료 후 데이터는 자동 삭제됩니다.
                    </Text>
                  </View>

                  <View
                    style={[
                      styles.featuresContainer,
                      { backgroundColor: colors.surface, borderColor: colors.border },
                    ]}
                  >
                    <Text style={[styles.featureTitle, { color: colors.foreground }]}>
                      ✨ 이용 가능한 기능
                    </Text>
                    <View style={styles.featureList}>
                      <Text style={[styles.featureItem, { color: colors.foreground }]}>
                        • 조각 치수 입력 및 관리
                      </Text>
                      <Text style={[styles.featureItem, { color: colors.foreground }]}>
                        • 자동 배치 계산 및 시각화
                      </Text>
                      <Text style={[styles.featureItem, { color: colors.foreground }]}>
                        • 견적서 생성 및 공유
                      </Text>
                      <Text style={[styles.featureItem, { color: colors.foreground }]}>
                        • PDF 및 JSON 파일 내보내기
                      </Text>
                    </View>
                  </View>
                </>
              )}
            </View>
          )}

          {/* Admin Login Mode */}
          {loginMode === "admin" && !isAdminAuthenticated && (
            <View
              style={[
                styles.section,
                { backgroundColor: colors.surface, borderColor: colors.border },
              ]}
            >
              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
                관리자 로그인
              </Text>
              <Text style={[styles.description, { color: colors.muted }]}>
                관리자 비밀번호를 입력하여 접속코드를 관리하세요.
              </Text>

              <TextInput
                style={[
                  styles.input,
                  {
                    borderColor: adminError ? colors.error : colors.border,
                    color: colors.foreground,
                    backgroundColor: colors.background,
                  },
                ]}
                placeholder="관리자 비밀번호"
                placeholderTextColor={colors.muted}
                secureTextEntry
                value={adminPassword}
                onChangeText={(text) => {
                  setAdminPassword(text);
                  setAdminError(null);
                }}
              />

              {adminError && (
                <View
                  style={[
                    styles.errorContainer,
                    { backgroundColor: colors.error + "15" },
                  ]}
                >
                  <Text style={[styles.errorText, { color: colors.error }]}>
                    ⚠️ {adminError}
                  </Text>
                </View>
              )}

              <TouchableOpacity
                style={[styles.button, { backgroundColor: colors.primary }]}
                onPress={handleAdminLogin}
              >
                <Text style={styles.buttonText}>로그인</Text>
              </TouchableOpacity>

              <View
                style={[
                  styles.infoContainer,
                  {
                    backgroundColor: colors.warning + "12",
                    borderLeftColor: colors.warning,
                  },
                ]}
              >
                <Text style={[styles.infoTitle, { color: colors.warning }]}>
                  🔐 관리자 기능
                </Text>
                <Text style={[styles.infoText, { color: colors.foreground }]}>
                  • 새로운 접속코드 생성{"\n"}
                  • 기존 코드 수정 및 삭제{"\n"}
                  • 사용 현황 통계 조회{"\n"}
                  • 코드 활성/비활성 관리
                </Text>
              </View>
            </View>
          )}

          {/* Admin Dashboard Mode */}
          {loginMode === "admin" && isAdminAuthenticated && (
            <View>
              <View
                style={[
                  styles.section,
                  { backgroundColor: colors.surface, borderColor: colors.border },
                ]}
              >
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                  <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
                    관리자 대시보드
                  </Text>
                  <TouchableOpacity
                    style={{
                      paddingHorizontal: 12,
                      paddingVertical: 6,
                      backgroundColor: colors.error,
                      borderRadius: 6,
                    }}
                    onPress={handleAdminLogout}
                  >
                    <Text style={{ color: "#fff", fontSize: 12, fontWeight: "600" }}>
                      로그아웃
                    </Text>
                  </TouchableOpacity>
                </View>

                <View
                  style={[
                    styles.infoContainer,
                    {
                      backgroundColor: colors.primary + "12",
                      borderLeftColor: colors.primary,
                    },
                  ]}
                >
                  <Text style={[styles.infoTitle, { color: colors.primary }]}>
                    👨‍💼 관리자 모드 활성화됨
                  </Text>
                  <Text style={[styles.infoText, { color: colors.foreground }]}>
                    • 새로운 접속코드 생성{"\n"}
                    • 기존 코드 수정 및 삭제{"\n"}
                    • 사용 현황 통계 조회{"\n"}
                    • 코드 활성/비활성 관리
                  </Text>
                </View>

                <TouchableOpacity
                  style={[styles.button, { backgroundColor: colors.primary, marginTop: 16 }]}
                  onPress={() => router.push("/(tabs)/admin")}
                >
                  <Text style={styles.buttonText}>관리자 대시보드 열기</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 20, paddingBottom: 40 },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  header: { marginBottom: 24, marginTop: 20 },
  title: { fontSize: 28, fontWeight: "bold", marginBottom: 8 },
  subtitle: { fontSize: 16 },
  modeSelector: { flexDirection: "row", borderWidth: 1, borderRadius: 12, marginBottom: 24, overflow: "hidden" },
  modeTab: { flex: 1, paddingVertical: 12, alignItems: "center", borderBottomWidth: 3 },
  modeTabText: { fontSize: 14 },
  section: { borderWidth: 1, borderRadius: 12, padding: 16, marginBottom: 20 },
  sectionTitle: { fontSize: 16, fontWeight: "600", marginBottom: 8 },
  description: { fontSize: 14, marginBottom: 16, lineHeight: 20 },
  input: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 12, fontSize: 14, marginBottom: 12 },
  errorContainer: { padding: 12, borderRadius: 8, marginBottom: 16, borderLeftWidth: 4 },
  errorText: { fontSize: 14, fontWeight: "500" },
  button: { paddingVertical: 14, borderRadius: 8, alignItems: "center" },
  buttonText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  optionsContainer: { gap: 10, marginBottom: 12 },
  optionButton: { paddingVertical: 12, paddingHorizontal: 16, borderRadius: 8, borderWidth: 2 },
  optionText: { fontSize: 15 },
  durationInfo: { paddingVertical: 10, paddingHorizontal: 12, borderRadius: 6, marginBottom: 16 },
  durationInfoText: { fontSize: 13, fontWeight: "600" },
  infoContainer: { padding: 16, borderRadius: 8, borderLeftWidth: 4, marginBottom: 20 },
  infoTitle: { fontSize: 14, fontWeight: "600", marginBottom: 8 },
  infoText: { fontSize: 13, lineHeight: 20 },
  featuresContainer: { padding: 16, borderRadius: 8, borderWidth: 1 },
  featureTitle: { fontSize: 14, fontWeight: "600", marginBottom: 12 },
  featureList: { gap: 8 },
  featureItem: { fontSize: 13, lineHeight: 18 },
});
