import React, { useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from "react-native";
import { router } from "expo-router";
import { useAuth } from "../contexts/AuthContext";

export default function LoginScreen() {
  const { loginAsGuest, isLoading } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [selectedDuration, setSelectedDuration] = useState<number>(1440); // 24 hours default

  const durationOptions = [
    { label: "1시간", value: 60 },
    { label: "6시간", value: 360 },
    { label: "24시간", value: 1440 },
    { label: "7일", value: 10080 },
  ];

  const handleGuestLogin = async () => {
    await loginAsGuest(selectedDuration);
    // Navigate to input screen after successful login
    setTimeout(() => {
      router.push("/(tabs)/input");
    }, 500);
  };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.content}>
        <View style={styles.header}>
          <Text style={styles.title}>필름 재단 계산기</Text>
          <Text style={styles.subtitle}>게스트로 시작하기</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>세션 기간 선택</Text>
          <Text style={styles.description}>
            게스트 계정의 유효 기간을 선택하세요. 기간이 만료되면 다시 로그인해야 합니다.
          </Text>

          <View style={styles.optionsContainer}>
            {durationOptions.map((option) => (
              <TouchableOpacity
                key={option.value}
                style={[
                  styles.optionButton,
                  selectedDuration === option.value && styles.optionButtonSelected,
                ]}
                onPress={() => setSelectedDuration(option.value)}
              >
                <Text
                  style={[
                    styles.optionText,
                    selectedDuration === option.value && styles.optionTextSelected,
                  ]}
                >
                  {option.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>주의사항</Text>
          <Text style={styles.warningText}>
            • 게스트 계정은 임시 계정입니다.{"\n"}
            • 기간 만료 후 데이터는 자동 삭제됩니다.{"\n"}
            • 중요한 데이터는 PDF로 내보내기를 권장합니다.
          </Text>
        </View>

        {error && (
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        <TouchableOpacity
          style={[styles.loginButton, isLoading && styles.loginButtonDisabled]}
          onPress={handleGuestLogin}
          disabled={isLoading}
        >
          <Text style={styles.loginButtonText}>
            {isLoading ? "로그인 중..." : "게스트로 시작"}
          </Text>
        </TouchableOpacity>

        <View style={styles.infoContainer}>
          <Text style={styles.infoText}>
            💡 팁: 앱을 종료했다가 다시 열어도 세션이 유지됩니다. (기간 내에서)
          </Text>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f8f9fa",
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
    color: "#1a1a1a",
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: "#666",
  },
  section: {
    marginBottom: 30,
    backgroundColor: "#fff",
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e0e0e0",
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#1a1a1a",
    marginBottom: 12,
  },
  description: {
    fontSize: 14,
    color: "#666",
    marginBottom: 16,
    lineHeight: 20,
  },
  optionsContainer: {
    gap: 10,
  },
  optionButton: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: "#ddd",
    backgroundColor: "#fff",
  },
  optionButtonSelected: {
    borderColor: "#2563eb",
    backgroundColor: "#eff6ff",
  },
  optionText: {
    fontSize: 15,
    color: "#666",
    fontWeight: "500",
  },
  optionTextSelected: {
    color: "#2563eb",
    fontWeight: "600",
  },
  warningText: {
    fontSize: 14,
    color: "#d97706",
    lineHeight: 22,
  },
  errorContainer: {
    backgroundColor: "#fee2e2",
    padding: 12,
    borderRadius: 8,
    marginBottom: 20,
    borderLeftWidth: 4,
    borderLeftColor: "#dc2626",
  },
  errorText: {
    color: "#991b1b",
    fontSize: 14,
    fontWeight: "500",
  },
  loginButton: {
    backgroundColor: "#2563eb",
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: "center",
    marginBottom: 20,
  },
  loginButtonDisabled: {
    backgroundColor: "#9ca3af",
    opacity: 0.7,
  },
  loginButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  infoContainer: {
    backgroundColor: "#dbeafe",
    padding: 12,
    borderRadius: 8,
    borderLeftWidth: 4,
    borderLeftColor: "#2563eb",
  },
  infoText: {
    fontSize: 13,
    color: "#0c4a6e",
    lineHeight: 20,
  },
});
