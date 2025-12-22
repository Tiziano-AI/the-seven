import { useQuery } from "@tanstack/react-query";
import { fetchSession } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import type { SessionDetailPayload } from "@shared/domain/apiSchemas";

export type SessionResults = SessionDetailPayload;

export type SessionPollingPolicy = "never" | "untilTerminal" | "always";

export function useSessionResults(params: {
  sessionId: number | null;
  polling: SessionPollingPolicy;
  intervalMs?: number;
}) {
  const intervalMs = params.intervalMs ?? 2000;
  const { authHeader } = useAuth();

  return useQuery({
    queryKey: ["session", params.sessionId, authHeader],
    queryFn: async () => {
      if (!authHeader || params.sessionId === null) {
        throw new Error("Missing authentication");
      }
      return fetchSession({ authHeader, sessionId: params.sessionId });
    },
    enabled: params.sessionId !== null && !!authHeader,
    refetchInterval: params.sessionId === null
      ? false
      : (query) => {
          if (params.polling === "never") return false;
          if (params.polling === "always") return intervalMs;

          const status = query.state.data?.session.status;
          if (status === "completed" || status === "failed") return false;
          return intervalMs;
        },
  });
}
