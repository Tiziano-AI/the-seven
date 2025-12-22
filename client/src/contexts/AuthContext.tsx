import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { clearEncryptedKey } from "@/lib/crypto";
import { clearActiveSessionId } from "@/features/sessions/domain/activeSession";

type AuthMode = "none" | "byok" | "demo";

type DemoSessionState = Readonly<{
  token: string;
  email: string;
  expiresAt: number;
}>;

type AuthContextType = Readonly<{
  mode: AuthMode;
  byokKey: string | null;
  demoSession: DemoSessionState | null;
  setByokKey: (key: string | null) => void;
  clearByokKey: () => void;
  resetEncryptedKey: () => void;
  setDemoSession: (session: DemoSessionState) => void;
  clearDemoSession: () => void;
  isAuthenticated: boolean;
  authHeader: string | null;
}>;

const DEMO_TOKEN_KEY = "seven.demo_session_token";
const DEMO_EMAIL_KEY = "seven.demo_session_email";
const DEMO_EXPIRES_AT_KEY = "seven.demo_session_expires_at";

function readStoredDemoSession(): DemoSessionState | null {
  const token = localStorage.getItem(DEMO_TOKEN_KEY);
  const email = localStorage.getItem(DEMO_EMAIL_KEY);
  const expiresAtRaw = localStorage.getItem(DEMO_EXPIRES_AT_KEY);
  if (!token || !email || !expiresAtRaw) return null;
  if (!/^\d+$/.test(expiresAtRaw)) return null;
  const expiresAt = Number.parseInt(expiresAtRaw, 10);
  if (!Number.isFinite(expiresAt)) return null;
  if (expiresAt <= Date.now()) return null;
  return { token, email, expiresAt };
}

function clearStoredDemoSession(): void {
  localStorage.removeItem(DEMO_TOKEN_KEY);
  localStorage.removeItem(DEMO_EMAIL_KEY);
  localStorage.removeItem(DEMO_EXPIRES_AT_KEY);
}

function writeStoredDemoSession(session: DemoSessionState): void {
  localStorage.setItem(DEMO_TOKEN_KEY, session.token);
  localStorage.setItem(DEMO_EMAIL_KEY, session.email);
  localStorage.setItem(DEMO_EXPIRES_AT_KEY, String(session.expiresAt));
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [byokKey, setByokKeyState] = useState<string | null>(null);
  const [demoSession, setDemoSessionState] = useState<DemoSessionState | null>(() =>
    readStoredDemoSession()
  );

  const mode: AuthMode = byokKey ? "byok" : demoSession ? "demo" : "none";

  const isAuthenticated = mode !== "none";

  const authHeader = useMemo(() => {
    if (mode === "byok" && byokKey) return `Bearer ${byokKey}`;
    if (mode === "demo" && demoSession) return `Demo ${demoSession.token}`;
    return null;
  }, [byokKey, demoSession, mode]);

  const SESSION_TIMEOUT = 30 * 60 * 1000;
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimeoutRef = useCallback(() => {
    if (!timeoutRef.current) return;
    clearTimeout(timeoutRef.current);
    timeoutRef.current = null;
  }, []);

  const clearByokKey = useCallback(() => {
    setByokKeyState(null);
    clearTimeoutRef();
    clearActiveSessionId();
  }, [clearTimeoutRef]);

  const resetTimeout = useCallback(() => {
    clearTimeoutRef();
    timeoutRef.current = setTimeout(() => {
      clearByokKey();
    }, SESSION_TIMEOUT);
  }, [clearByokKey, clearTimeoutRef]);

  const setByokKey = useCallback(
    (key: string | null) => {
      setByokKeyState(key);
      if (!key) {
        clearTimeoutRef();
        return;
      }
      resetTimeout();
    },
    [clearTimeoutRef, resetTimeout]
  );

  const resetEncryptedKey = useCallback(() => {
    clearByokKey();
    clearEncryptedKey();
  }, [clearByokKey]);

  const setDemoSession = useCallback((session: DemoSessionState) => {
    setDemoSessionState(session);
    writeStoredDemoSession(session);
  }, []);

  const clearDemoSession = useCallback(() => {
    setDemoSessionState(null);
    clearStoredDemoSession();
    clearActiveSessionId();
  }, []);

  useEffect(() => {
    if (!byokKey) return;

    const activityEvents = ["mousedown", "keydown", "scroll", "touchstart"];

    const handleActivity = () => {
      resetTimeout();
    };

    activityEvents.forEach((event) => {
      window.addEventListener(event, handleActivity);
    });

    return () => {
      activityEvents.forEach((event) => {
        window.removeEventListener(event, handleActivity);
      });
      clearTimeoutRef();
    };
  }, [byokKey, clearTimeoutRef, resetTimeout]);

  useEffect(() => {
    if (!demoSession) return;
    if (demoSession.expiresAt > Date.now()) return;
    clearDemoSession();
  }, [demoSession, clearDemoSession]);

  return (
    <AuthContext.Provider
      value={{
        mode,
        byokKey,
        demoSession,
        setByokKey,
        clearByokKey,
        resetEncryptedKey,
        setDemoSession,
        clearDemoSession,
        isAuthenticated,
        authHeader,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
