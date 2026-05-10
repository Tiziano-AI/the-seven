"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { fetchDemoSession, logoutDemoSession } from "@/lib/api";
import { clearEncryptedKey } from "@/lib/crypto";
import { writeActiveSessionId } from "@/lib/storage";

type DemoSession = Readonly<{
  email: string;
  expiresAt: number;
}>;

type AuthMode = "none" | "byok" | "demo";

type AuthContextValue = Readonly<{
  mode: AuthMode;
  byokKey: string | null;
  demoSession: DemoSession | null;
  authHeader: string | null;
  isAuthenticated: boolean;
  setByokKey: (value: string | null) => void;
  resetEncryptedKey: () => void;
  clearByokKey: () => void;
  clearDemoSession: () => void;
}>;

const INACTIVITY_TIMEOUT_MS = 30 * 60 * 1000;

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider(props: Readonly<{ children: React.ReactNode }>) {
  const [byokKey, setByokKeyState] = useState<string | null>(null);
  const [demoSession, setDemoSessionState] = useState<DemoSession | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimeoutRef = useCallback(() => {
    if (!timeoutRef.current) {
      return;
    }
    clearTimeout(timeoutRef.current);
    timeoutRef.current = null;
  }, []);

  const clearByokKey = useCallback(() => {
    setByokKeyState(null);
    clearTimeoutRef();
    writeActiveSessionId(null);
  }, [clearTimeoutRef]);

  const resetTimeout = useCallback(() => {
    clearTimeoutRef();
    timeoutRef.current = setTimeout(() => {
      clearByokKey();
    }, INACTIVITY_TIMEOUT_MS);
  }, [clearByokKey, clearTimeoutRef]);

  const setByokKey = useCallback(
    (value: string | null) => {
      setByokKeyState(value);
      if (value) {
        resetTimeout();
      } else {
        clearTimeoutRef();
      }
    },
    [clearTimeoutRef, resetTimeout],
  );

  const clearDemoSession = useCallback(() => {
    setDemoSessionState(null);
    writeActiveSessionId(null);
    void logoutDemoSession().catch(() => undefined);
  }, []);

  const resetEncryptedKey = useCallback(() => {
    clearByokKey();
    clearEncryptedKey();
  }, [clearByokKey]);

  useEffect(() => {
    if (!byokKey) {
      return;
    }

    const events = ["mousedown", "keydown", "scroll", "touchstart"] as const;
    const handleActivity = () => resetTimeout();
    for (const event of events) {
      window.addEventListener(event, handleActivity);
    }
    return () => {
      for (const event of events) {
        window.removeEventListener(event, handleActivity);
      }
      clearTimeoutRef();
    };
  }, [byokKey, clearTimeoutRef, resetTimeout]);

  useEffect(() => {
    let cancelled = false;
    void fetchDemoSession()
      .then((session) => {
        if (!cancelled && session.expiresAt > Date.now()) {
          setDemoSessionState(session);
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (demoSession && demoSession.expiresAt <= Date.now()) {
      clearDemoSession();
    }
  }, [demoSession, clearDemoSession]);

  const mode: AuthMode = byokKey ? "byok" : demoSession ? "demo" : "none";
  const authHeader = useMemo(() => {
    if (mode === "byok" && byokKey) {
      return `Bearer ${byokKey}`;
    }
    return null;
  }, [byokKey, mode]);

  const value = useMemo<AuthContextValue>(
    () => ({
      mode,
      byokKey,
      demoSession,
      authHeader,
      isAuthenticated: mode !== "none",
      setByokKey,
      resetEncryptedKey,
      clearByokKey,
      clearDemoSession,
    }),
    [
      authHeader,
      byokKey,
      clearByokKey,
      clearDemoSession,
      demoSession,
      mode,
      resetEncryptedKey,
      setByokKey,
    ],
  );

  return <AuthContext.Provider value={value}>{props.children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}
