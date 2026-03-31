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
import { exportSessions, fetchSessions } from "@/lib/api";
import { writeActiveSessionId } from "@/lib/storage";

function downloadText(filename: string, text: string, type: string) {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function SessionsScreen() {
  const auth = useAuth();
  const [sessions, setSessions] = useState<Awaited<ReturnType<typeof fetchSessions>>>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedIds, setSelectedIds] = useState<number[]>([]);

  useEffect(() => {
    const authHeader = auth.authHeader;
    if (!authHeader) {
      setSessions([]);
      return;
    }

    let cancelled = false;
    async function load(currentAuthHeader: string) {
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
  }, [auth.authHeader, selectedSessionId]);

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
    if (!auth.authHeader || selectedIds.length === 0) {
      return;
    }

    try {
      const result = await exportSessions(auth.authHeader, selectedIds);
      downloadText("sessions.md", result.markdown, "text/markdown");
      downloadText("sessions.json", result.json, "application/json");
      toast.success("Selected sessions exported");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Export failed");
    }
  }

  if (!auth.isAuthenticated) {
    return (
      <Card className="p-6">
        <p className="text-sm text-[var(--muted-foreground)]">
          Unlock BYOK or start a demo session to view the journal.
        </p>
      </Card>
    );
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[420px_minmax(0,1fr)]">
      <Card className="p-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <Badge>Journal</Badge>
            <h1 className="mt-4 text-3xl font-semibold tracking-[-0.05em]">Sessions</h1>
          </div>
          <Button
            variant="secondary"
            onClick={handleExportSelected}
            disabled={selectedIds.length === 0}
          >
            Export Selected
          </Button>
        </div>
        <div className="mt-5 grid gap-3">
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search query or council"
          />
          <Input
            list="status-options"
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
            placeholder="all"
          />
          <datalist id="status-options">
            <option value="all" />
            <option value="pending" />
            <option value="processing" />
            <option value="completed" />
            <option value="failed" />
          </datalist>
        </div>
        <div className="mt-5 space-y-3">
          {filteredSessions.map((session) => (
            <button
              key={session.id}
              type="button"
              className="w-full rounded-[24px] border border-[var(--border)] bg-white/70 p-4 text-left transition hover:border-[var(--accent)]"
              onClick={() => {
                setSelectedSessionId(session.id);
                writeActiveSessionId(session.id);
              }}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold">{session.query}</div>
                  <div className="mt-1 text-xs uppercase tracking-[0.18em] text-[var(--muted-foreground)]">
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
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <SessionStatusBadge status={session.status} failureKind={session.failureKind} />
                <Badge>{session.totalTokens} tokens</Badge>
              </div>
            </button>
          ))}
          {filteredSessions.length === 0 ? (
            <p className="text-sm text-[var(--muted-foreground)]">
              No sessions match the current filters.
            </p>
          ) : null}
        </div>
      </Card>

      <SessionInspector
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
