"use client";

import type { DemoSessionPayload } from "@the-seven/contracts";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";
import { fetchDemoSession, logoutDemoSession } from "@/lib/api";
import { ApiErrorResponse } from "@/lib/apiClient";
import { clearEncryptedKey } from "@/lib/crypto";
import { FOUNDING_COUNCIL_CHOICE, writeActiveSessionId, writeLastCouncilRef } from "@/lib/storage";
import { shouldClearLocalDemoSessionAfterLogoutError } from "./demo-logout";

type DemoSession = DemoSessionPayload;

type AuthMode = "none" | "byok" | "demo";

type AuthContextValue = Readonly<{
  mode: AuthMode;
  byokKey: string | null;
  demoSession: DemoSession | null;
  demoSessionLoading: boolean;
  demoSessionProbeFailed: boolean;
  authHeader: string | null;
  isAuthenticated: boolean;
  setByokKey: (value: string | null) => void;
  resetEncryptedKey: () => void;
  clearByokKey: () => void;
  clearDemoSession: () => Promise<void>;
  refreshDemoSession: () => Promise<void>;
  handleAuthorityDenial: (error: unknown) => boolean;
}>;

const INACTIVITY_TIMEOUT_MS = 30 * 60 * 1000;
const INACTIVITY_WARNING_MS = 2 * 60 * 1000;
const MAX_TIMEOUT_MS = 2_147_483_647;

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider(props: Readonly<{ children: React.ReactNode }>) {
  const [byokKey, setByokKeyState] = useState<string | null>(null);
  const [demoSession, setDemoSessionState] = useState<DemoSession | null>(null);
  const [demoSessionLoading, setDemoSessionLoading] = useState(true);
  const [demoSessionProbeFailed, setDemoSessionProbeFailed] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const warningTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const demoExpiryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearByokTimers = useCallback(() => {
    if (!timeoutRef.current) {
      if (warningTimeoutRef.current) {
        clearTimeout(warningTimeoutRef.current);
        warningTimeoutRef.current = null;
      }
      return;
    }
    clearTimeout(timeoutRef.current);
    timeoutRef.current = null;
    if (warningTimeoutRef.current) {
      clearTimeout(warningTimeoutRef.current);
      warningTimeoutRef.current = null;
    }
  }, []);

  const clearDemoExpiryTimer = useCallback(() => {
    if (!demoExpiryTimeoutRef.current) {
      return;
    }
    clearTimeout(demoExpiryTimeoutRef.current);
    demoExpiryTimeoutRef.current = null;
  }, []);

  const clearByokKey = useCallback(() => {
    setByokKeyState(null);
    clearByokTimers();
    writeActiveSessionId(null);
  }, [clearByokTimers]);

  const resetTimeout = useCallback(() => {
    clearByokTimers();
    warningTimeoutRef.current = setTimeout(() => {
      toast.message("BYOK key locks in two minutes unless workbench activity continues.");
    }, INACTIVITY_TIMEOUT_MS - INACTIVITY_WARNING_MS);
    timeoutRef.current = setTimeout(() => {
      clearByokKey();
    }, INACTIVITY_TIMEOUT_MS);
  }, [clearByokKey, clearByokTimers]);

  const setByokKey = useCallback(
    (value: string | null) => {
      setByokKeyState(value);
      if (value) {
        resetTimeout();
      } else {
        clearByokTimers();
      }
    },
    [clearByokTimers, resetTimeout],
  );

  const clearLocalDemoSession = useCallback(() => {
    clearDemoExpiryTimer();
    setDemoSessionState(null);
    writeActiveSessionId(null);
    writeLastCouncilRef(FOUNDING_COUNCIL_CHOICE);
  }, [clearDemoExpiryTimer]);

  const clearDemoSession = useCallback(async () => {
    try {
      await logoutDemoSession();
      clearLocalDemoSession();
    } catch (error) {
      if (shouldClearLocalDemoSessionAfterLogoutError(error)) {
        clearLocalDemoSession();
        return;
      }
      throw error;
    }
  }, [clearLocalDemoSession]);

  const resetExpiredDemoSession = useCallback(() => {
    clearLocalDemoSession();
    toast.message("Demo seal expired. Request a fresh magic link or unlock BYOK.");
  }, [clearLocalDemoSession]);

  const resetEncryptedKey = useCallback(() => {
    clearByokKey();
    clearEncryptedKey();
  }, [clearByokKey]);

  const handleAuthorityDenial = useCallback(
    (error: unknown) => {
      if (
        !(error instanceof ApiErrorResponse) ||
        error.kind !== "unauthorized" ||
        error.unauthorizedReason === null
      ) {
        return false;
      }
      if (
        error.unauthorizedReason !== "missing_auth" &&
        error.unauthorizedReason !== "invalid_token" &&
        error.unauthorizedReason !== "expired_token"
      ) {
        return false;
      }
      if (byokKey) {
        clearByokKey();
        toast.error("OpenRouter authority was lost. The workbench is locked.");
        return true;
      }
      if (demoSession) {
        clearLocalDemoSession();
        toast.error("Demo authority was lost. The workbench is locked.");
        return true;
      }
      return false;
    },
    [byokKey, clearByokKey, clearLocalDemoSession, demoSession],
  );

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
      clearByokTimers();
    };
  }, [byokKey, clearByokTimers, resetTimeout]);

  const fetchAndApplyDemoSession = useCallback(
    async (isCancelled: () => boolean) => {
      setDemoSessionLoading(true);
      setDemoSessionProbeFailed(false);
      try {
        const session = await fetchDemoSession();
        if (isCancelled()) {
          return;
        }
        if (session.expiresAt > Date.now()) {
          setDemoSessionState(session);
          return;
        }
        clearLocalDemoSession();
      } catch (error) {
        if (isCancelled()) {
          return;
        }
        if (error instanceof ApiErrorResponse && error.kind === "unauthorized") {
          setDemoSessionProbeFailed(false);
          return;
        }
        setDemoSessionProbeFailed(true);
      } finally {
        if (!isCancelled()) {
          setDemoSessionLoading(false);
        }
      }
    },
    [clearLocalDemoSession],
  );

  const refreshDemoSession = useCallback(async () => {
    await fetchAndApplyDemoSession(() => false);
  }, [fetchAndApplyDemoSession]);

  useEffect(() => {
    let cancelled = false;
    void fetchAndApplyDemoSession(() => cancelled);
    return () => {
      cancelled = true;
    };
  }, [fetchAndApplyDemoSession]);

  useEffect(() => {
    if (!demoSession) {
      clearDemoExpiryTimer();
      return;
    }
    const activeDemoSession = demoSession;
    function expireIfNeeded() {
      if (activeDemoSession.expiresAt <= Date.now()) {
        resetExpiredDemoSession();
        return true;
      }
      return false;
    }
    if (expireIfNeeded()) {
      return;
    }
    const delay = Math.max(0, Math.min(activeDemoSession.expiresAt - Date.now(), MAX_TIMEOUT_MS));
    demoExpiryTimeoutRef.current = setTimeout(() => {
      resetExpiredDemoSession();
    }, delay);
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        expireIfNeeded();
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      clearDemoExpiryTimer();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [clearDemoExpiryTimer, demoSession, resetExpiredDemoSession]);

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
      demoSessionLoading,
      demoSessionProbeFailed,
      authHeader,
      isAuthenticated: mode !== "none",
      setByokKey,
      resetEncryptedKey,
      clearByokKey,
      clearDemoSession,
      refreshDemoSession,
      handleAuthorityDenial,
    }),
    [
      authHeader,
      byokKey,
      clearByokKey,
      clearDemoSession,
      demoSession,
      demoSessionLoading,
      demoSessionProbeFailed,
      mode,
      resetEncryptedKey,
      setByokKey,
      refreshDemoSession,
      handleAuthorityDenial,
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
