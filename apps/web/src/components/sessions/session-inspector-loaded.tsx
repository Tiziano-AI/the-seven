"use client";

import type { MemberPosition } from "@the-seven/contracts";
import type { RefObject } from "react";
import { CouncilTrack } from "@/components/inspector/council-track";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { fetchCouncils, fetchSession, fetchSessionDiagnostics } from "@/lib/api";
import { readableModelLabel } from "@/lib/model-labels";
import { SessionDiagnosticsTable } from "./session-diagnostics-table";
import { SessionDocket } from "./session-docket";
import { type SessionExportAction, SessionExportPanel } from "./session-export-panel";
import { buildInspectorArtifacts } from "./session-inspector-artifacts";
import {
  AnswerRepeatActions,
  type InspectorMode,
  type SessionAction,
  SessionModeRail,
  SessionProgressRibbon,
  SessionRefreshIssuePanel,
} from "./session-inspector-chrome";
import {
  formatCost,
  formatCostEvidence,
  formatExhibitLabel,
  formatLatencySeconds,
  formatTokenEvidence,
} from "./session-inspector-formatters";
import { SessionInspectorVerdictSection } from "./session-inspector-verdict-section";
import { SessionProceedings } from "./session-proceedings";
import { SessionRerunPanel } from "./session-rerun-panel";

type SessionDetail = Awaited<ReturnType<typeof fetchSession>>;
type SessionDiagnostics = Awaited<ReturnType<typeof fetchSessionDiagnostics>>;
type AvailableCouncils = Awaited<ReturnType<typeof fetchCouncils>>["councils"];

