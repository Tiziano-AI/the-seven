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
      <div>
        <h1 className="sr-only">Manuscript</h1>
        <Card className="p-6">
          <p className="text-sm text-[var(--text-muted)]">
            Unlock BYOK or start a demo session to inspect this run.
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div>
      <h1 className="sr-only">Manuscript</h1>
      <SessionInspector
        authenticated={auth.isAuthenticated}
        authHeader={auth.authHeader}
        sessionId={props.sessionId}
        onAuthorityDenial={auth.handleAuthorityDenial}
        onSpawnedSession={(sessionId) => router.push(`/sessions/${sessionId}`)}
      />
    </div>
  );
}
