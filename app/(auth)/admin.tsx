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

export default function AdminLoginScreen() {
  const colors = useColors();
  const { isLoading } = useAuth();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  const ADMIN_PASSWORD = "admin123"; // 실제 환경에서는 환경변수로 관리

  const handleAdminLogin = async () => {
    if (!password.trim()) {
      setError("비밀번호를 입력해주세요.");
      return;
    }

    if (password === ADMIN_PASSWORD) {
      try {
        setError(null);
        // 관리자 인증 성공 - localStorage에 저장
        localStorage.setItem("accessCodeValidated", "true");
        localStorage.setItem("adminLoggedIn", "true");
        // (tabs) 라우팅으로 이동
        router.replace("/(tabs)");
      } catch (err) {
        setError("로그인 실패");
      }
    } else {
      setError("비밀번호가 올바르지 않습니다.");
      Alert.alert("오류", "비밀번호가 올바르지 않습니다.");
    }
  };

  const handleBack = () => {
    router.back();
  };

  return (
    <ScreenContainer>
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        {/* 헤더 */}
        <View style={[styles.header, { backgroundColor: colors.primary }]}>
          <Text style={styles.headerTitle}>필름 재단 계산기</Text>
          <Text style={[styles.headerSub, { color: "rgba(255,255,255,0.75)" }]}>
            관리자 로그인
          </Text>
        </View>

        {/* 메인 콘텐츠 */}
        <View style={styles.content}>
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.cardTitle, { color: colors.foreground }]}>
              👨‍💼 관리자 로그인
            </Text>
            <Text style={[styles.cardDesc, { color: colors.muted }]}>
              관리자 비밀번호를 입력하여 접속코드를 발행하세요.
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
              placeholder="관리자 비밀번호"
              placeholderTextColor={colors.muted}
              value={password}
              onChangeText={(text) => {
                setPassword(text);
                setError(null);
              }}
              secureTextEntry
              editable={!isLoading}
            />

            {/* 오류 메시지 */}
            {error && (
              <Text style={[styles.errorText, { color: colors.error }]}>
                ⚠️ {error}
              </Text>
            )}

            {/* 로그인 버튼 */}
            <TouchableOpacity
              style={[
                styles.submitBtn,
                {
                  backgroundColor: colors.primary,
                  opacity: isLoading ? 0.6 : 1,
                },
              ]}
              onPress={handleAdminLogin}
              disabled={isLoading}
            >
              {isLoading ? (
                <ActivityIndicator color="white" size="small" />
              ) : (
                <Text style={styles.submitBtnText}>✓ 로그인</Text>
              )}
            </TouchableOpacity>

            {/* 뒤로가기 버튼 */}
            <TouchableOpacity
              style={[
                styles.backBtn,
                {
                  backgroundColor: colors.background,
                  borderColor: colors.border,
                },
              ]}
              onPress={handleBack}
              disabled={isLoading}
            >
              <Text style={[styles.backBtnText, { color: colors.muted }]}>
                ← 뒤로가기
              </Text>
            </TouchableOpacity>
          </View>

          {/* 안내 텍스트 */}
          <View style={[styles.infoBox, { backgroundColor: colors.primary + "12" }]}>
            <Text style={[styles.infoText, { color: colors.primary }]}>
              💡 관리자 로그인 후 접속코드를 발행하여 사용자에게 배포할 수 있습니다.
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
  backBtn: {
    borderRadius: 8,
    borderWidth: 1,
    paddingVertical: 12,
    alignItems: "center",
  },
  backBtnText: {
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
