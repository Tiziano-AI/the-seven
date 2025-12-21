import { useCallback, useEffect, useMemo, useState } from "react";
import { httpBatchLink } from "@trpc/client";
import superjson from "superjson";
import { toast } from "sonner";
import { useApiKey } from "@/contexts/ApiKeyContext";
import { hasEncryptedKey } from "@/lib/crypto";
import { trpc } from "@/lib/trpc";
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
  const { apiKey, setApiKey, clearApiKey, isAuthenticated } = useApiKey();

  const [authState, setAuthState] = useState<HomeAuthState>(() => {
    if (isAuthenticated && apiKey) return "authenticated";
    return deriveUnauthenticatedState();
  });

  const [apiKeyInput, setApiKeyInput] = useState("");
  const [isValidatingKey, setIsValidatingKey] = useState(false);

  const apiKeyForPasswordSetup = useMemo(() => apiKeyInput.trim(), [apiKeyInput]);

  useEffect(() => {
    if (isAuthenticated && apiKey && authState !== "authenticated") {
      setAuthState("authenticated");
    }
  }, [apiKey, authState, isAuthenticated]);

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
      const validationClient = trpc.createClient({
        links: [
          httpBatchLink({
            url: "/api/trpc",
            transformer: superjson,
            headers() {
              return { Authorization: `Bearer ${trimmedApiKey}` };
            },
          }),
        ],
      });

      const result = await validationClient.auth.validateKey.query();
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

    setApiKey(trimmed);
    setApiKeyInput("");
    setAuthState("authenticated");
    toast.success("Key locked and saved");
  }, [apiKeyInput, setApiKey]);

  const unlock = useCallback(
    (decryptedApiKey: string) => {
      setApiKey(decryptedApiKey);
      setAuthState("authenticated");
      toast.success("Welcome back!");
    },
    [setApiKey]
  );

  const reset = useCallback(() => {
    setAuthState("initial");
    setApiKeyInput("");
    clearActiveSessionId();
    clearLastCouncilValue();
    clearQueryDraft();
  }, []);

  const lock = useCallback(() => {
    clearApiKey();
    setApiKeyInput("");
    setAuthState(deriveUnauthenticatedState());
    toast.message("Locked");
  }, [clearApiKey]);

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
