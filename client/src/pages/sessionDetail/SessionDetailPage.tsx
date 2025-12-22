import { useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "@/lib/routing/router";
import { useSessionResults } from "@/features/sessions/hooks/useSessionResults";
import { parseSessionIdFromRouteParam } from "./domain/sessionId";
import { AppShell } from "@/components/AppShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RunSheet } from "@/features/sessions/components/RunSheet";

/**
 * SessionDetailPage renders the canonical Run Sheet for deep links.
 */
export default function SessionDetailPage(props: { sessionIdParam: string }) {
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!isAuthenticated) {
      navigate("/");
    }
  }, [isAuthenticated, navigate]);

  const parsedSessionId = parseSessionIdFromRouteParam(props.sessionIdParam);

  useEffect(() => {
    if (parsedSessionId.ok) return;
    navigate("/404");
  }, [navigate, parsedSessionId]);

  const sessionQuery = useSessionResults({
    sessionId: parsedSessionId.ok ? parsedSessionId.sessionId : null,
    polling: "untilTerminal",
    intervalMs: 2000,
  });

  if (!isAuthenticated) {
    return null;
  }

  if (!parsedSessionId.ok) {
    return null;
  }

  if (sessionQuery.isError) {
    return (
      <AppShell layout="centered">
        <Card>
          <CardHeader>
            <CardTitle>Run unavailable</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">{sessionQuery.error.message}</p>
            <Button onClick={() => navigate("/journal")} className="mt-4">
              Back to Journal
            </Button>
          </CardContent>
        </Card>
      </AppShell>
    );
  }

  if (!sessionQuery.data && !sessionQuery.isLoading) {
    return (
      <AppShell layout="centered">
        <Card>
          <CardHeader>
            <CardTitle>Run not found</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">That run is not in your journal.</p>
            <Button onClick={() => navigate("/journal")} className="mt-4">
              Back to Journal
            </Button>
          </CardContent>
        </Card>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="content-wide">
        <RunSheet
          sessionId={parsedSessionId.sessionId}
          data={sessionQuery.data}
          isLoading={sessionQuery.isLoading}
          context="detail"
          onRefetch={sessionQuery.refetch}
        />
      </div>
    </AppShell>
  );
}
