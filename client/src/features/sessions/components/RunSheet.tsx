import { Suspense, lazy, useMemo, useState } from "react";
import { ArrowLeft, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";

import { useMutation } from "@tanstack/react-query";
import { continueSession } from "@/lib/api";
import type { SessionDetailPayload } from "@shared/domain/apiSchemas";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "@/lib/routing/router";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Markdown } from "@/components/Markdown";
import { CopyButton } from "@/components/CopyButton";
import { SessionResultsLadder } from "./SessionResultsLadder";
import { StatusBadge } from "./StatusBadge";
import { calculateSessionTotals } from "../domain/totals";
import { formatFailureKind } from "../domain/failureKind";
import { formatUsdFromMicros } from "@shared/domain/usage";

const ExportDialog = lazy(async () => {
  const module = await import("./ExportDialog");
  return { default: module.ExportDialog };
});
const RerunDialog = lazy(async () => {
  const module = await import("./RerunDialog");
  return { default: module.RerunDialog };
});
const SessionDiagnosticsPanel = lazy(async () => {
  const module = await import("./SessionDiagnosticsPanel");
  return { default: module.SessionDiagnosticsPanel };
});

/**
 * RunSheetContext describes where the Run Sheet is rendered.
 */
export type RunSheetContext = "active" | "journal" | "detail";

type RunSheetProps = Readonly<{
  sessionId: number;
  data: SessionDetailPayload | undefined;
  isLoading: boolean;
  context: RunSheetContext;
  onDismiss?: () => void;
  onRefetch?: () => void;
}>;

/**
 * RunSheet is the canonical run detail surface shared across Ask, Journal, and /session.
 */
