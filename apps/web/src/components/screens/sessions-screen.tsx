"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/components/app/auth-provider";
import { SessionInspector } from "@/components/sessions/session-inspector";
import {
  downloadText,
  formatCostEvidence,
  formatTokenEvidence,
} from "@/components/sessions/session-inspector-formatters";
import { SessionStatusBadge } from "@/components/sessions/status-badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { exportSessions, fetchSessions } from "@/lib/api";
import { readActiveSessionId, writeActiveSessionId } from "@/lib/storage";
import { cn } from "@/lib/utils";

const STATUS_FILTERS = [
  { value: "all", label: "All" },
  { value: "completed", label: "Verdicts" },
  { value: "processing", label: "Deliberating" },
  { value: "pending", label: "Filed" },
  { value: "failed", label: "Recovery" },
] as const;

type ArchiveIntent = "recovery" | "rerun" | null;

export function SessionsScreen() {
  const auth = useAuth();
  const [sessions, setSessions] = useState<Awaited<ReturnType<typeof fetchSessions>>>([]);
  const restoredSessionIdRef = useRef<number | null>(readActiveSessionId());
  const [selectedSessionId, setSelectedSessionId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [archiveIntent, setArchiveIntent] = useState<ArchiveIntent>(null);
  const [archiveLoadIssue, setArchiveLoadIssue] = useState<string | null>(null);
  const [archiveLoadPending, setArchiveLoadPending] = useState(false);
  const detailRef = useRef<HTMLDivElement | null>(null);

  const loadArchive = useCallback(async () => {
    if (!auth.isAuthenticated) {
      setSessions([]);
      setSelectedSessionId(null);
      setArchiveLoadIssue(null);
      return;
    }
    setArchiveLoadPending(true);
    try {
      const result = await fetchSessions(auth.authHeader);
      setSessions(result);
      setArchiveLoadIssue(null);
      setSelectedSessionId((current) => {
        if (current && result.some((session) => session.id === current)) {
          return current;
        }
        const restoredSessionId = restoredSessionIdRef.current;
        restoredSessionIdRef.current = null;
        if (restoredSessionId && result.some((session) => session.id === restoredSessionId)) {
          return restoredSessionId;
        }
        writeActiveSessionId(null);
        return null;
      });
    } catch (error) {
      if (auth.handleAuthorityDenial(error)) {
        return;
      }
      setArchiveLoadIssue(error instanceof Error ? error.message : "Archive could not load.");
    } finally {
      setArchiveLoadPending(false);
    }
  }, [auth.authHeader, auth.handleAuthorityDenial, auth.isAuthenticated]);

  useEffect(() => {
    if (!auth.isAuthenticated) {
      setSessions([]);
      setSelectedSessionId(null);
      setArchiveLoadIssue(null);
      return;
    }

    void loadArchive();
    const interval = setInterval(() => {
      if (document.hidden) {
        return;
      }
      void loadArchive();
    }, 2500);
    return () => {
      clearInterval(interval);
    };
  }, [auth.isAuthenticated, loadArchive]);

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
      downloadText("dossier.md", result.markdown, "text/markdown");
      downloadText("dossier.json", result.json, "application/json");
      toast.success("Dossier marks exported");
    } catch (error) {
      if (auth.handleAuthorityDenial(error)) {
        return;
      }
      toast.error(error instanceof Error ? error.message : "Export failed");
    }
  }

  function openSessionDetail(sessionId: number, intent: ArchiveIntent = null) {
    setSelectedSessionId(sessionId);
    setArchiveIntent(intent);
    writeActiveSessionId(sessionId);
    requestAnimationFrame(() => {
      if (window.innerWidth <= 1080) {
        detailRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    });
  }

  if (!auth.isAuthenticated) {
    return (
      <div>
        <h1 className="sr-only">Archive</h1>
        <Card className="p-8 text-center">
          <p className="text-sm text-[var(--text-muted)]">
            Unlock BYOK or start a demo session to view the archive.
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className={cn("archive-grid", selectedSessionId !== null && "archive-grid-detail-open")}>
      <Card className="p-6">
        <div className="flex items-baseline justify-between gap-3">
          <h1 className="surface-title">Archive</h1>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleExportSelected}
            disabled={selectedIds.length === 0}
          >
            Export Dossier
          </Button>
        </div>

        <div className="mt-4 space-y-3">
          <Input
            value={search}
            aria-label="Search archive"
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search matter or council"
          />
          <fieldset className="choice-grid">
            <legend className="docket-question-label">Archive status</legend>
            {STATUS_FILTERS.map((filter) => (
              <label
                key={filter.value}
                className={cn("filter-chip", statusFilter === filter.value && "filter-chip-active")}
              >
                <input
                  className="choice-input"
                  type="radio"
                  name="archive-status-filter"
                  value={filter.value}
                  checked={statusFilter === filter.value}
                  onChange={(event) => {
                    if (event.currentTarget.checked) setStatusFilter(filter.value);
                  }}
                />
                {filter.label}
              </label>
            ))}
          </fieldset>
        </div>

        <div className="mt-5 space-y-3">
          {archiveLoadIssue ? (
            <div className="panel archive-empty-state" role="status">
              <div>
                <p className="m-0 text-sm font-semibold text-[var(--text)]">
                  Archive could not load.
                </p>
                <p className="m-0 mt-1 text-sm text-[var(--text-muted)]">
                  {sessions.length > 0
                    ? "Showing the last loaded archive entries until refresh succeeds."
                    : "No archive entries are shown until the ledger refresh succeeds."}
                </p>
                <p className="m-0 mt-1 text-xs text-[var(--text-dim)]">{archiveLoadIssue}</p>
              </div>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => {
                  void loadArchive();
                }}
                disabled={archiveLoadPending}
              >
                {archiveLoadPending ? "Retrying…" : "Retry archive load"}
              </Button>
            </div>
          ) : null}
          {filteredSessions.map((session) => {
            const isSelected = selectedSessionId === session.id;
            const canContinue = session.status === "failed";
            const canRerun = session.status === "failed" || session.status === "completed";
            return (
              <div
                key={session.id}
                className={cn(
                  "panel archive-row",
                  isSelected ? "archive-row-active" : "hover:border-[var(--brass-soft)]",
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <button
                      type="button"
                      className="archive-row-title line-clamp-2"
                      aria-label={`Open manuscript for matter ${session.id}: ${session.query}`}
                      onClick={() => openSessionDetail(session.id)}
                    >
                      {session.query}
                    </button>
                    <div className="mt-1 text-xs uppercase tracking-[0.18em] text-[var(--text-dim)]">
                      {session.councilNameAtRun}
                    </div>
                  </div>
                  <button
                    type="button"
                    className={
                      selectedIds.includes(session.id)
                        ? "filter-chip filter-chip-active"
                        : "filter-chip"
                    }
                    aria-pressed={selectedIds.includes(session.id)}
                    aria-label={
                      selectedIds.includes(session.id)
                        ? `Remove matter ${session.id} from dossier: ${session.query}`
                        : `Add matter ${session.id} to dossier: ${session.query}`
                    }
                    onClick={(event) => {
                      event.stopPropagation();
                      setSelectedIds((current) =>
                        current.includes(session.id)
                          ? current.filter((id) => id !== session.id)
                          : [...current, session.id],
                      );
                    }}
                  >
                    {selectedIds.includes(session.id) ? "In dossier" : "Add to dossier"}
                  </button>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <SessionStatusBadge status={session.status} failureKind={session.failureKind} />
                  <span className="meta-chip">
                    {formatTokenEvidence(session.status, session.totalTokens)}
                  </span>
                  <span className="meta-chip">{formatCostEvidence(session)}</span>
                </div>
                {(canContinue || canRerun) && (
                  <div className="flex flex-wrap gap-2 pt-1">
                    {canContinue ? (
                      <Button
                        variant="secondary"
                        size="sm"
                        aria-label={`Open recovery for matter ${session.id}: ${session.query}`}
                        onClick={(event) => {
                          event.stopPropagation();
                          openSessionDetail(session.id, "recovery");
                        }}
                      >
                        Open Recovery
                      </Button>
                    ) : null}
                    {canRerun ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label={`Open rerun docket for matter ${session.id}: ${session.query}`}
                        onClick={(event) => {
                          event.stopPropagation();
                          openSessionDetail(session.id, "rerun");
                        }}
                      >
                        Open rerun docket
                      </Button>
                    ) : null}
                  </div>
                )}
              </div>
            );
          })}
          {!archiveLoadIssue && filteredSessions.length === 0 ? (
            sessions.length === 0 ? (
              <div className="panel archive-empty-state">
                <p className="m-0 text-sm text-[var(--text-muted)]">
                  No matters have entered the archive yet.
                </p>
                <Link className="text-link" href="/">
                  File a matter at the Petition Desk
                </Link>
              </div>
            ) : (
              <p className="text-sm text-[var(--text-muted)]">
                No archive entries match the current filters.
              </p>
            )
          ) : null}
        </div>
      </Card>

      <div className="archive-detail-panel" ref={detailRef}>
        <SessionInspector
          authenticated={auth.isAuthenticated}
          authHeader={auth.authHeader}
          sessionId={selectedSessionId}
          emptyState="archive"
          initialAction={archiveIntent}
          onAuthorityDenial={auth.handleAuthorityDenial}
          onSpawnedSession={(sessionId) => {
            setSelectedSessionId(sessionId);
            setArchiveIntent(null);
            writeActiveSessionId(sessionId);
          }}
        />
      </div>
    </div>
  );
}
