import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Alert,
} from "react-native";

export default function AdminScreen() {
  const [adminPassword, setAdminPassword] = useState("");
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [generatedCode, setGeneratedCode] = useState("");
  const [codeSettings, setCodeSettings] = useState({
    usageLimit: "",
    expirationDays: "7",
    notes: "",
  });

  const ADMIN_PASSWORD = "admin123"; // 실제 운영 시 환경변수로 관리

  const handleAdminLogin = () => {
    if (adminPassword === ADMIN_PASSWORD) {
      setIsAuthenticated(true);
      setAdminPassword("");
    } else {
      Alert.alert("오류", "관리자 비밀번호가 틀렸습니다.");
      setAdminPassword("");
    }
  };

  const generateAccessCode = () => {
    // 랜덤 코드 생성 (예: ABC123XYZ789)
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let code = "";
    for (let i = 0; i < 12; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setGeneratedCode(code);
  };

  const handleSaveCode = async () => {
    if (!generatedCode) {
      Alert.alert("오류", "코드를 먼저 생성하세요.");
      return;
    }

    try {
      const expiresAt = codeSettings.expirationDays
        ? new Date(Date.now() + parseInt(codeSettings.expirationDays) * 24 * 60 * 60 * 1000)
        : null;

      const response = await fetch("/api/trpc/admin.createAccessCode", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          input: {
            code: generatedCode,
            usageLimit: codeSettings.usageLimit ? parseInt(codeSettings.usageLimit) : null,
            expiresAt: expiresAt?.toISOString(),
            notes: codeSettings.notes,
          },
        }),
      });

      if (response.ok) {
        Alert.alert("성공", "접속코드가 저장되었습니다.");
        setGeneratedCode("");
        setCodeSettings({
          usageLimit: "",
          expirationDays: "7",
          notes: "",
        });
      } else {
        Alert.alert("오류", "접속코드 저장에 실패했습니다.");
      }
    } catch (error) {
      Alert.alert("오류", "서버 오류가 발생했습니다.");
      console.error("Error saving code:", error);
    }
  };

  if (!isAuthenticated) {
    return (
      <View style={styles.container}>
        <View style={styles.loginContainer}>
          <Text style={styles.title}>관리자 로그인</Text>
          <TextInput
            style={styles.passwordInput}
            placeholder="관리자 비밀번호"
            secureTextEntry
            value={adminPassword}
            onChangeText={setAdminPassword}
            placeholderTextColor="#999"
          />
          <TouchableOpacity style={styles.loginButton} onPress={handleAdminLogin}>
            <Text style={styles.loginButtonText}>로그인</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <View style={styles.content}>
        <View style={styles.header}>
          <Text style={styles.title}>관리자 대시보드</Text>
          <TouchableOpacity
            onPress={() => {
              setIsAuthenticated(false);
              setAdminPassword("");
            }}
          >
            <Text style={styles.logoutButton}>로그아웃</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>접속코드 생성</Text>

          <View style={styles.codeGeneratorContainer}>
            <View style={styles.generatedCodeBox}>
              <Text style={styles.generatedCodeLabel}>생성된 코드:</Text>
              <Text style={styles.generatedCode}>{generatedCode || "코드 생성 필요"}</Text>
            </View>

            <TouchableOpacity style={styles.generateButton} onPress={generateAccessCode}>
              <Text style={styles.generateButtonText}>새 코드 생성</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.settingsContainer}>
            <Text style={styles.settingLabel}>사용 횟수 제한 (선택사항)</Text>
            <TextInput
              style={styles.settingInput}
              placeholder="예: 10 (비워두면 무제한)"
              keyboardType="number-pad"
              value={codeSettings.usageLimit}
              onChangeText={(text) =>
                setCodeSettings({ ...codeSettings, usageLimit: text })
              }
              placeholderTextColor="#999"
            />

            <Text style={styles.settingLabel}>만료 기간 (일)</Text>
            <TextInput
              style={styles.settingInput}
              placeholder="예: 7"
              keyboardType="number-pad"
              value={codeSettings.expirationDays}
              onChangeText={(text) =>
                setCodeSettings({ ...codeSettings, expirationDays: text })
              }
              placeholderTextColor="#999"
            />

            <Text style={styles.settingLabel}>메모</Text>
            <TextInput
              style={[styles.settingInput, styles.notesInput]}
              placeholder="코드에 대한 메모 (선택사항)"
              multiline
              numberOfLines={3}
              value={codeSettings.notes}
              onChangeText={(text) => setCodeSettings({ ...codeSettings, notes: text })}
              placeholderTextColor="#999"
            />
          </View>

          <TouchableOpacity style={styles.saveButton} onPress={handleSaveCode}>
            <Text style={styles.saveButtonText}>코드 저장</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.infoContainer}>
          <Text style={styles.infoTitle}>💡 접속코드 관리 안내</Text>
          <Text style={styles.infoText}>
            • 생성된 코드는 사용자가 앱 접속 시 입력합니다.{"\n"}
            • 사용 횟수 제한을 설정하면 해당 횟수만큼만 사용 가능합니다.{"\n"}
            • 만료 기간을 설정하면 해당 기간 후 코드가 자동 비활성화됩니다.{"\n"}
            • 메모는 관리자용으로만 표시됩니다.
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
  loginContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  content: {
    padding: 20,
    paddingBottom: 40,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 30,
    marginTop: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: "bold",
    color: "#1a1a1a",
  },
  logoutButton: {
    color: "#ef4444",
    fontSize: 14,
    fontWeight: "600",
    padding: 8,
  },
  passwordInput: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 16,
    marginBottom: 16,
    width: "100%",
    maxWidth: 300,
  },
  loginButton: {
    backgroundColor: "#2563eb",
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    width: "100%",
    maxWidth: 300,
    alignItems: "center",
  },
  loginButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  section: {
    backgroundColor: "#fff",
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e0e0e0",
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#1a1a1a",
    marginBottom: 16,
  },
  codeGeneratorContainer: {
    marginBottom: 16,
  },
  generatedCodeBox: {
    backgroundColor: "#f0f9ff",
    padding: 12,
    borderRadius: 8,
    marginBottom: 12,
    borderLeftWidth: 4,
    borderLeftColor: "#2563eb",
  },
  generatedCodeLabel: {
    fontSize: 12,
    color: "#666",
    marginBottom: 4,
  },
  generatedCode: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#2563eb",
    fontFamily: "monospace",
    letterSpacing: 2,
  },
  generateButton: {
    backgroundColor: "#10b981",
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: "center",
  },
  generateButtonText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
  },
  settingsContainer: {
    marginBottom: 16,
  },
  settingLabel: {
    fontSize: 14,
    fontWeight: "500",
    color: "#1a1a1a",
    marginBottom: 6,
    marginTop: 12,
  },
  settingInput: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    marginBottom: 8,
  },
  notesInput: {
    minHeight: 80,
    paddingTop: 10,
    textAlignVertical: "top",
  },
  saveButton: {
    backgroundColor: "#2563eb",
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: "center",
  },
  saveButtonText: {
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
