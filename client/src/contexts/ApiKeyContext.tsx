import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { clearEncryptedKey } from "@/lib/crypto";
import { clearActiveSessionId } from "@/features/sessions/domain/activeSession";

interface ApiKeyContextType {
  apiKey: string | null;
  setApiKey: (key: string | null) => void;
  clearApiKey: () => void;
  resetEncryptedKey: () => void;
  isAuthenticated: boolean;
}

const ApiKeyContext = createContext<ApiKeyContextType | undefined>(undefined);

export function ApiKeyProvider({ children }: { children: ReactNode }) {
  // API key stored in memory only (not persisted)
  const [apiKey, setApiKeyState] = useState<string | null>(null);

  // Session timeout (30 minutes of inactivity)
  const SESSION_TIMEOUT = 30 * 60 * 1000;
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimeoutRef = useCallback(() => {
    if (!timeoutRef.current) return;
    clearTimeout(timeoutRef.current);
    timeoutRef.current = null;
  }, []);

  const clearApiKey = useCallback(() => {
    setApiKeyState(null);
    clearTimeoutRef();
    clearActiveSessionId();
  }, [clearTimeoutRef]);

  const resetTimeout = useCallback(() => {
    clearTimeoutRef();
    timeoutRef.current = setTimeout(() => {
      clearApiKey();
    }, SESSION_TIMEOUT);
  }, [clearApiKey, clearTimeoutRef]);

  // Set API key in memory and start session timeout
  const setApiKey = useCallback((key: string | null) => {
    setApiKeyState(key);
    if (!key) {
      clearTimeoutRef();
      return;
    }
    resetTimeout();
  }, [clearTimeoutRef, resetTimeout]);

  // Clear encrypted key from storage (full reset)
  const resetEncryptedKey = useCallback(() => {
    clearApiKey();
    clearEncryptedKey();
  }, [clearApiKey]);

  // Reset timeout on user activity
  useEffect(() => {
    if (!apiKey) return;

    const activityEvents = ['mousedown', 'keydown', 'scroll', 'touchstart'];
    
    const handleActivity = () => {
      resetTimeout();
    };

    activityEvents.forEach(event => {
      window.addEventListener(event, handleActivity);
    });

    return () => {
      activityEvents.forEach(event => {
        window.removeEventListener(event, handleActivity);
      });
      clearTimeoutRef();
    };
  }, [apiKey, clearTimeoutRef, resetTimeout]);

  return (
    <ApiKeyContext.Provider
      value={{
        apiKey,
        setApiKey,
        clearApiKey,
        resetEncryptedKey,
        isAuthenticated: !!apiKey,
      }}
    >
      {children}
    </ApiKeyContext.Provider>
  );
}

export function useApiKey() {
  const context = useContext(ApiKeyContext);
  if (context === undefined) {
    throw new Error("useApiKey must be used within an ApiKeyProvider");
  }
  return context;
}
