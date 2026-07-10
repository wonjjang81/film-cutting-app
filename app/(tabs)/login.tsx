import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from "react-native";
import { useAuth } from "@/app/contexts/AuthContext";
import { router } from "expo-router";

export default function LoginScreen() {
  const [code, setCode] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const { loginAsAdmin, validateAccessCode, isAdmin, guestSession, accessCodeValidated, error } = useAuth();

  const isLoggedIn = isAdmin || guestSession !== null || accessCodeValidated;

  // 이미 로그인된 상태라면 입력 탭으로 이동
  useEffect(() => {
    if (isLoggedIn) {
      router.replace("/(tabs)/input");
    }
  }, [isLoggedIn]);

  const handleLogin = async () => {
    const trimmedCode = code.trim();
    if (!trimmedCode) return;
    
    setIsLoading(true);
    
    try {
      if (trimmedCode === "won81") {
        loginAsAdmin(trimmedCode);
        // useEffect가 이동을 처리함
      } else {
        const success = await validateAccessCode(trimmedCode);
        if (!success) {
          Alert.alert("인증 실패", error || "접속코드가 올바르지 않습니다.");
        }
        // 성공 시 useEffect가 이동을 처리함
      }
    } catch (err) {
      Alert.alert("오류", "로그인 중 문제가 발생했습니다.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.title}>필름 재단 계산기</Text>
        <Text style={styles.subtitle}>접속코드를 입력해 주세요</Text>
        
        <TextInput
          style={styles.input}
          placeholder="접속코드 또는 관리자 비번"
          value={code}
          onChangeText={setCode}
          secureTextEntry={code === "won81"}
          autoCapitalize="none"
        />
        
        <TouchableOpacity 
          style={styles.button} 
          onPress={handleLogin}
          disabled={isLoading}
        >
          {isLoading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>접속하기</Text>
          )}
        </TouchableOpacity>
        
        <Text style={styles.footer}>관리자 비번: won81</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
    backgroundColor: "#f5f5f5",
  },
  card: {
    width: "100%",
    maxWidth: 400,
    padding: 30,
    backgroundColor: "#fff",
    borderRadius: 15,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 5,
    alignItems: "center",
  },
  title: {
    fontSize: 26,
    fontWeight: "bold",
    marginBottom: 10,
    color: "#007AFF",
  },
  subtitle: {
    fontSize: 15,
    color: "#666",
    marginBottom: 30,
  },
  input: {
    width: "100%",
    height: 50,
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 8,
    paddingHorizontal: 15,
    marginBottom: 20,
    fontSize: 16,
    backgroundColor: "#fafafa",
  },
  button: {
    width: "100%",
    height: 50,
    backgroundColor: "#007AFF",
    justifyContent: "center",
    alignItems: "center",
    borderRadius: 8,
  },
  buttonText: {
    color: "#fff",
    fontSize: 17,
    fontWeight: "bold",
  },
  footer: {
    marginTop: 20,
    fontSize: 12,
    color: "#ccc",
  }
});
