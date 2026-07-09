import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Platform,
} from "react-native";
import { router } from "expo-router";
import { useAuth } from "@/app/contexts/AuthContext";
import { useColors } from "@/hooks/use-colors";
import { ScreenContainer } from "@/components/screen-container";

export default function AccessCodeScreen() {
  const colors = useColors();
  const { validateAccessCode, isLoading } = useAuth();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleValidateCode = async () => {
    if (!code.trim()) {
      setError("접속코드를 입력해주세요.");
      return;
    }

    try {
      setError(null);
      await validateAccessCode(code);
      // 성공하면 자동으로 (tabs) 라우팅으로 이동
      router.replace("/(tabs)");
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "접속코드 검증 실패";
      setError(errorMessage);
      Alert.alert("오류", errorMessage);
    }
  };

  const handleAdminLogin = () => {
    router.push("/(auth)/admin");
  };

  return (
    <ScreenContainer>
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        {/* 헤더 */}
        <View style={[styles.header, { backgroundColor: colors.primary }]}>
          <Text style={styles.headerTitle}>필름 재단 계산기</Text>
          <Text style={[styles.headerSub, { color: "rgba(255,255,255,0.75)" }]}>
            접속코드 입력
          </Text>
        </View>

        {/* 메인 콘텐츠 */}
        <View style={styles.content}>
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.cardTitle, { color: colors.foreground }]}>
              🔑 접속코드 입력
            </Text>
            <Text style={[styles.cardDesc, { color: colors.muted }]}>
              관리자로부터 받은 접속코드를 입력하여 앱에 접근하세요.
            </Text>

            {/* 입력 필드 */}
            <TextInput
              style={[
                styles.input,
                {
                  backgroundColor: colors.background,
                  borderColor: error ? colors.error : colors.border,
                  color: colors.foreground,
                },
              ]}
              placeholder="접속코드 입력"
              placeholderTextColor={colors.muted}
              value={code}
              onChangeText={(text) => {
                setCode(text.toUpperCase());
                setError(null);
              }}
              editable={!isLoading}
              maxLength={20}
            />

            {/* 오류 메시지 */}
            {error && (
              <Text style={[styles.errorText, { color: colors.error }]}>
                ⚠️ {error}
              </Text>
            )}

            {/* 검증 버튼 */}
            <TouchableOpacity
              style={[
                styles.submitBtn,
                {
                  backgroundColor: colors.primary,
                  opacity: isLoading ? 0.6 : 1,
                },
              ]}
              onPress={handleValidateCode}
              disabled={isLoading}
            >
              {isLoading ? (
                <ActivityIndicator color="white" size="small" />
              ) : (
                <Text style={styles.submitBtnText}>✓ 접속코드 확인</Text>
              )}
            </TouchableOpacity>

            {/* 구분선 */}
            <View
              style={[
                styles.divider,
                { backgroundColor: colors.border },
              ]}
            />

            {/* 관리자 로그인 */}
            <TouchableOpacity
              style={[
                styles.adminBtn,
                {
                  backgroundColor: colors.background,
                  borderColor: colors.primary,
                },
              ]}
              onPress={handleAdminLogin}
              disabled={isLoading}
            >
              <Text style={[styles.adminBtnText, { color: colors.primary }]}>
                👨‍💼 관리자 로그인
              </Text>
            </TouchableOpacity>
          </View>

          {/* 안내 텍스트 */}
          <View style={[styles.infoBox, { backgroundColor: colors.primary + "12" }]}>
            <Text style={[styles.infoText, { color: colors.primary }]}>
              💡 접속코드가 없으신가요?{"\n"}
              관리자에게 접속코드를 요청해주세요.
            </Text>
          </View>
        </View>
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingTop: Platform.OS === "web" ? 40 : 20,
    paddingBottom: 30,
    paddingHorizontal: 20,
    alignItems: "center",
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: "bold",
    color: "white",
    marginBottom: 4,
  },
  headerSub: {
    fontSize: 14,
  },
  content: {
    flex: 1,
    padding: 20,
    justifyContent: "center",
  },
  card: {
    borderRadius: 12,
    padding: 20,
    borderWidth: 1,
    marginBottom: 20,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 8,
  },
  cardDesc: {
    fontSize: 13,
    marginBottom: 20,
    lineHeight: 18,
  },
  input: {
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 16,
    marginBottom: 12,
    fontFamily: Platform.OS === "web" ? "monospace" : undefined,
  },
  errorText: {
    fontSize: 13,
    marginBottom: 12,
    fontWeight: "500",
  },
  submitBtn: {
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: "center",
    marginBottom: 12,
  },
  submitBtnText: {
    color: "white",
    fontSize: 16,
    fontWeight: "600",
  },
  divider: {
    height: 1,
    marginVertical: 12,
  },
  adminBtn: {
    borderRadius: 8,
    borderWidth: 1.5,
    paddingVertical: 12,
    alignItems: "center",
  },
  adminBtnText: {
    fontSize: 16,
    fontWeight: "600",
  },
  infoBox: {
    borderRadius: 8,
    padding: 16,
    alignItems: "center",
  },
  infoText: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center",
    fontWeight: "500",
  },
});
