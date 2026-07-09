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
  isAdmin: boolean;
  isLoading: boolean;
  error: string | null;
  validateAccessCode: (code: string) => Promise<void>;
  loginAsGuest: (durationMinutes: number) => Promise<void>;
  loginAsAdmin: (password: string) => boolean;
  logout: () => void;
  isGuestExpired: () => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [accessCodeValidated, setAccessCodeValidated] = useState(false);
  const [guestSession, setGuestSession] = useState<GuestSession | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deviceId, setDeviceId] = useState<string>("");

  const ADMIN_PASSWORD = "won81";

  // Initialize device ID on mount
  useEffect(() => {
    try {
      const storedDeviceId = typeof localStorage !== 'undefined' ? localStorage.getItem("deviceId") : null;
      if (storedDeviceId) {
        setDeviceId(storedDeviceId);
      } else if (typeof localStorage !== 'undefined') {
        const newDeviceId = uuidv4();
        localStorage.setItem("deviceId", newDeviceId);
        setDeviceId(newDeviceId);
      }

      // Load admin status
      const storedAdmin = typeof localStorage !== 'undefined' ? localStorage.getItem("isAdmin") : null;
      if (storedAdmin === "true") {
        setIsAdmin(true);
      }

      // Load access code validation status
      const validatedCode = typeof localStorage !== 'undefined' ? localStorage.getItem("accessCodeValidated") : null;
      if (validatedCode === "true") {
        setAccessCodeValidated(true);
      }

      // Load guest session from localStorage
      const storedSession = typeof localStorage !== 'undefined' ? localStorage.getItem("guestSession") : null;
      if (storedSession) {
        try {
          const session = JSON.parse(storedSession);
          if (new Date(session.expiresAt) > new Date()) {
            setGuestSession(session);
          } else if (typeof localStorage !== 'undefined') {
            localStorage.removeItem("guestSession");
          }
        } catch (error) {
          console.error("Failed to parse guest session:", error);
          if (typeof localStorage !== 'undefined') localStorage.removeItem("guestSession");
        }
      }
    } catch (e) {
      console.error("Auth initialization error:", e);
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
        if (typeof localStorage !== 'undefined') localStorage.setItem("accessCodeValidated", "true");
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
      if (typeof localStorage !== 'undefined') localStorage.setItem("guestSession", JSON.stringify(session));
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Unknown error";
      setError(errorMessage);
      console.error("Guest login error:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const loginAsAdmin = (password: string) => {
    if (password === ADMIN_PASSWORD) {
      setIsAdmin(true);
      if (typeof localStorage !== 'undefined') localStorage.setItem("isAdmin", "true");
      return true;
    }
    return false;
  };

  const logout = () => {
    setGuestSession(null);
    setAccessCodeValidated(false);
    setIsAdmin(false);
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem("guestSession");
      localStorage.removeItem("accessCodeValidated");
      localStorage.removeItem("isAdmin");
    }
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
        isAdmin,
        isLoading,
        error,
        validateAccessCode,
        loginAsGuest,
        loginAsAdmin,
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
