"use client";

import type { MemberPosition } from "@the-seven/contracts";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { toast } from "sonner";
import {
  continueSession,
  exportSessions,
  fetchCouncils,
  fetchSession,
  fetchSessionDiagnostics,
  rerunSession,
} from "@/lib/api";
import type { SessionAction } from "./session-inspector-chrome";
import { downloadText, manuscriptLoadIssue } from "./session-inspector-formatters";
import { SessionInspectorLoaded } from "./session-inspector-loaded";
import { scrollEvidenceTarget, scrollMemberEvidence } from "./session-inspector-scroll";
import { SessionInspectorStateMessage } from "./session-inspector-states";

type SessionDiagnostics = Awaited<ReturnType<typeof fetchSessionDiagnostics>>;
type SessionDiagnosticsRecord = Readonly<{
  sessionId: number;
  diagnostics: SessionDiagnostics;
}>;

export function SessionInspector(props: {
  authenticated: boolean;
  authHeader: string | null;
  sessionId: number | null;
  emptyState?: "workbench" | "archive";
  initialAction?: "recovery" | "rerun" | null;
  onAuthorityDenial?: (error: unknown) => boolean;
  onSpawnedSession?: (sessionId: number) => void;
}) {
  const [detail, setDetail] = useState<Awaited<ReturnType<typeof fetchSession>> | null>(null);
  const [diagnosticsRecord, setDiagnosticsRecord] = useState<SessionDiagnosticsRecord | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingDiagnostics, setLoadingDiagnostics] = useState(false);
  const [proceedingsOpen, setProceedingsOpen] = useState(false);
  const [rerunQuery, setRerunQuery] = useState("");
  const [rerunCouncil, setRerunCouncil] = useState("");
  const [rerunOpen, setRerunOpen] = useState(false);
  const [refreshIssue, setRefreshIssue] = useState<string | null>(null);
  const [initialLoadIssue, setInitialLoadIssue] = useState<string | null>(null);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<number | null>(null);
  const [pendingAction, setPendingAction] = useState<SessionAction>(null);
  const [rerunActionMessage, setRerunActionMessage] = useState<string | null>(null);
  const [councilLoadIssue, setCouncilLoadIssue] = useState<string | null>(null);
  const [councilLoadPending, setCouncilLoadPending] = useState(false);
  const fieldPrefix = useId();
  const proceedingsRef = useRef<HTMLDivElement | null>(null);
  const recoveryRef = useRef<HTMLDivElement | null>(null);
  const rerunRef = useRef<HTMLDivElement | null>(null);
  const [availableCouncils, setAvailableCouncils] = useState<
    Awaited<ReturnType<typeof fetchCouncils>>["councils"]
  >([]);

  const loadAvailableCouncils = useCallback(async () => {
    if (!props.authenticated) {
      setAvailableCouncils([]);
      setCouncilLoadIssue(null);
      return [];
    }
    setCouncilLoadPending(true);
    try {
      const result = await fetchCouncils(props.authHeader);
      setAvailableCouncils(result.councils);
      setCouncilLoadIssue(null);
      return result.councils;
    } catch (error) {
      if (props.onAuthorityDenial?.(error)) {
        setDetail(null);
        setDiagnosticsRecord(null);
        return [];
      }
      const message = error instanceof Error ? error.message : "Council Library could not load.";
      setCouncilLoadIssue(message);
      return [];
    } finally {
      setCouncilLoadPending(false);
    }
  }, [props.authHeader, props.authenticated, props.onAuthorityDenial]);

  const loadSelectedSession = useCallback(
    async (sessionId: number, isCancelled: () => boolean = () => false) => {
      setDetail(null);
      setDiagnosticsRecord(null);
      setRerunActionMessage(null);
      setRefreshIssue(null);
      setInitialLoadIssue(null);
      setPendingAction(null);
      setLoading(true);
      try {
        const nextDetail = await fetchSession(props.authHeader, sessionId);
        if (!isCancelled()) {
          setDetail(nextDetail);
          setRerunQuery(nextDetail.session.snapshot.query);
          setRerunCouncil("");
          setRerunActionMessage(null);
          setLastRefreshedAt(Date.now());
          setRefreshIssue(null);
          setInitialLoadIssue(null);
        }
      } catch (error) {
        if (!isCancelled()) {
          setDetail(null);
          setDiagnosticsRecord(null);
          if (props.onAuthorityDenial?.(error)) {
            return;
          }
          setInitialLoadIssue(manuscriptLoadIssue(error));
        }
      } finally {
        if (!isCancelled()) setLoading(false);
      }
    },
    [props.authHeader, props.onAuthorityDenial],
  );

  useEffect(() => {
    if (!props.authenticated || !props.sessionId) {
      setDetail(null);
      setDiagnosticsRecord(null);
      setInitialLoadIssue(null);
      return;
    }
    const sessionId = props.sessionId;
    let cancelled = false;
    void loadSelectedSession(sessionId, () => cancelled);
    return () => {
      cancelled = true;
    };
  }, [loadSelectedSession, props.authenticated, props.sessionId]);

  const pollingSessionId = detail?.session.id ?? null;
  const pollingStatus = detail?.session.status ?? null;

  useEffect(() => {
    const authHeader = props.authHeader;
    if (!props.authenticated || !pollingSessionId) return;
    if (pollingStatus !== "pending" && pollingStatus !== "processing") return;
    const interval = setInterval(() => {
      if (document.hidden) {
        return;
      }
      void fetchSession(authHeader, pollingSessionId)
        .then((nextDetail) => {
          setDetail(nextDetail);
          setLastRefreshedAt(Date.now());
          setRefreshIssue(null);
        })
        .catch((error) => {
          if (props.onAuthorityDenial?.(error)) {
            setDetail(null);
            setDiagnosticsRecord(null);
            return;
          }
          setRefreshIssue(
            "Latest status could not be refreshed. The displayed proceedings may be stale.",
          );
        });
    }, 1500);
    return () => clearInterval(interval);
  }, [
    pollingSessionId,
    pollingStatus,
    props.authHeader,
    props.authenticated,
    props.onAuthorityDenial,
  ]);

  useEffect(() => {
    if (!detail || !props.initialAction) return;
    if (props.initialAction === "rerun") {
      setRerunOpen(true);
    }
    requestAnimationFrame(() => {
      const target = props.initialAction === "rerun" ? rerunRef.current : recoveryRef.current;
      target?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }, [detail, props.initialAction]);

  useEffect(() => {
    if (!props.authenticated) return;
    void loadAvailableCouncils();
  }, [loadAvailableCouncils, props.authenticated]);

  async function handleContinue() {
    if (!props.authenticated || !detail || pendingAction) return;
    setPendingAction("continue");
    try {
      await continueSession(props.authHeader, detail.session.id);
      toast.success("Run continued");
      setDiagnosticsRecord(null);
      setDetail(await fetchSession(props.authHeader, detail.session.id));
    } catch (error) {
      if (props.onAuthorityDenial?.(error)) {
        setDetail(null);
        setDiagnosticsRecord(null);
        return;
      }
      toast.error(error instanceof Error ? error.message : "Continue failed");
    } finally {
      setPendingAction(null);
    }
  }

  async function handleRerun() {
    if (!props.authenticated || !detail || pendingAction) return;
    setPendingAction("rerun");
    setRerunActionMessage("Creating a new archived run with the selected council.");
    try {
      const councils = availableCouncils.length ? availableCouncils : await loadAvailableCouncils();
      setAvailableCouncils(councils);
      if (councils.length === 0) {
        setRerunActionMessage(
          councilLoadIssue ?? "Council Library could not load. Retry before starting the rerun.",
        );
        return;
      }
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
        setRerunActionMessage("Choose a council before starting the rerun.");
        return;
      }
      const originalQuery = detail.session.snapshot.query.trim();
      const trimmedRerunQuery = rerunQuery.trim();
      const queryOverride =
        trimmedRerunQuery.length === 0 || trimmedRerunQuery === originalQuery
          ? undefined
          : trimmedRerunQuery;
      if (trimmedRerunQuery.length === 0) {
        setRerunQuery(detail.session.snapshot.query);
        setRerunActionMessage("Blank rerun matter reuses the original docket matter.");
      }
      const result = await rerunSession({
        authHeader: props.authHeader,
        sessionId: detail.session.id,
        councilRef: chosen.ref,
        queryOverride,
      });
      toast.success("New run created");
      setRerunActionMessage("New run created. Opening the new manuscript.");
      props.onSpawnedSession?.(result.sessionId);
    } catch (error) {
      if (props.onAuthorityDenial?.(error)) {
        setDetail(null);
        setDiagnosticsRecord(null);
        return;
      }
      setRerunActionMessage(error instanceof Error ? error.message : "Rerun failed");
    } finally {
      setPendingAction(null);
    }
  }

  async function handleLoadDiagnostics() {
    if (!props.authenticated || !detail) return;
    const sessionId = detail.session.id;
    setLoadingDiagnostics(true);
    try {
      const diagnostics = await fetchSessionDiagnostics(props.authHeader, sessionId);
      setDiagnosticsRecord({
        sessionId,
        diagnostics,
      });
    } catch (error) {
      if (props.onAuthorityDenial?.(error)) {
        setDetail(null);
        setDiagnosticsRecord(null);
        return;
      }
      toast.error(error instanceof Error ? error.message : "Diagnostics failed");
    } finally {
      setLoadingDiagnostics(false);
    }
  }

  useEffect(() => {
    if (!diagnosticsRecord || diagnosticsRecord.sessionId !== detail?.session.id) {
      return;
    }
    requestAnimationFrame(() => {
      const panel = window.document.getElementById("provider-record-panel");
      panel?.scrollIntoView({ behavior: "auto", block: "start", inline: "nearest" });
      panel?.focus({ preventScroll: true });
    });
  }, [detail?.session.id, diagnosticsRecord]);

  async function handleExport() {
    if (!props.authenticated || !detail) return;
    try {
      const exported = await exportSessions(props.authHeader, [detail.session.id]);
      downloadText(`manuscript-${detail.session.id}.md`, exported.markdown, "text/markdown");
      downloadText(`manuscript-${detail.session.id}.json`, exported.json, "application/json");
      toast.success("Manuscript exported");
    } catch (error) {
      if (props.onAuthorityDenial?.(error)) {
        setDetail(null);
        setDiagnosticsRecord(null);
        return;
      }
      toast.error(error instanceof Error ? error.message : "Export failed");
    }
  }

  function openProceedings() {
    setProceedingsOpen(true);
    requestAnimationFrame(() => {
      proceedingsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  function openEvidenceTarget(targetId: string, fallbackId?: string) {
    scrollEvidenceTarget({ targetId, fallbackId, openProceedings: () => setProceedingsOpen(true) });
  }

  async function refreshActiveSession() {
    if (!props.authenticated || !detail) return;
    try {
      const nextDetail = await fetchSession(props.authHeader, detail.session.id);
      setDetail(nextDetail);
      setLastRefreshedAt(Date.now());
      setRefreshIssue(null);
    } catch (error) {
      if (props.onAuthorityDenial?.(error)) {
        setDetail(null);
        setDiagnosticsRecord(null);
        return;
      }
      const message =
        error instanceof Error ? error.message : "Latest status could not be refreshed";
      setRefreshIssue(message);
    }
  }

  function scrollToMemberEvidence(position: MemberPosition) {
    scrollMemberEvidence({ position, openProceedings: () => setProceedingsOpen(true) });
  }

  function renderStateMessage(input: {
    authenticated?: boolean;
    hasSessionId?: boolean;
    loading?: boolean;
    initialLoadIssue?: string | null;
  }) {
    return (
      <SessionInspectorStateMessage
        authenticated={input.authenticated ?? true}
        hasSessionId={input.hasSessionId ?? true}
        loading={input.loading ?? loading}
        emptyState={props.emptyState}
        initialLoadIssue={input.initialLoadIssue ?? null}
        onRetryInitialLoad={() => {
          const retrySessionId = props.sessionId;
          if (retrySessionId) void loadSelectedSession(retrySessionId);
        }}
      />
    );
  }

  if (!props.authenticated) {
    return renderStateMessage({ authenticated: false, hasSessionId: false });
  }
  if (!props.sessionId) {
    return renderStateMessage({ hasSessionId: false });
  }
  if (loading && !detail) {
    return renderStateMessage({ loading: true });
  }
  if (!detail && initialLoadIssue) {
    return renderStateMessage({ initialLoadIssue });
  }
  if (!detail) {
    return renderStateMessage({});
  }
  if (detail.session.id !== props.sessionId) {
    return renderStateMessage({});
  }

  const diagnostics =
    diagnosticsRecord?.sessionId === detail.session.id ? diagnosticsRecord.diagnostics : null;
  return (
    <SessionInspectorLoaded
      detail={detail}
      diagnostics={diagnostics}
      lastRefreshedAt={lastRefreshedAt}
      pendingAction={pendingAction}
      loadingDiagnostics={loadingDiagnostics}
      proceedingsOpen={proceedingsOpen}
      rerunOpen={rerunOpen}
      rerunQuery={rerunQuery}
      rerunCouncil={rerunCouncil}
      fieldPrefix={fieldPrefix}
      availableCouncils={availableCouncils}
      councilLoadIssue={councilLoadIssue}
      councilLoadPending={councilLoadPending}
      rerunActionMessage={rerunActionMessage}
      refreshIssue={refreshIssue}
      recoveryRef={recoveryRef}
      rerunRef={rerunRef}
      proceedingsRef={proceedingsRef}
      onRefreshActiveSession={refreshActiveSession}
      onScrollToMemberEvidence={scrollToMemberEvidence}
      onOpenEvidenceTarget={openEvidenceTarget}
      onOpenProceedings={openProceedings}
      onContinue={handleContinue}
      onToggleRerun={() => setRerunOpen((value) => !value)}
      onExport={handleExport}
      onLoadDiagnostics={handleLoadDiagnostics}
      onRerunQueryChange={setRerunQuery}
      onRerunCouncilChange={setRerunCouncil}
      onRetryCouncils={() => {
        void loadAvailableCouncils();
      }}
      onRerun={handleRerun}
    />
  );
}
