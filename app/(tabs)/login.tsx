import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { router } from "expo-router";
import { useAuth } from "@/app/contexts/AuthContext";
import { useColors } from "@/hooks/use-colors";
import { ScreenContainer } from "@/components/screen-container";

export default function LoginScreen() {
  const colors = useColors();
  const { loginAsGuest, isLoading, error, guestSession } = useAuth();
  const [selectedDuration, setSelectedDuration] = useState<number>(1440); // 24 hours default

  const durationOptions = [
    { label: "1시간", value: 60 },
    { label: "6시간", value: 360 },
    { label: "24시간", value: 1440 },
    { label: "7일", value: 10080 },
  ];

  // Redirect if already logged in
  useEffect(() => {
    if (guestSession && !isLoading) {
      router.push("/(tabs)/input");
    }
  }, [guestSession, isLoading]);

  const handleGuestLogin = async () => {
    await loginAsGuest(selectedDuration);
  };

  const formatDuration = (minutes: number): string => {
    if (minutes < 60) return `${minutes}분`;
    if (minutes < 1440) return `${Math.floor(minutes / 60)}시간`;
    return `${Math.floor(minutes / 1440)}일`;
  };

  return (
    <ScreenContainer containerClassName="bg-background">
      <ScrollView style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.content}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={[styles.title, { color: colors.foreground }]}>
              필름 재단 계산기
            </Text>
            <Text style={[styles.subtitle, { color: colors.muted }]}>
              게스트로 시작하기
            </Text>
          </View>

          {/* Duration Selection */}
          <View
            style={[
              styles.section,
              { backgroundColor: colors.surface, borderColor: colors.border },
            ]}
          >
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
              세션 기간 선택
            </Text>
            <Text style={[styles.description, { color: colors.muted }]}>
              게스트 계정의 유효 기간을 선택하세요. 기간이 만료되면 다시 로그인해야 합니다.
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
                          selectedDuration === option.value ? "600" : "500",
                      },
                    ]}
                  >
                    {option.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Selected Duration Info */}
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
          </View>

          {/* Warning Section */}
          <View
            style={[
              styles.section,
              { backgroundColor: colors.surface, borderColor: colors.border },
            ]}
          >
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
              주의사항
            </Text>
            <Text style={[styles.warningText, { color: colors.warning }]}>
              • 게스트 계정은 임시 계정입니다.{"\n"}
              • 기간 만료 후 데이터는 자동 삭제됩니다.{"\n"}
              • 중요한 데이터는 PDF로 내보내기를 권장합니다.{"\n"}
              • 앱을 종료했다가 다시 열어도 세션이 유지됩니다. (기간 내에서)
            </Text>
          </View>

          {/* Error Message */}
          {error && (
            <View
              style={[
                styles.errorContainer,
                { backgroundColor: colors.error + "15" },
              ]}
            >
              <Text style={[styles.errorText, { color: colors.error }]}>
                ⚠️ {error}
              </Text>
            </View>
          )}

          {/* Login Button */}
          <TouchableOpacity
            style={[
              styles.loginButton,
              {
                backgroundColor: colors.primary,
                opacity: isLoading ? 0.6 : 1,
              },
            ]}
            onPress={handleGuestLogin}
            disabled={isLoading}
          >
            {isLoading ? (
              <ActivityIndicator color="white" size="small" />
            ) : (
              <Text style={styles.loginButtonText}>게스트로 시작</Text>
            )}
          </TouchableOpacity>

          {/* Info Box */}
          <View
            style={[
              styles.infoContainer,
              { backgroundColor: colors.primary + "12", borderLeftColor: colors.primary },
            ]}
          >
            <Text style={[styles.infoTitle, { color: colors.primary }]}>
              💡 게스트 계정 안내
            </Text>
            <Text style={[styles.infoText, { color: colors.foreground }]}>
              • 접속코드 검증 후 게스트 계정으로 로그인합니다.{"\n"}
              • 모든 기능을 제한 없이 사용할 수 있습니다.{"\n"}
              • 프로젝트를 JSON으로 내보내 저장할 수 있습니다.{"\n"}
              • 세션 기간 내에는 로그아웃해도 데이터가 유지됩니다.
            </Text>
          </View>

          {/* Features */}
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
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: 20,
    paddingBottom: 40,
  },
  header: {
    marginBottom: 40,
    marginTop: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: "bold",
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
  },
  section: {
    marginBottom: 24,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 12,
  },
  description: {
    fontSize: 14,
    marginBottom: 16,
    lineHeight: 20,
  },
  optionsContainer: {
    gap: 10,
    marginBottom: 12,
  },
  optionButton: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 2,
  },
  optionText: {
    fontSize: 15,
  },
  durationInfo: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 6,
  },
  durationInfoText: {
    fontSize: 13,
    fontWeight: "600",
  },
  warningText: {
    fontSize: 14,
    lineHeight: 22,
  },
  errorContainer: {
    padding: 12,
    borderRadius: 8,
    marginBottom: 20,
    borderLeftWidth: 4,
  },
  errorText: {
    fontSize: 14,
    fontWeight: "500",
  },
  loginButton: {
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: "center",
    marginBottom: 20,
  },
  loginButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  infoContainer: {
    padding: 16,
    borderRadius: 8,
    borderLeftWidth: 4,
    marginBottom: 24,
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
  featuresContainer: {
    padding: 16,
    borderRadius: 8,
    borderWidth: 1,
  },
  featureTitle: {
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 12,
  },
  featureList: {
    gap: 8,
  },
  featureItem: {
    fontSize: 13,
    lineHeight: 18,
  },
});
