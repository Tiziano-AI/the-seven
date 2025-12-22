import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { hasEncryptedKey } from "@/lib/crypto";
import { validateByokKey } from "@/lib/api";
import { clearActiveSessionId } from "@/features/sessions/domain/activeSession";
import { clearLastCouncilValue } from "@/features/councils/domain/lastCouncil";
import { clearQueryDraft } from "@/features/sessions/domain/queryDraft";

export type HomeAuthState = "initial" | "setup-password" | "unlock" | "authenticated";

function deriveUnauthenticatedState(): Exclude<HomeAuthState, "setup-password" | "authenticated"> {
  return hasEncryptedKey() ? "unlock" : "initial";
}

export function useHomeAuth(): {
  authState: HomeAuthState;
  apiKeyInput: string;
  setApiKeyInput: (value: string) => void;
  isValidatingKey: boolean;
  validateApiKeyInput: () => Promise<void>;
  completePasswordSetup: () => void;
  unlock: (decryptedApiKey: string) => void;
  reset: () => void;
  lock: () => void;
  apiKeyForPasswordSetup: string;
} {
  const { byokKey, setByokKey, clearByokKey, isAuthenticated } = useAuth();

  const [authState, setAuthState] = useState<HomeAuthState>(() => {
    if (isAuthenticated && byokKey) return "authenticated";
    return deriveUnauthenticatedState();
  });

  const [apiKeyInput, setApiKeyInput] = useState("");
  const [isValidatingKey, setIsValidatingKey] = useState(false);

  const apiKeyForPasswordSetup = useMemo(() => apiKeyInput.trim(), [apiKeyInput]);

  useEffect(() => {
    if (isAuthenticated && byokKey && authState !== "authenticated") {
      setAuthState("authenticated");
    }
  }, [authState, byokKey, isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated && authState === "authenticated") {
      setAuthState(deriveUnauthenticatedState());
    }
  }, [authState, isAuthenticated]);

  const validateApiKeyInput = useCallback(async () => {
    const trimmedApiKey = apiKeyInput.trim();
    if (!trimmedApiKey) {
      toast.error("Please enter your key");
      return;
    }

    setIsValidatingKey(true);
    try {
      const result = await validateByokKey({ apiKey: trimmedApiKey });
      if (!result.valid) {
        toast.error("That key didn’t work");
        return;
      }

      setAuthState("setup-password");
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Couldn’t validate that key");
    } finally {
      setIsValidatingKey(false);
    }
  }, [apiKeyInput]);

  const completePasswordSetup = useCallback(() => {
    const trimmed = apiKeyInput.trim();
    if (!trimmed) {
      toast.error("Missing key");
      setAuthState("initial");
      return;
    }

    setByokKey(trimmed);
    setApiKeyInput("");
    setAuthState("authenticated");
    toast.success("Key locked and saved");
  }, [apiKeyInput, setByokKey]);

  const unlock = useCallback(
    (decryptedApiKey: string) => {
      setByokKey(decryptedApiKey);
      setAuthState("authenticated");
      toast.success("Welcome back!");
    },
    [setByokKey]
  );

  const reset = useCallback(() => {
    setAuthState("initial");
    setApiKeyInput("");
    clearActiveSessionId();
    clearLastCouncilValue();
    clearQueryDraft();
  }, []);

  const lock = useCallback(() => {
    clearByokKey();
    setApiKeyInput("");
    setAuthState(deriveUnauthenticatedState());
    toast.message("Locked");
  }, [clearByokKey]);

  return {
    authState,
    apiKeyInput,
    setApiKeyInput,
    isValidatingKey,
    validateApiKeyInput,
    completePasswordSetup,
    unlock,
    reset,
    lock,
    apiKeyForPasswordSetup,
  };
}
