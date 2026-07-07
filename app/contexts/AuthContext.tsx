import React, { createContext, useContext, useEffect, useState } from "react";
import { v4 as uuidv4 } from "uuid";

export interface GuestSession {
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
  guestAccountId: number;
  deviceId: string;
}

interface AuthContextType {
  accessCodeValidated: boolean;
  guestSession: GuestSession | null;
  isLoading: boolean;
  error: string | null;
  validateAccessCode: (code: string) => Promise<void>;
  loginAsGuest: (durationMinutes: number) => Promise<void>;
  logout: () => void;
  isGuestExpired: () => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [accessCodeValidated, setAccessCodeValidated] = useState(false);
  const [guestSession, setGuestSession] = useState<GuestSession | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deviceId, setDeviceId] = useState<string>("");

  // Initialize device ID on mount
  useEffect(() => {
    const storedDeviceId = localStorage.getItem("deviceId");
    if (storedDeviceId) {
      setDeviceId(storedDeviceId);
    } else {
      const newDeviceId = uuidv4();
      localStorage.setItem("deviceId", newDeviceId);
      setDeviceId(newDeviceId);
    }

    // Load access code validation status
    const validatedCode = localStorage.getItem("accessCodeValidated");
    if (validatedCode === "true") {
      setAccessCodeValidated(true);
    }

    // Load guest session from localStorage
    const storedSession = localStorage.getItem("guestSession");
    if (storedSession) {
      try {
        const session = JSON.parse(storedSession);
        if (new Date(session.expiresAt) > new Date()) {
          setGuestSession(session);
        } else {
          localStorage.removeItem("guestSession");
        }
      } catch (error) {
        console.error("Failed to parse guest session:", error);
        localStorage.removeItem("guestSession");
      }
    }
  }, []);

  const validateAccessCode = async (code: string) => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/trpc/auth.validateAccessCode", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          input: {
            code,
          },
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to validate access code");
      }

      const data = await response.json();

      if (data.result.data.valid) {
        setAccessCodeValidated(true);
        localStorage.setItem("accessCodeValidated", "true");
      } else {
        setError(data.result.data.message || "접속코드 검증 실패");
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Unknown error";
      setError(errorMessage);
      console.error("Access code validation error:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const loginAsGuest = async (durationMinutes: number) => {
    if (!deviceId) {
      setError("Device ID not initialized");
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/trpc/auth.guestLogin", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          input: {
            durationMinutes,
            deviceId,
          },
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to login as guest");
      }

      const data = await response.json();
      const session: GuestSession = {
        accessToken: data.result.data.accessToken,
        refreshToken: data.result.data.refreshToken,
        expiresAt: data.result.data.expiresAt,
        guestAccountId: data.result.data.guestAccountId,
        deviceId,
      };

      setGuestSession(session);
      localStorage.setItem("guestSession", JSON.stringify(session));
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Unknown error";
      setError(errorMessage);
      console.error("Guest login error:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const logout = () => {
    setGuestSession(null);
    setAccessCodeValidated(false);
    localStorage.removeItem("guestSession");
    localStorage.removeItem("accessCodeValidated");
  };

  const isGuestExpired = () => {
    if (!guestSession) return false;
    return new Date(guestSession.expiresAt) <= new Date();
  };

  return (
    <AuthContext.Provider
      value={{
        accessCodeValidated,
        guestSession,
        isLoading,
        error,
        validateAccessCode,
        loginAsGuest,
        logout,
        isGuestExpired,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
};
