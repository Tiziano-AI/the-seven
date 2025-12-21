import { useEffect, useMemo, useState } from "react";
import { formatDistanceToNow } from "date-fns";

import { useApiKey } from "@/contexts/ApiKeyContext";
import { useNavigate } from "@/lib/routing/router";
import { trpc } from "@/lib/trpc";
import { AppShell } from "@/components/AppShell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatusBadge } from "@/features/sessions/components/StatusBadge";
import { Markdown } from "@/components/Markdown";
import { ExportDialog } from "@/features/sessions/components/ExportDialog";
import { readActiveSessionId } from "@/features/sessions/domain/activeSession";
import { useSessionResults } from "@/features/sessions/hooks/useSessionResults";
import { RunSheet } from "@/features/sessions/components/RunSheet";
import { formatUsdFromMicros } from "@shared/domain/usage";
import { cn } from "@/lib/utils";

type StatusFilter = "all" | "pending" | "processing" | "completed" | "failed";

function parseStatusFilter(value: string): StatusFilter {
  if (value === "pending") return "pending";
  if (value === "processing") return "processing";
  if (value === "completed") return "completed";
  if (value === "failed") return "failed";
  return "all";
}

/**
 * JournalPage renders the run list and inline Run Sheet selection.
 */
export default function JournalPage() {
  const { apiKey, isAuthenticated } = useApiKey();
  const navigate = useNavigate();
  const activeSessionId = readActiveSessionId();

  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [selectedIds, setSelectedIds] = useState<ReadonlyArray<number>>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<number | null>(null);
  const [exportTargetIds, setExportTargetIds] = useState<ReadonlyArray<number>>([]);
  const [exportOpen, setExportOpen] = useState(false);

  const { data: sessions, isLoading } = trpc.query.listSessions.useQuery(
    undefined,
    { enabled: !!apiKey }
  );

  useEffect(() => {
    if (!isAuthenticated) navigate("/");
  }, [isAuthenticated, navigate]);

  useEffect(() => {
    if (selectedSessionId !== null) return;
    if (activeSessionId) setSelectedSessionId(activeSessionId);
  }, [activeSessionId, selectedSessionId]);

  const filteredSessions = useMemo(() => {
    return (sessions ?? []).filter((session) => {
      const matchesStatus = statusFilter === "all" ? true : session.status === statusFilter;
      if (!matchesStatus) return false;
      if (!searchTerm.trim()) return true;
      const term = searchTerm.trim().toLowerCase();
      return (
        session.query.toLowerCase().includes(term) ||
        session.councilNameAtRun.toLowerCase().includes(term) ||
        String(session.id).includes(term)
      );
    });
  }, [sessions, searchTerm, statusFilter]);

  const orderedSessions = useMemo(() => {
    if (!activeSessionId) return filteredSessions;
    const active = filteredSessions.find((session) => session.id === activeSessionId);
    if (!active) return filteredSessions;
    return [active, ...filteredSessions.filter((session) => session.id !== activeSessionId)];
  }, [activeSessionId, filteredSessions]);

  const selectedSessionQuery = useSessionResults({
    sessionId: selectedSessionId,
    polling: "untilTerminal",
    intervalMs: 2000,
  });

  const toggleSelected = (sessionId: number) => {
    setSelectedIds((current) => {
      if (current.includes(sessionId)) {
        return current.filter((id) => id !== sessionId);
      }
      return [...current, sessionId];
    });
  };

  const selectAllVisible = () => {
    const allIds = orderedSessions.map((session) => session.id);
    setSelectedIds(allIds);
  };

  const clearSelection = () => {
    setSelectedIds([]);
  };

  if (!isAuthenticated) return null;

  if (isLoading && !sessions) {
    return (
      <AppShell layout="centered">
        <div className="space-y-4 w-full max-w-2xl">
          <Skeleton className="h-8 w-48" />
          {Array.from({ length: 4 }).map((_, index) => (
            <Card key={`journal-skeleton-${index}`}>
              <CardContent className="space-y-3 pt-6 pb-6">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-2/3" />
                <Skeleton className="h-3 w-1/2" />
              </CardContent>
            </Card>
          ))}
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <ExportDialog open={exportOpen} onOpenChange={setExportOpen} selectedIds={exportTargetIds} />

      <div className="content-wide space-y-6">
        <div>
          <h1>Journal</h1>
          <p className="text-muted-foreground text-sm mt-2">
            Every question you have brought to the council, with a single run sheet view.
          </p>
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-start justify-between gap-4">
              <div>
                <CardTitle>Runs</CardTitle>
                <CardDescription className="text-sm">
                  Filter, select, and inspect runs without leaving the page.
                </CardDescription>
              </div>
              <div className="action-rail text-sm text-muted-foreground">
                Export selection: {selectedIds.length}
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-[1fr_200px]">
              <div className="space-y-2">
                <Label>Search</Label>
                <Input
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder="Search by question, council, or run id"
                />
              </div>
              <div className="space-y-2">
                <Label>Status</Label>
                <Select
                  value={statusFilter}
                  onValueChange={(value) => setStatusFilter(parseStatusFilter(value))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="All statuses" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="pending">Queued</SelectItem>
                    <SelectItem value="processing">Running</SelectItem>
                    <SelectItem value="completed">Complete</SelectItem>
                    <SelectItem value="failed">Interrupted</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3 text-sm">
              <Button
                variant="outline"
                size="sm"
                onClick={selectAllVisible}
                disabled={orderedSessions.length === 0}
              >
                Select all
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={clearSelection}
                disabled={selectedIds.length === 0}
              >
                Clear
              </Button>
              <Button
                size="sm"
                onClick={() => {
                  setExportTargetIds(selectedIds);
                  setExportOpen(true);
                }}
                disabled={selectedIds.length === 0}
              >
                Export selected
              </Button>
            </div>

            <div className="space-y-3">
              {sessions && sessions.length === 0 && (
                <div className="inset">
                  <p className="text-muted-foreground">
                    Your journal is empty. Bring a question to the council.
                  </p>
                </div>
              )}

              {sessions && sessions.length > 0 && orderedSessions.length === 0 && (
                <div className="inset">
                  <p className="text-muted-foreground">No runs match these filters.</p>
                </div>
              )}

              {orderedSessions.map((session) => {
                const isSelected = selectedSessionId === session.id;
                const isActive = activeSessionId === session.id;
                const formattedCost = `$${formatUsdFromMicros(session.totalCostUsdMicros, 4)}`;
                const costLabel = session.totalCostIsPartial
                  ? session.totalCostUsdMicros === 0
                    ? "pending"
                    : `${formattedCost} (partial)`
                  : formattedCost;

                return (
                  <div
                    key={session.id}
                    className={cn(
                      "inset flex flex-wrap items-start justify-between gap-4",
                      isSelected ? "border-gold" : undefined
                    )}
                    role="button"
                    tabIndex={0}
                    onClick={() => setSelectedSessionId(session.id)}
                    onKeyDown={(event) => {
                      if (event.key !== "Enter" && event.key !== " ") return;
                      event.preventDefault();
                      setSelectedSessionId(session.id);
                    }}
                  >
                    <div className="flex items-start gap-3 flex-1 min-w-0">
                      <div
                        className="pt-1"
                        onClick={(event) => event.stopPropagation()}
                        onKeyDown={(event) => event.stopPropagation()}
                      >
                        <Checkbox
                          checked={selectedIds.includes(session.id)}
                          onCheckedChange={() => toggleSelected(session.id)}
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-foreground">
                          <Markdown markdown={session.query} className="text-sm" />
                        </div>
                        <div className="text-xs text-muted-foreground mt-2">
                          {session.councilNameAtRun} •{" "}
                          {formatDistanceToNow(new Date(session.createdAt), { addSuffix: true })} •
                          Cost: {costLabel}
                        </div>
                      </div>
                    </div>

                    <div className="action-rail shrink-0">
                      {isActive && <span className="badge badge-primary">Active</span>}
                      <StatusBadge status={session.status} />
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(event) => {
                          event.stopPropagation();
                          setSelectedSessionId(session.id);
                        }}
                      >
                        View
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {selectedSessionId !== null && (
          <RunSheet
            sessionId={selectedSessionId}
            data={selectedSessionQuery.data}
            isLoading={selectedSessionQuery.isLoading}
            context="journal"
            onRefetch={selectedSessionQuery.refetch}
          />
        )}
      </div>
    </AppShell>
  );
}
