"use client";

import { isMemberPosition, type MemberPosition } from "@the-seven/contracts";
import { useEffect, useId, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { toast } from "sonner";
import { Sigil } from "@/components/app/sigil";
import { CouncilTrack, type InspectorArtifact } from "@/components/inspector/council-track";
import { VerdictCard } from "@/components/inspector/verdict-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
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
  if (micros === null) return "n/a";
  return `$${(micros / 1_000_000).toFixed(6)}`;
}

function formatLatencySeconds(detail: {
  providerCalls: ReadonlyArray<{ latencyMs: number | null }>;
}) {
  const total = detail.providerCalls.reduce((sum, call) => sum + (call.latencyMs ?? 0), 0);
  if (!total) return null;
  return `${(total / 1000).toFixed(1)} s deliberation`;
}

export function SessionInspector(props: {
  authenticated: boolean;
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
  const [trailOpen, setTrailOpen] = useState(false);
  const [rerunQuery, setRerunQuery] = useState("");
  const [rerunCouncil, setRerunCouncil] = useState("");
  const [rerunOpen, setRerunOpen] = useState(false);
  const fieldPrefix = useId();
  const trailRef = useRef<HTMLDivElement | null>(null);
  const [availableCouncils, setAvailableCouncils] = useState<
    Awaited<ReturnType<typeof fetchCouncils>>["councils"]
  >([]);

  useEffect(() => {
    if (!props.authenticated || !props.sessionId) {
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
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [props.authHeader, props.authenticated, props.sessionId]);

  useEffect(() => {
    const authHeader = props.authHeader;
    if (!props.authenticated || !detail) return;
    if (detail.session.status !== "pending" && detail.session.status !== "processing") return;
    const interval = setInterval(() => {
      void fetchSession(authHeader, detail.session.id)
        .then(setDetail)
        .catch(() => undefined);
    }, 1500);
    return () => clearInterval(interval);
  }, [detail, props.authHeader, props.authenticated]);

  useEffect(() => {
    if (!props.authenticated) return;
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
  }, [props.authHeader, props.authenticated, rerunCouncil]);

  async function handleContinue() {
    if (!props.authenticated || !detail) return;
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
    if (!props.authenticated || !detail) return;
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
    if (!props.authenticated || !detail) return;
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
    if (!props.authenticated || !detail) return;
    try {
      const exported = await exportSessions(props.authHeader, [detail.session.id]);
      downloadText(`session-${detail.session.id}.md`, exported.markdown, "text/markdown");
      downloadText(`session-${detail.session.id}.json`, exported.json, "application/json");
      toast.success("Session exported");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Export failed");
    }
  }

  function openTrail() {
    setTrailOpen(true);
    requestAnimationFrame(() => {
      trailRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  if (!props.authenticated) {
    return (
      <Card className="p-8 text-center">
        <p className="text-sm text-[var(--text-muted)]">
          Unlock BYOK or start a demo session to inspect runs.
        </p>
      </Card>
    );
  }

  if (!props.sessionId) {
    return (
      <Card className="p-8 text-center">
        <p className="text-sm text-[var(--text-muted)]">
          Send a question above and the council will assemble here.
        </p>
      </Card>
    );
  }

  if (loading && !detail) {
    return (
      <Card className="p-8 text-center text-sm text-[var(--text-muted)]">Loading session…</Card>
    );
  }

  if (!detail) {
    return (
      <Card className="p-8 text-center text-sm text-[var(--text-muted)]">Session unavailable.</Card>
    );
  }

  const phase3Artifact = detail.artifacts.find((a) => a.phase === 3);
  const synthesizerLabel = detail.session.snapshot.council.members.find(
    (m) => m.memberPosition === 7,
  )?.model.modelId;
  const latencyLabel = formatLatencySeconds({ providerCalls: detail.providerCalls });

  const inspectorArtifacts: InspectorArtifact[] = detail.artifacts.map((a) => ({
    id: a.id,
    phase: a.phase,
    memberPosition: a.memberPosition,
    member: { label: a.member.label },
    modelId: a.modelId,
    modelName: a.modelName,
    content: a.content,
  }));

  return (
    <div className="space-y-6">
      <section className="ask-band">
        <p className="ask-meta">
          <span>Asked of the</span>{" "}
          <span className="ask-meta-council">{detail.session.councilNameAtRun}</span>
          {latencyLabel ? (
            <>
              <span className="ask-meta-dot">·</span>
              <span>{latencyLabel}</span>
            </>
          ) : null}
          <span className="ask-meta-dot">·</span>
          <span>{detail.session.ingressSource}</span>
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <SessionStatusBadge
            status={detail.session.status}
            failureKind={detail.session.failureKind}
          />
          <Badge>{detail.session.snapshot.attachments.length} attachment(s)</Badge>
          <Badge>{detail.session.totalTokens} tokens</Badge>
          <Badge>
            {detail.session.totalCostIsPartial && detail.session.totalCostUsdMicros === 0
              ? "cost pending"
              : formatCost(detail.session.totalCostUsdMicros)}
          </Badge>
        </div>
        <p className="ask-question mt-4">&ldquo;{detail.session.query}&rdquo;</p>
      </section>

      <CouncilTrack
        members={detail.session.snapshot.council.members}
        artifacts={inspectorArtifacts}
        onCellSelect={(position) => {
          const target = window.document.getElementById(`cand-${position}`);
          target?.scrollIntoView({ behavior: "smooth", block: "center" });
        }}
      />

      {phase3Artifact ? (
        <>
          <VerdictCard content={phase3Artifact.content} onOpenTrail={openTrail} />
          <p className="composer">
            <span>composed by</span> <span className="composer-strong">Synthesizer&nbsp;G</span>
            {synthesizerLabel ? (
              <>
                <span className="composer-dot">·</span>
                <span className="composer-strong">{synthesizerLabel}</span>
              </>
            ) : null}
            {latencyLabel ? (
              <>
                <span className="composer-dot">·</span>
                <span>{latencyLabel}</span>
              </>
            ) : null}
          </p>
        </>
      ) : detail.session.status === "failed" ? (
        <Card className="p-6">
          <p className="text-sm text-[var(--text-muted)]">
            The council did not converge. Review the trail below and either continue or rerun.
          </p>
        </Card>
      ) : (
        <Card className="p-6">
          <p className="text-sm text-[var(--text-muted)]">
            The synthesizer is still composing the verdict.
          </p>
        </Card>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {detail.session.status === "failed" ? (
          <Button variant="secondary" size="sm" onClick={handleContinue}>
            Continue
          </Button>
        ) : null}
        {detail.session.status === "failed" || detail.session.status === "completed" ? (
          <Button variant="secondary" size="sm" onClick={() => setRerunOpen((v) => !v)}>
            {rerunOpen ? "Hide Rerun" : "Rerun"}
          </Button>
        ) : null}
        <Button variant="ghost" size="sm" onClick={handleExport}>
          Export
        </Button>
        <Button variant="ghost" size="sm" onClick={handleLoadDiagnostics}>
          {loadingDiagnostics ? "Loading…" : diagnostics ? "Refresh Diagnostics" : "Diagnostics"}
        </Button>
        <Button variant="ghost" size="sm" onClick={openTrail}>
          {trailOpen ? "Trail open" : "Open Trail"}
        </Button>
      </div>

      {rerunOpen ? (
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
              <Select
                id={`${fieldPrefix}-rerun-council`}
                value={rerunCouncil}
                onChange={(event) => setRerunCouncil(event.target.value)}
              >
                {availableCouncils.map((council) => {
                  const value =
                    council.ref.kind === "built_in"
                      ? `built_in:${council.ref.slug}`
                      : `user:${council.ref.councilId}`;
                  return (
                    <option key={value} value={value}>
                      {council.name}
                    </option>
                  );
                })}
              </Select>
            </div>
            <div className="md:col-span-2">
              <Button onClick={handleRerun}>Run again</Button>
            </div>
          </div>
        </Card>
      ) : null}

      {trailOpen ? (
        <div ref={trailRef} className="space-y-4">
          {[1, 2].map((phase) => {
            const artifacts = detail.artifacts.filter((a) => a.phase === phase);
            if (artifacts.length === 0) return null;
            return (
              <section key={phase} className="space-y-3">
                <h3 className="surface-title text-xl uppercase tracking-[0.18em]">
                  {phase === 1 ? "Phase 1 · Drafts" : "Phase 2 · Critiques"}
                </h3>
                <div className="grid gap-3">
                  {artifacts.map((artifact) => {
                    const position = artifact.memberPosition;
                    return (
                      <div key={artifact.id} className="panel space-y-3">
                        <div className="flex flex-wrap items-center gap-2">
                          {isMemberPosition(position) ? (
                            <Sigil
                              position={position as MemberPosition}
                              className="h-5 w-5 text-[var(--gold-soft)]"
                            />
                          ) : null}
                          <Badge>{artifact.member.label}</Badge>
                          <Badge>{artifact.modelName}</Badge>
                          <Badge>{formatCost(artifact.costUsdMicros)}</Badge>
                        </div>
                        <div
                          className={cn(
                            "prose prose-sm max-w-none",
                            "prose-headings:mt-0 prose-p:text-[var(--foreground)]",
                            phase === 2 && "font-mono text-xs leading-5",
                          )}
                        >
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>
                            {artifact.content}
                          </ReactMarkdown>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      ) : null}

      {diagnostics ? (
        <Card className="p-6">
          <h3 className="surface-title mb-4 text-xl uppercase tracking-[0.18em]">Diagnostics</h3>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[920px] text-left text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] text-[var(--text-muted)]">
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
