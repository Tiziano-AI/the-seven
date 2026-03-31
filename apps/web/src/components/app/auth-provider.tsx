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
import { clearEncryptedKey } from "@/lib/crypto";
import { writeActiveSessionId } from "@/lib/storage";

type DemoSession = Readonly<{
  token: string;
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
  setDemoSession: (session: DemoSession) => void;
  clearDemoSession: () => void;
}>;

const DEMO_TOKEN_KEY = "seven.demo.token";
const DEMO_EMAIL_KEY = "seven.demo.email";
const DEMO_EXPIRES_AT_KEY = "seven.demo.expires_at";
const INACTIVITY_TIMEOUT_MS = 30 * 60 * 1000;

function readDemoSession(): DemoSession | null {
  if (typeof window === "undefined") {
    return null;
  }

  const token = window.localStorage.getItem(DEMO_TOKEN_KEY);
  const email = window.localStorage.getItem(DEMO_EMAIL_KEY);
  const expiresAtRaw = window.localStorage.getItem(DEMO_EXPIRES_AT_KEY);
  if (!token || !email || !expiresAtRaw || !/^\d+$/.test(expiresAtRaw)) {
    return null;
  }

  const expiresAt = Number.parseInt(expiresAtRaw, 10);
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
    return null;
  }

  return { token, email, expiresAt };
}

function writeDemoSession(session: DemoSession | null) {
  if (typeof window === "undefined") {
    return;
  }
  if (!session) {
    window.localStorage.removeItem(DEMO_TOKEN_KEY);
    window.localStorage.removeItem(DEMO_EMAIL_KEY);
    window.localStorage.removeItem(DEMO_EXPIRES_AT_KEY);
    return;
  }
  window.localStorage.setItem(DEMO_TOKEN_KEY, session.token);
  window.localStorage.setItem(DEMO_EMAIL_KEY, session.email);
  window.localStorage.setItem(DEMO_EXPIRES_AT_KEY, String(session.expiresAt));
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider(props: Readonly<{ children: React.ReactNode }>) {
  const [byokKey, setByokKeyState] = useState<string | null>(null);
  const [demoSession, setDemoSessionState] = useState<DemoSession | null>(() => readDemoSession());
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

  const setDemoSession = useCallback((value: DemoSession) => {
    setDemoSessionState(value);
    writeDemoSession(value);
  }, []);

  const clearDemoSession = useCallback(() => {
    setDemoSessionState(null);
    writeDemoSession(null);
    writeActiveSessionId(null);
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
    if (demoSession && demoSession.expiresAt <= Date.now()) {
      clearDemoSession();
    }
  }, [demoSession, clearDemoSession]);

  const mode: AuthMode = byokKey ? "byok" : demoSession ? "demo" : "none";
  const authHeader = useMemo(() => {
    if (mode === "byok" && byokKey) {
      return `Bearer ${byokKey}`;
    }
    if (mode === "demo" && demoSession) {
      return `Demo ${demoSession.token}`;
    }
    return null;
  }, [byokKey, demoSession, mode]);

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
      setDemoSession,
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
      setDemoSession,
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
