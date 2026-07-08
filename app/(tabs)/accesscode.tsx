import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { router } from "expo-router";
import { useAuth } from "@/app/contexts/AuthContext";
import { useColors } from "@/hooks/use-colors";
import { ScreenContainer } from "@/components/screen-container";

export default function AccessCodeScreen() {
  const colors = useColors();
  const { validateAccessCode, isLoading, error, accessCodeValidated } = useAuth();
  const [code, setCode] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  // Redirect if already validated
  useEffect(() => {
    if (accessCodeValidated) {
      router.push("/(tabs)/login");
    }
  }, [accessCodeValidated]);

  const handleValidateCode = async () => {
    if (!code.trim()) {
      setLocalError("접속코드를 입력해주세요.");
      return;
    }

    if (code.trim().length < 6) {
      setLocalError("접속코드는 최소 6자 이상이어야 합니다.");
      return;
    }

    setLocalError(null);
    await validateAccessCode(code.trim());
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
              접속코드 입력
            </Text>
          </View>

          {/* Main Section */}
          <View
            style={[
              styles.section,
              { backgroundColor: colors.surface, borderColor: colors.border },
            ]}
          >
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
              접속코드를 입력하세요
            </Text>
            <Text style={[styles.description, { color: colors.muted }]}>
              관리자로부터 받은 접속코드를 입력하여 앱에 접근할 수 있습니다.
            </Text>

            <TextInput
              style={[
                styles.codeInput,
                {
                  borderColor: localError || error ? colors.error : colors.border,
                  color: colors.foreground,
                  backgroundColor: colors.background,
                },
              ]}
              placeholder="접속코드 입력 (예: ABC123XYZ789)"
              placeholderTextColor={colors.muted}
              value={code}
              onChangeText={(text) => {
                setCode(text);
                setLocalError(null);
              }}
              editable={!isLoading}
              autoCapitalize="characters"
              maxLength={32}
            />

            {(localError || error) && (
              <View
                style={[
                  styles.errorContainer,
                  { backgroundColor: colors.error + "15" },
                ]}
              >
                <Text style={[styles.errorText, { color: colors.error }]}>
                  ⚠️ {localError || error}
                </Text>
              </View>
            )}

            <TouchableOpacity
              style={[
                styles.validateButton,
                {
                  backgroundColor: colors.primary,
                  opacity: isLoading || !code.trim() ? 0.6 : 1,
                },
              ]}
              onPress={handleValidateCode}
              disabled={isLoading || !code.trim()}
            >
              {isLoading ? (
                <ActivityIndicator color="white" size="small" />
              ) : (
                <Text style={styles.validateButtonText}>접속코드 검증</Text>
              )}
            </TouchableOpacity>
          </View>

          {/* Info Section */}
          <View
            style={[
              styles.infoContainer,
              { backgroundColor: colors.primary + "12", borderLeftColor: colors.primary },
            ]}
          >
            <Text style={[styles.infoTitle, { color: colors.primary }]}>
              💡 접속코드 안내
            </Text>
            <Text style={[styles.infoText, { color: colors.foreground }]}>
              • 접속코드는 관리자만 발행할 수 있습니다.{"\n"}
              • 한 번 사용한 코드도 다시 사용할 수 있습니다.{"\n"}
              • 코드가 없으신 경우 관리자에게 문의하세요.{"\n"}
              • 코드는 대문자와 숫자로 구성됩니다.
            </Text>
          </View>

          {/* Features Section */}
          <View
            style={[
              styles.featuresContainer,
              { backgroundColor: colors.surface, borderColor: colors.border },
            ]}
          >
            <Text style={[styles.featureTitle, { color: colors.foreground }]}>
              ✨ 게스트 접근 기능
            </Text>
            <View style={styles.featureList}>
              <Text style={[styles.featureItem, { color: colors.foreground }]}>
                • 접속코드로 임시 게스트 계정 생성
              </Text>
              <Text style={[styles.featureItem, { color: colors.foreground }]}>
                • 1시간 ~ 7일 범위의 접근 기간 설정
              </Text>
              <Text style={[styles.featureItem, { color: colors.foreground }]}>
                • 안전한 토큰 기반 인증 시스템
              </Text>
              <Text style={[styles.featureItem, { color: colors.foreground }]}>
                • 기간 만료 후 자동 접근 차단
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
    marginBottom: 20,
    lineHeight: 20,
  },
  codeInput: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 16,
    marginBottom: 16,
    fontFamily: "monospace",
    letterSpacing: 1,
  },
  errorContainer: {
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
    borderLeftWidth: 4,
  },
  errorText: {
    fontSize: 14,
    fontWeight: "500",
  },
  validateButton: {
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: "center",
  },
  validateButtonText: {
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
