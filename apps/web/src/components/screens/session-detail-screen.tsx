"use client";

import { useRouter } from "next/navigation";
import { useAuth } from "@/components/app/auth-provider";
import { SessionInspector } from "@/components/sessions/session-inspector";
import { Card } from "@/components/ui/card";

export function SessionDetailScreen(props: { sessionId: number }) {
  const auth = useAuth();
  const router = useRouter();

  if (!auth.isAuthenticated) {
    return (
      <Card className="p-6">
        <p className="text-sm text-[var(--muted-foreground)]">
          Unlock BYOK or start a demo session to inspect this run.
        </p>
      </Card>
    );
  }

  return (
    <SessionInspector
      authenticated={auth.isAuthenticated}
      authHeader={auth.authHeader}
      sessionId={props.sessionId}
      onSpawnedSession={(sessionId) => router.push(`/sessions/${sessionId}`)}
    />
  );
}
