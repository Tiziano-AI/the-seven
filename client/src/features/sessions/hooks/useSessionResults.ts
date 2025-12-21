import { trpc } from "@/lib/trpc";
import type { RouterOutputs } from "@/lib/trpcTypes";

export type SessionResults = RouterOutputs["query"]["getSession"];

export type SessionPollingPolicy = "never" | "untilTerminal" | "always";

export function useSessionResults(params: {
  sessionId: number | null;
  polling: SessionPollingPolicy;
  intervalMs?: number;
}) {
  const intervalMs = params.intervalMs ?? 2000;

  return trpc.query.getSession.useQuery(
    { sessionId: params.sessionId ?? 0 },
    {
      enabled: params.sessionId !== null,
      refetchInterval:
        params.sessionId === null
          ? false
          : (query) => {
              if (params.polling === "never") return false;
              if (params.polling === "always") return intervalMs;

              const status = query.state.data?.session.status;
              if (status === "completed" || status === "failed") return false;
              return intervalMs;
            },
    }
  );
}

