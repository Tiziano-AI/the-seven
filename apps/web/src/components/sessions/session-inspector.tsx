"use client";

import { useEffect, useId, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  continueSession,
  exportSessions,
  fetchCouncils,
  fetchSession,
  fetchSessionDiagnostics,
  rerunSession,
} from "@/lib/api";
import { cn } from "@/lib/utils";
import { SessionStatusBadge } from "./status-badge";

function downloadText(filename: string, text: string, type: string) {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function formatCost(micros: number | null) {
  if (micros === null) {
    return "n/a";
  }
  return `$${(micros / 1_000_000).toFixed(6)}`;
}

export function SessionInspector(props: {
  authHeader: string | null;
  sessionId: number | null;
  onSpawnedSession?: (sessionId: number) => void;
}) {
  const [detail, setDetail] = useState<Awaited<ReturnType<typeof fetchSession>> | null>(null);
  const [diagnostics, setDiagnostics] = useState<Awaited<
    ReturnType<typeof fetchSessionDiagnostics>
  > | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingDiagnostics, setLoadingDiagnostics] = useState(false);
  const [rerunQuery, setRerunQuery] = useState("");
  const [rerunCouncil, setRerunCouncil] = useState("");
  const fieldPrefix = useId();
  const [availableCouncils, setAvailableCouncils] = useState<
    Awaited<ReturnType<typeof fetchCouncils>>["councils"]
  >([]);

  useEffect(() => {
    if (!props.authHeader || !props.sessionId) {
      setDetail(null);
      setDiagnostics(null);
      return;
    }

    const authHeader = props.authHeader;
    const sessionId = props.sessionId;
    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        const nextDetail = await fetchSession(authHeader, sessionId);
        if (!cancelled) {
          setDetail(nextDetail);
          setRerunQuery(nextDetail.session.snapshot.query);
        }
      } catch (error) {
        if (!cancelled) {
          toast.error(error instanceof Error ? error.message : "Failed to load session");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [props.authHeader, props.sessionId]);

  useEffect(() => {
    const authHeader = props.authHeader;
    if (!authHeader || !detail) {
      return;
    }
    if (detail.session.status !== "pending" && detail.session.status !== "processing") {
      return;
    }

    const interval = setInterval(() => {
      void fetchSession(authHeader, detail.session.id)
        .then(setDetail)
        .catch(() => undefined);
    }, 1500);
    return () => clearInterval(interval);
  }, [detail, props.authHeader]);

  const phaseGroups = useMemo(() => {
    if (!detail) {
      return [];
    }

    return [
      { phase: 1, title: "Replies" },
      { phase: 2, title: "Critiques" },
      { phase: 3, title: "Verdict" },
    ].map((group) => ({
      ...group,
      artifacts: detail.artifacts.filter((artifact) => artifact.phase === group.phase),
    }));
  }, [detail]);

  async function handleContinue() {
    if (!props.authHeader || !detail) {
      return;
    }

    try {
      await continueSession(props.authHeader, detail.session.id);
      toast.success("Run continued");
      setDiagnostics(null);
      setDetail(await fetchSession(props.authHeader, detail.session.id));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Continue failed");
    }
  }

  async function handleRerun() {
    if (!props.authHeader || !detail) {
      return;
    }

    try {
      const councils = availableCouncils.length
        ? availableCouncils
        : (await fetchCouncils(props.authHeader)).councils;
      setAvailableCouncils(councils);

      const chosen =
        councils.find(
          (council) =>
            council.ref.kind === "user" && `user:${council.ref.councilId}` === rerunCouncil,
        ) ??
        councils.find(
          (council) =>
            council.ref.kind === "built_in" && `built_in:${council.ref.slug}` === rerunCouncil,
        );
      if (!chosen) {
        toast.error("Choose a council for rerun");
        return;
      }

      const result = await rerunSession({
        authHeader: props.authHeader,
        sessionId: detail.session.id,
        councilRef: chosen.ref,
        queryOverride:
          rerunQuery.trim() === detail.session.snapshot.query.trim() ? undefined : rerunQuery,
      });
      toast.success("New run created");
      props.onSpawnedSession?.(result.sessionId);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Rerun failed");
    }
  }

  async function handleLoadDiagnostics() {
    if (!props.authHeader || !detail) {
      return;
    }
    setLoadingDiagnostics(true);
    try {
      setDiagnostics(await fetchSessionDiagnostics(props.authHeader, detail.session.id));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Diagnostics failed");
    } finally {
      setLoadingDiagnostics(false);
    }
  }

  async function handleExport() {
    if (!props.authHeader || !detail) {
      return;
    }

    try {
      const exported = await exportSessions(props.authHeader, [detail.session.id]);
      downloadText(`session-${detail.session.id}.md`, exported.markdown, "text/markdown");
      downloadText(`session-${detail.session.id}.json`, exported.json, "application/json");
      toast.success("Session exported");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Export failed");
    }
  }

  useEffect(() => {
    if (!props.authHeader) {
      return;
    }
    void fetchCouncils(props.authHeader)
      .then((result) => {
        setAvailableCouncils(result.councils);
        const first = result.councils[0];
        if (!rerunCouncil && first) {
          setRerunCouncil(
            first.ref.kind === "built_in"
              ? `built_in:${first.ref.slug}`
              : `user:${first.ref.councilId}`,
          );
        }
      })
      .catch(() => undefined);
  }, [props.authHeader, rerunCouncil]);

  if (!props.authHeader) {
    return (
      <Card className="p-6">
        <p className="text-sm text-[var(--muted-foreground)]">
          Unlock BYOK or start a demo session to inspect runs.
        </p>
      </Card>
    );
  }

  if (!props.sessionId) {
    return (
      <Card className="p-6">
        <p className="text-sm text-[var(--muted-foreground)]">Pick a session to inspect.</p>
      </Card>
    );
  }

  if (loading && !detail) {
    return <Card className="p-6 text-sm text-[var(--muted-foreground)]">Loading session…</Card>;
  }

  if (!detail) {
    return <Card className="p-6 text-sm text-[var(--muted-foreground)]">Session unavailable.</Card>;
  }

  return (
    <div className="space-y-5">
      <Card className="p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              <SessionStatusBadge
                status={detail.session.status}
                failureKind={detail.session.failureKind}
              />
              <Badge>{detail.session.councilNameAtRun}</Badge>
              <Badge>{detail.session.snapshot.attachments.length} attachment(s)</Badge>
            </div>
            <h2 className="text-2xl font-semibold tracking-[-0.04em]">{detail.session.query}</h2>
            <div className="grid gap-2 text-sm text-[var(--muted-foreground)] md:grid-cols-2">
              <div>Created: {new Date(detail.session.createdAt).toLocaleString()}</div>
              <div>Ingress: {detail.session.ingressSource}</div>
              <div>Tokens: {detail.session.totalTokens}</div>
              <div>
                Cost: {formatCost(detail.session.totalCostUsdMicros)}
                {detail.session.totalCostIsPartial ? " (partial)" : ""}
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {detail.session.status === "failed" ? (
              <Button variant="secondary" onClick={handleContinue}>
                Continue
              </Button>
            ) : null}
            {detail.session.status === "failed" || detail.session.status === "completed" ? (
              <Button variant="secondary" onClick={handleRerun}>
                Rerun
              </Button>
            ) : null}
            <Button variant="secondary" onClick={handleExport}>
              Export
            </Button>
            <Button variant="ghost" onClick={handleLoadDiagnostics}>
              {loadingDiagnostics
                ? "Loading…"
                : diagnostics
                  ? "Refresh Diagnostics"
                  : "Diagnostics"}
            </Button>
          </div>
        </div>
      </Card>

      <Card className="p-6">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor={`${fieldPrefix}-rerun-query`}>Rerun Question</Label>
            <Textarea
              id={`${fieldPrefix}-rerun-query`}
              value={rerunQuery}
              onChange={(event) => setRerunQuery(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`${fieldPrefix}-rerun-council`}>Rerun Council</Label>
            <Input
              id={`${fieldPrefix}-rerun-council`}
              list="rerun-council-options"
              value={rerunCouncil}
              onChange={(event) => setRerunCouncil(event.target.value)}
            />
            <datalist id="rerun-council-options">
              {availableCouncils.map((council) => (
                <option
                  key={council.name}
                  value={
                    council.ref.kind === "built_in"
                      ? `built_in:${council.ref.slug}`
                      : `user:${council.ref.councilId}`
                  }
                >
                  {council.name}
                </option>
              ))}
            </datalist>
            <p className="text-sm text-[var(--muted-foreground)]">
              Use `built_in:*` or `user:*` values. The datalist is populated from your available
              councils.
            </p>
          </div>
        </div>
      </Card>

      {phaseGroups.map((group) => (
        <Card key={group.phase} className={cn("p-6", group.phase === 3 && "border-[var(--gold)]")}>
          <div className="mb-4 flex items-center justify-between">
            <h3
              className={cn(
                "font-semibold tracking-[-0.03em]",
                group.phase === 3 ? "text-2xl" : "text-xl",
              )}
            >
              Phase {group.phase} · {group.title}
            </h3>
            <Badge>{group.artifacts.length} artifact(s)</Badge>
          </div>
          <div className="space-y-4">
            {group.artifacts.map((artifact) => (
              <div
                key={artifact.id}
                className="rounded-[24px] border border-[var(--border)] bg-[var(--surface)] p-5"
              >
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <Badge>{artifact.member.label}</Badge>
                  <Badge>{artifact.modelName}</Badge>
                  <Badge>{formatCost(artifact.costUsdMicros)}</Badge>
                </div>
                <div className="prose prose-sm max-w-none prose-headings:mt-0 prose-p:text-[var(--foreground)]">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{artifact.content}</ReactMarkdown>
                </div>
              </div>
            ))}
            {group.artifacts.length === 0 ? (
              <p className="text-sm text-[var(--muted-foreground)]">No artifacts yet.</p>
            ) : null}
          </div>
        </Card>
      ))}

      {diagnostics ? (
        <Card className="p-6">
          <h3 className="mb-4 text-xl font-semibold tracking-[-0.03em]">Diagnostics</h3>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[920px] text-left text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] text-[var(--muted-foreground)]">
                  <th className="pb-2">Phase</th>
                  <th className="pb-2">Member</th>
                  <th className="pb-2">Request Model</th>
                  <th className="pb-2">Billed Model</th>
                  <th className="pb-2">Tokens</th>
                  <th className="pb-2">Latency</th>
                  <th className="pb-2">Cost</th>
                  <th className="pb-2">Finish</th>
                  <th className="pb-2">Error</th>
                </tr>
              </thead>
              <tbody>
                {diagnostics.providerCalls.map((call) => (
                  <tr key={call.id} className="border-b border-[var(--border)]/60 align-top">
                    <td className="py-3">{call.phase}</td>
                    <td className="py-3">{call.memberPosition}</td>
                    <td className="py-3">{call.requestModelName}</td>
                    <td className="py-3">{call.billedModelId ?? "n/a"}</td>
                    <td className="py-3">{call.usageTotalTokens ?? "n/a"}</td>
                    <td className="py-3">{call.latencyMs ?? "n/a"}</td>
                    <td className="py-3">{formatCost(call.totalCostUsdMicros)}</td>
                    <td className="py-3">
                      {call.finishReason ?? call.nativeFinishReason ?? "n/a"}
                    </td>
                    <td className="py-3">
                      {call.errorMessage ?? call.choiceErrorMessage ?? "n/a"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}
    </div>
  );
}
