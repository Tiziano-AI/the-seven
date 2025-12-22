import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { consumeDemoLink, requestDemoLink } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";

export type DemoAuthState = "idle" | "requesting" | "sent" | "active";

export function useDemoAuth(): {
  state: DemoAuthState;
  emailInput: string;
  setEmailInput: (value: string) => void;
  isRequesting: boolean;
  requestLink: () => Promise<void>;
  consumeToken: (token: string) => Promise<void>;
  resetRequest: () => void;
} {
  const { demoSession, setDemoSession } = useAuth();
  const [emailInput, setEmailInput] = useState("");
  const [isRequesting, setIsRequesting] = useState(false);
  const [state, setState] = useState<DemoAuthState>(() => (demoSession ? "active" : "idle"));

  useEffect(() => {
    if (demoSession) {
      setState("active");
    }
  }, [demoSession]);

  const requestLink = useCallback(async () => {
    const trimmed = emailInput.trim();
    if (!trimmed) {
      toast.error("Enter your email");
      return;
    }

    setIsRequesting(true);
    setState("requesting");
    try {
      await requestDemoLink({ email: trimmed });
      setState("sent");
      toast.success("Magic link sent");
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Failed to send demo link");
      setState("idle");
    } finally {
      setIsRequesting(false);
    }
  }, [emailInput]);

  const consumeToken = useCallback(async (token: string) => {
    try {
      const result = await consumeDemoLink({ token });
      setDemoSession({ token: result.token, email: result.email, expiresAt: result.expiresAt });
      toast.success("Demo unlocked");
      setState("active");
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Failed to unlock demo");
      setState("idle");
    }
  }, [setDemoSession]);

  const resetRequest = useCallback(() => {
    setState("idle");
  }, []);

  return {
    state,
    emailInput,
    setEmailInput,
    isRequesting,
    requestLink,
    consumeToken,
    resetRequest,
  };
}