/** Renders the loaded run surface after session data has passed admission. */
export function SessionInspectorLoaded(props: {
  detail: SessionDetail;
  diagnostics: SessionDiagnostics | null;
  lastRefreshedAt: number | null;
  pendingAction: SessionAction;
  exportAction: SessionExportAction;
  loadingDiagnostics: boolean;
  activeMode: InspectorMode;
  rerunQuery: string;
  rerunCouncil: string;
  fieldPrefix: string;
  availableCouncils: AvailableCouncils;
  councilLoadIssue: string | null;
  councilLoadPending: boolean;
  rerunActionMessage: string | null;
  refreshIssue: string | null;
  recoveryRef: RefObject<HTMLDivElement | null>;
  rerunRef: RefObject<HTMLDivElement | null>;
  proceedingsRef: RefObject<HTMLElement | null>;
  onRefreshActiveSession: () => void;
  onScrollToMemberEvidence: (position: MemberPosition) => void;
  onOpenEvidenceTarget: (targetId: string, fallbackId?: string) => void;
  onOpenProceedings: () => void;
  onContinue: () => void;
  onSelectMode: (mode: InspectorMode) => void;
  onAskAnother: () => void;
  onCopyAnswer: () => void;
  onCopyAnswerWithNotes: () => void;
  onCopyLink: () => void;
  onDownloadAnswer: () => void;
  onDownloadFullRecord: () => void;
  onLoadDiagnostics: () => void;
  onRerunQueryChange: (value: string) => void;
  onRerunCouncilChange: (value: string) => void;
  onRetryCouncils: () => void;
  onRerun: () => void;
}) {
  const detail = props.detail;
  const phase3Artifact = detail.artifacts.find((artifact) => artifact.phase === 3);
  const synthesizerModelId = detail.session.snapshot.council.members.find(
    (member) => member.memberPosition === 7,
  )?.model.modelId;
  const synthesizerLabel = synthesizerModelId ? readableModelLabel(synthesizerModelId) : null;
  const latencyLabel = formatLatencySeconds({ providerCalls: detail.providerCalls });
  const exhibitLabel = formatExhibitLabel(detail.session.snapshot.attachments);
  const reviewerArtifactCount = detail.artifacts.filter((artifact) => artifact.phase === 2).length;
  const reviewerSeatCount = detail.session.snapshot.council.members.filter(
    (member) => member.memberPosition >= 1 && member.memberPosition <= 6,
  ).length;
  const inspectorArtifacts = buildInspectorArtifacts(detail.artifacts);
  const hasAnswer = Boolean(phase3Artifact?.content?.trim());
  const runAgainVisible = props.activeMode === "rerun";

  return (
    <div className="space-y-6">
      <SessionDocket
        councilName={detail.session.councilNameAtRun}
        latencyLabel={latencyLabel}
        ingressSource={detail.session.ingressSource}
        lastRefreshedAt={props.lastRefreshedAt}
        status={detail.session.status}
        failureKind={detail.session.failureKind}
        exhibitLabel={exhibitLabel}
        tokenEvidenceLabel={formatTokenEvidence(detail.session.status, detail.session.totalTokens)}
        costEvidenceLabel={formatCostEvidence({
          status: detail.session.status,
          totalCostIsPartial: detail.session.totalCostIsPartial,
          totalCostUsdMicros: detail.session.totalCostUsdMicros,
        })}
        query={detail.session.query}
      />

      {detail.session.status === "pending" || detail.session.status === "processing" ? (
        <SessionProgressRibbon
          status={detail.session.status}
          reviewerArtifactCount={reviewerArtifactCount}
          reviewerSeatCount={reviewerSeatCount}
        />
      ) : null}

      {props.refreshIssue ? (
        <SessionRefreshIssuePanel
          issue={props.refreshIssue}
          onRefresh={props.onRefreshActiveSession}
        />
      ) : null}

      <SessionModeRail
        status={detail.session.status}
        pendingAction={props.pendingAction}
        loadingDiagnostics={props.loadingDiagnostics}
        hasDiagnostics={Boolean(props.diagnostics)}
        activeMode={props.activeMode}
        onSelectMode={props.onSelectMode}
      />

      {props.activeMode === "answer" ? (
        <section id="answer-panel" className="inspector-panel-stack" aria-label="Answer">
          <SessionInspectorVerdictSection
            status={detail.session.status}
            phase3Content={phase3Artifact?.content ?? null}
            synthesizerModelId={synthesizerModelId}
            synthesizerLabel={synthesizerLabel}
            latencyLabel={latencyLabel}
            artifactCount={detail.artifacts.length}
            reviewCount={reviewerArtifactCount}
            failureKind={detail.session.failureKind}
            terminalError={detail.terminalError ?? null}
            councilName={detail.session.councilNameAtRun}
            rerunOpen={runAgainVisible}
            continuing={props.pendingAction === "continue"}
            actionPending={props.pendingAction !== null}
            recoveryRef={props.recoveryRef}
            onOpenEvidenceTarget={props.onOpenEvidenceTarget}
            onOpenProceedings={props.onOpenProceedings}
            onContinue={props.onContinue}
            onRunAgain={() => props.onSelectMode("rerun")}
          />
          {detail.session.status === "failed" ? null : (
            <AnswerRepeatActions
              status={detail.session.status}
              pendingAction={props.pendingAction}
              onAskAnother={props.onAskAnother}
              onRunAgain={() => props.onSelectMode("rerun")}
            />
          )}
        </section>
      ) : null}

      {props.activeMode === "how" ? (
        <SessionProceedings
          artifacts={detail.artifacts}
          proceedingsRef={props.proceedingsRef}
          formatCost={formatCost}
        />
      ) : null}

      {props.activeMode === "council" ? (
        <CouncilTrack
          members={detail.session.snapshot.council.members}
          artifacts={inspectorArtifacts}
          status={detail.session.status}
          onCellSelect={props.onScrollToMemberEvidence}
        />
      ) : null}

      {props.activeMode === "details" ? (
        props.diagnostics ? (
          <SessionDiagnosticsTable
            providerCalls={props.diagnostics.providerCalls}
            formatCost={formatCost}
          />
        ) : (
          <Card id="run-details-panel" className="p-6" tabIndex={-1}>
            <h2 className="surface-title">Run details</h2>
            <p className="m-0 mt-2 text-sm text-[var(--text-muted)]">
              Model calls and billing details load only when you ask for them.
            </p>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="mt-4"
              disabled={props.loadingDiagnostics}
              onClick={props.onLoadDiagnostics}
            >
              {props.loadingDiagnostics ? "Loading details…" : "Load run details"}
            </Button>
          </Card>
        )
      ) : null}

      {props.activeMode === "exports" ? (
        <SessionExportPanel
          hasAnswer={hasAnswer}
          busyAction={props.exportAction}
          onCopyAnswer={props.onCopyAnswer}
          onCopyAnswerWithNotes={props.onCopyAnswerWithNotes}
          onCopyLink={props.onCopyLink}
          onDownloadAnswer={props.onDownloadAnswer}
          onDownloadFullRecord={props.onDownloadFullRecord}
        />
      ) : null}

      {props.activeMode === "rerun" ? (
        <div ref={props.rerunRef} id="rerun-docket">
          <SessionRerunPanel
            fieldPrefix={props.fieldPrefix}
            rerunQuery={props.rerunQuery}
            rerunCouncil={props.rerunCouncil}
            availableCouncils={props.availableCouncils}
            councilLoadIssue={props.councilLoadIssue}
            councilLoadPending={props.councilLoadPending}
            exhibitCount={detail.session.snapshot.attachments.length}
            rerunning={props.pendingAction === "rerun"}
            actionPending={props.pendingAction !== null}
            actionMessage={props.rerunActionMessage}
            onQueryChange={props.onRerunQueryChange}
            onCouncilChange={props.onRerunCouncilChange}
            onRetryCouncils={props.onRetryCouncils}
            onRerun={props.onRerun}
          />
        </div>
      ) : null}
    </div>
  );
}
