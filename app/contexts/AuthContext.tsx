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
  guestSession: GuestSession | null;
  isLoading: boolean;
  guestLoginError: string | null;
  loginAsGuest: (durationMinutes: number) => Promise<void>;
  logout: () => void;
  isGuestExpired: () => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [guestSession, setGuestSession] = useState<GuestSession | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [guestLoginError, setGuestLoginError] = useState<string | null>(null);
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

  const loginAsGuest = async (durationMinutes: number) => {
    if (!deviceId) {
      setGuestLoginError("Device ID not initialized");
      return;
    }

    setIsLoading(true);
    setGuestLoginError(null);

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
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      setGuestLoginError(errorMessage);
      console.error("Guest login error:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const logout = () => {
    setGuestSession(null);
    localStorage.removeItem("guestSession");
  };

  const isGuestExpired = () => {
    if (!guestSession) return false;
    return new Date(guestSession.expiresAt) <= new Date();
  };

  return (
    <AuthContext.Provider
      value={{
        guestSession,
        isLoading,
        guestLoginError,
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
