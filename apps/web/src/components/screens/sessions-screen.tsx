"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/components/app/auth-provider";
import { SessionInspector } from "@/components/sessions/session-inspector";
import { SessionStatusBadge } from "@/components/sessions/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  continueSession,
  exportSessions,
  fetchCouncils,
  fetchSession,
  fetchSessions,
  rerunSession,
} from "@/lib/api";
import { writeActiveSessionId } from "@/lib/storage";
import { cn } from "@/lib/utils";

function downloadText(filename: string, text: string, type: string) {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

const STATUS_FILTERS = [
  { value: "all", label: "All" },
  { value: "completed", label: "Completed" },
  { value: "processing", label: "Running" },
  { value: "pending", label: "Pending" },
  { value: "failed", label: "Failed" },
] as const;

export function SessionsScreen() {
  const auth = useAuth();
  const [sessions, setSessions] = useState<Awaited<ReturnType<typeof fetchSessions>>>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selectedIds, setSelectedIds] = useState<number[]>([]);

  useEffect(() => {
    const authHeader = auth.authHeader;
    if (!auth.isAuthenticated) {
      setSessions([]);
      return;
    }

    let cancelled = false;
    async function load(currentAuthHeader: string | null) {
      try {
        const result = await fetchSessions(currentAuthHeader);
        if (!cancelled) {
          setSessions(result);
          if (!selectedSessionId && result[0]) {
            setSelectedSessionId(result[0].id);
          }
        }
      } catch (error) {
        if (!cancelled) {
          toast.error(error instanceof Error ? error.message : "Failed to load sessions");
        }
      }
    }

    void load(authHeader);
    const interval = setInterval(() => {
      void load(authHeader);
    }, 2500);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [auth.authHeader, auth.isAuthenticated, selectedSessionId]);

  const filteredSessions = useMemo(() => {
    return sessions.filter((session) => {
      const matchesSearch =
        session.query.toLowerCase().includes(search.toLowerCase()) ||
        session.councilNameAtRun.toLowerCase().includes(search.toLowerCase());
      const matchesStatus = statusFilter === "all" || session.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [search, sessions, statusFilter]);

  async function handleExportSelected() {
    if (!auth.isAuthenticated || selectedIds.length === 0) return;
    try {
      const result = await exportSessions(auth.authHeader, selectedIds);
      downloadText("sessions.md", result.markdown, "text/markdown");
      downloadText("sessions.json", result.json, "application/json");
      toast.success("Selected sessions exported");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Export failed");
    }
  }

  async function handleContinueRow(sessionId: number) {
    if (!auth.isAuthenticated) return;
    try {
      await continueSession(auth.authHeader, sessionId);
      toast.success("Run continued");
      const next = await fetchSession(auth.authHeader, sessionId);
      setSessions((current) =>
        current.map((session) =>
          session.id === sessionId ? { ...session, status: next.session.status } : session,
        ),
      );
      setSelectedSessionId(sessionId);
      writeActiveSessionId(sessionId);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Continue failed");
    }
  }

  async function handleRerunRow(sessionId: number, councilName: string) {
    if (!auth.isAuthenticated) return;
    try {
      const councils = (await fetchCouncils(auth.authHeader)).councils;
      const matched = councils.find((council) => council.name === councilName);
      if (!matched) {
        toast.error(
          `Council "${councilName}" is no longer available. Open the run and pick another.`,
        );
        setSelectedSessionId(sessionId);
        writeActiveSessionId(sessionId);
        return;
      }
      const result = await rerunSession({
        authHeader: auth.authHeader,
        sessionId,
        councilRef: matched.ref,
      });
      toast.success("New run created");
      const refreshed = await fetchSessions(auth.authHeader);
      setSessions(refreshed);
      setSelectedSessionId(result.sessionId);
      writeActiveSessionId(result.sessionId);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Rerun failed");
    }
  }

  if (!auth.isAuthenticated) {
    return (
      <Card className="p-8 text-center">
        <p className="text-sm text-[var(--text-muted)]">
          Unlock BYOK or start a demo session to view the journal.
        </p>
      </Card>
    );
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[440px_minmax(0,1fr)]">
      <Card className="p-6">
        <div className="flex items-baseline justify-between gap-3">
          <h1 className="surface-title text-sm uppercase tracking-[0.22em]">Journal</h1>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleExportSelected}
            disabled={selectedIds.length === 0}
          >
            Export Selected
          </Button>
        </div>

        <div className="mt-4 space-y-3">
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search query or council"
          />
          <div className="flex flex-wrap gap-1.5">
            {STATUS_FILTERS.map((filter) => (
              <button
                key={filter.value}
                type="button"
                className={cn(
                  "btn-nav",
                  "px-3 text-xs",
                  statusFilter === filter.value && "btn-nav-active",
                )}
                style={{ fontSize: "0.78rem", minHeight: "2rem", padding: "0.3rem 0.7rem" }}
                onClick={() => setStatusFilter(filter.value)}
              >
                {filter.label}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-5 space-y-3">
          {filteredSessions.map((session) => {
            const isSelected = selectedSessionId === session.id;
            const canContinue = session.status === "failed";
            const canRerun = session.status === "failed" || session.status === "completed";
            return (
              // biome-ignore lint/a11y/useSemanticElements: row contains nested action buttons; <button> would nest interactive descendants
              <div
                key={session.id}
                className={cn(
                  "panel space-y-3",
                  "cursor-pointer transition-[border-color]",
                  isSelected ? "border-[var(--gold)]" : "hover:border-[var(--gold-soft)]",
                )}
                onClick={() => {
                  setSelectedSessionId(session.id);
                  writeActiveSessionId(session.id);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    setSelectedSessionId(session.id);
                    writeActiveSessionId(session.id);
                  }
                }}
                role="button"
                tabIndex={0}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="line-clamp-2 text-sm font-semibold">{session.query}</div>
                    <div className="mt-1 text-xs uppercase tracking-[0.18em] text-[var(--text-dim)]">
                      {session.councilNameAtRun}
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(session.id)}
                    onChange={(event) => {
                      setSelectedIds((current) =>
                        event.target.checked
                          ? [...current, session.id]
                          : current.filter((id) => id !== session.id),
                      );
                    }}
                    onClick={(event) => event.stopPropagation()}
                  />
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <SessionStatusBadge status={session.status} failureKind={session.failureKind} />
                  <Badge>{session.totalTokens} tokens</Badge>
                  <Badge>
                    {session.totalCostIsPartial && session.totalCostUsdMicros === 0
                      ? "cost pending"
                      : `$${session.totalCost}`}
                  </Badge>
                </div>
                {(canContinue || canRerun) && (
                  <div className="flex flex-wrap gap-2 pt-1">
                    {canContinue ? (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={(event) => {
                          event.stopPropagation();
                          void handleContinueRow(session.id);
                        }}
                      >
                        Continue
                      </Button>
                    ) : null}
                    {canRerun ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(event) => {
                          event.stopPropagation();
                          void handleRerunRow(session.id, session.councilNameAtRun);
                        }}
                      >
                        Rerun
                      </Button>
                    ) : null}
                  </div>
                )}
              </div>
            );
          })}
          {filteredSessions.length === 0 ? (
            <p className="text-sm text-[var(--text-muted)]">
              No sessions match the current filters.
            </p>
          ) : null}
        </div>
      </Card>

      <SessionInspector
        authenticated={auth.isAuthenticated}
        authHeader={auth.authHeader}
        sessionId={selectedSessionId}
        onSpawnedSession={(sessionId) => {
          setSelectedSessionId(sessionId);
          writeActiveSessionId(sessionId);
        }}
      />
    </div>
  );
}
