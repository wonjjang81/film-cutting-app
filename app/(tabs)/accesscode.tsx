import React, { useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, TextInput, ScrollView } from "react-native";
import { router } from "expo-router";
import { useAuth } from "../contexts/AuthContext";

export default function AccessCodeScreen() {
  const { validateAccessCode, isLoading, error } = useAuth();
  const [code, setCode] = useState("");

  const handleValidateCode = async () => {
    if (!code.trim()) {
      return;
    }
    await validateAccessCode(code.trim());
    // Navigate to login screen after successful validation
    setTimeout(() => {
      router.push("/(tabs)/login");
    }, 500);
  };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.content}>
        <View style={styles.header}>
          <Text style={styles.title}>필름 재단 계산기</Text>
          <Text style={styles.subtitle}>접속코드 입력</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>접속코드를 입력하세요</Text>
          <Text style={styles.description}>
            관리자로부터 받은 접속코드를 입력하여 앱에 접근할 수 있습니다.
          </Text>

          <TextInput
            style={styles.codeInput}
            placeholder="접속코드 입력 (예: ABC123XYZ789)"
            placeholderTextColor="#999"
            value={code}
            onChangeText={setCode}
            editable={!isLoading}
            autoCapitalize="characters"
            maxLength={32}
          />

          {error && (
            <View style={styles.errorContainer}>
              <Text style={styles.errorText}>⚠️ {error}</Text>
            </View>
          )}

          <TouchableOpacity
            style={[styles.validateButton, (isLoading || !code.trim()) && styles.validateButtonDisabled]}
            onPress={handleValidateCode}
            disabled={isLoading || !code.trim()}
          >
            <Text style={styles.validateButtonText}>
              {isLoading ? "검증 중..." : "접속코드 검증"}
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.infoContainer}>
          <Text style={styles.infoTitle}>💡 접속코드 안내</Text>
          <Text style={styles.infoText}>
            • 접속코드는 관리자만 발행할 수 있습니다.{"\n"}
            • 한 번 사용한 코드도 다시 사용할 수 있습니다.{"\n"}
            • 코드가 없으신 경우 관리자에게 문의하세요.
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
    marginBottom: 20,
    lineHeight: 20,
  },
  codeInput: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 16,
    marginBottom: 16,
    fontFamily: "monospace",
    letterSpacing: 1,
  },
  errorContainer: {
    backgroundColor: "#fee2e2",
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
    borderLeftWidth: 4,
    borderLeftColor: "#dc2626",
  },
  errorText: {
    color: "#991b1b",
    fontSize: 14,
    fontWeight: "500",
  },
  validateButton: {
    backgroundColor: "#2563eb",
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: "center",
  },
  validateButtonDisabled: {
    backgroundColor: "#9ca3af",
    opacity: 0.7,
  },
  validateButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  infoContainer: {
    backgroundColor: "#dbeafe",
    padding: 16,
    borderRadius: 8,
    borderLeftWidth: 4,
    borderLeftColor: "#2563eb",
  },
  infoTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#0c4a6e",
    marginBottom: 8,
  },
  infoText: {
    fontSize: 13,
    color: "#0c4a6e",
    lineHeight: 20,
  },
});