export function RunSheet(props: RunSheetProps) {
  const navigate = useNavigate();
  const { authHeader } = useAuth();
  const [rerunOpen, setRerunOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);

  const sessionData = props.data;
  const totals = calculateSessionTotals(sessionData);
  const failureKindLabel =
    sessionData?.session.status === "failed" ? formatFailureKind(sessionData.session.failureKind) : null;

  const formattedCost = `$${formatUsdFromMicros(totals.totalCostUsdMicros, 4)}`;
  const costLabel = totals.totalCostIsPartial
    ? totals.totalCostUsdMicros === 0
      ? "pending"
      : `${formattedCost} (partial)`
    : formattedCost;

  const continueMutation = useMutation({
    mutationFn: async (params: { sessionId: number }) => {
      if (!authHeader) throw new Error("Missing authentication");
      return continueSession({ authHeader, sessionId: params.sessionId });
    },
    onSuccess: async () => {
      toast.success("Continuing run");
      props.onRefetch?.();
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to continue run");
    },
  });

  const canContinue = sessionData?.session.status === "failed";
  const canRerun =
    sessionData?.session.status === "failed" || sessionData?.session.status === "completed";

  const createdAtLabel = useMemo(() => {
    if (!sessionData) return null;
    return formatDistanceToNow(new Date(sessionData.session.createdAt), { addSuffix: true });
  }, [sessionData]);

  const actionRail = (
    <div className="action-rail">
      {props.context === "detail" && (
        <Button variant="ghost" size="sm" onClick={() => navigate("/journal")}>
          <ArrowLeft className="icon-sm" />
          Back to Journal
        </Button>
      )}
      {(props.context === "active" || props.context === "journal") && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate(`/session/${props.sessionId}`)}
        >
          Open detail
        </Button>
      )}
      {canContinue && (
        <Button
          size="sm"
          onClick={() => continueMutation.mutate({ sessionId: props.sessionId })}
          disabled={continueMutation.isPending}
        >
          {continueMutation.isPending && <Loader2 className="animate-spin icon-sm" />}
          Continue
        </Button>
      )}
      {canRerun && (
        <Button
          variant="outline"
          size="sm"
          onClick={() => setRerunOpen(true)}
          disabled={continueMutation.isPending}
        >
          Rerun
        </Button>
      )}
      <Button
        variant="outline"
        size="sm"
        onClick={() => setExportOpen(true)}
        disabled={continueMutation.isPending}
      >
        Export
      </Button>
      {props.context === "active" && props.onDismiss && (
        <Button variant="ghost" size="sm" onClick={props.onDismiss}>
          Dismiss
        </Button>
      )}
    </div>
  );

  if (props.isLoading && !sessionData) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Run {props.sessionId}</CardTitle>
          <CardDescription>Loading run details…</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (!sessionData) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Run {props.sessionId}</CardTitle>
          <CardDescription>Run details are unavailable.</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            This run could not be loaded.
          </p>
        </CardContent>
      </Card>
    );
  }

  const titleLabel = props.context === "active" ? "Active Run" : `Run ${props.sessionId}`;

  return (
    <Card>
      {exportOpen && (
        <Suspense fallback={null}>
          <ExportDialog
            open={exportOpen}
            onOpenChange={setExportOpen}
            selectedIds={[props.sessionId]}
          />
        </Suspense>
      )}
      {rerunOpen && (
        <Suspense fallback={null}>
          <RerunDialog
            open={rerunOpen}
            onOpenChange={setRerunOpen}
            sessionId={props.sessionId}
            initialQuery={sessionData.session.query}
            onRerunStarted={(newSessionId: number) => navigate(`/session/${newSessionId}`)}
          />
        </Suspense>
      )}

      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <CardTitle>{titleLabel}</CardTitle>
            <CardDescription>
              {sessionData.session.councilNameAtRun}
              {createdAtLabel ? ` • ${createdAtLabel}` : ""}
            </CardDescription>
          </div>
          {actionRail}
        </div>
      </CardHeader>

      <CardContent className="space-y-5">
        <div className="inset inset-card">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Question</div>
              <div className="mt-2">
                <Markdown markdown={sessionData.session.query} />
              </div>
              <div className="mt-3 flex flex-wrap gap-3 text-xs text-muted-foreground">
                <span>Run id: {props.sessionId}</span>
                <StatusBadge status={sessionData.session.status} />
                {props.context === "active" && <span className="badge badge-primary">Active</span>}
                {failureKindLabel ? <span>Failure: {failureKindLabel}</span> : null}
                <span>Cost: {costLabel}</span>
              </div>
            </div>
            <div className="action-rail">
              <CopyButton value={sessionData.session.query} tooltip="Copy question" />
              <CopyButton value={String(props.sessionId)} tooltip="Copy run id" />
            </div>
          </div>
        </div>

        <div className="inset">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="stat-card">
              <p className="text-muted-foreground text-sm">Usage (tokens)</p>
              <p className="text-violet text-2xl font-bold mt-1">
                {totals.totalTokens.toLocaleString()}
              </p>
            </div>
            <div className="stat-card">
              <p className="text-muted-foreground text-sm">Cost</p>
              <p className="text-gold text-2xl font-bold mt-1">{costLabel}</p>
            </div>
            <div className="stat-card">
              <p className="text-muted-foreground text-sm">Replies</p>
              <p className="text-evergreen text-2xl font-bold mt-1">
                {totals.responses}/6
              </p>
            </div>
            <div className="stat-card">
              <p className="text-muted-foreground text-sm">Critiques</p>
              <p className="text-violet text-2xl font-bold mt-1">
                {totals.reviews}/6
              </p>
            </div>
          </div>
        </div>

        <SessionResultsLadder
          isLoading={props.isLoading}
          data={sessionData}
          variant={props.context === "detail" ? "detailed" : "compact"}
        />

        <Suspense
          fallback={
            <div className="inset inset-card">
              <div className="text-sm text-muted-foreground">Loading diagnostics…</div>
            </div>
          }
        >
          <SessionDiagnosticsPanel sessionId={props.sessionId} />
        </Suspense>
      </CardContent>
    </Card>
  );
}
