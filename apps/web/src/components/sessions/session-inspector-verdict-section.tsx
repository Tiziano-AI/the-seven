"use client";

import type { RefObject } from "react";
import { VerdictCard } from "@/components/inspector/verdict-card";
import { MissingVerdictArtifactCard, SynthesizerCredit } from "./session-inspector-chrome";
import { SessionRecoveryLedger } from "./session-recovery-ledger";

/** Renders the verdict, missing-verdict, or failed-run recovery section. */
export function SessionInspectorVerdictSection(props: {
  status: string;
  phase3Content: string | null;
  synthesizerModelId: string | undefined;
  synthesizerLabel: string | null;
  latencyLabel: string | null;
  artifactCount: number;
  reviewCount: number;
  failureKind: string | null;
  terminalError: string | null;
  councilName: string;
  rerunOpen: boolean;
  continuing: boolean;
  actionPending: boolean;
  recoveryRef: RefObject<HTMLDivElement | null>;
  onOpenEvidenceTarget: (targetId: string, fallbackId?: string) => void;
  onOpenProceedings: () => void;
  onContinue: () => void;
  onToggleRerun: () => void;
}) {
  if (props.phase3Content) {
    return (
      <>
        <div id="verdict-G">
          <VerdictCard
            content={props.phase3Content}
            onOpenEvidenceTarget={props.onOpenEvidenceTarget}
            onOpenProceedings={props.onOpenProceedings}
          />
        </div>
        <SynthesizerCredit
          modelId={props.synthesizerModelId}
          modelLabel={props.synthesizerLabel}
          latencyLabel={props.latencyLabel}
        />
      </>
    );
  }

  if (props.status === "failed") {
    return (
      <div ref={props.recoveryRef} id="recovery-ledger">
        <SessionRecoveryLedger
          artifactCount={props.artifactCount}
          reviewCount={props.reviewCount}
          failureKind={props.failureKind}
          terminalError={props.terminalError}
          councilName={props.councilName}
          rerunOpen={props.rerunOpen}
          continuing={props.continuing}
          actionPending={props.actionPending}
          onContinue={props.onContinue}
          onToggleRerun={props.onToggleRerun}
        />
      </div>
    );
  }

  return props.status === "completed" ? <MissingVerdictArtifactCard /> : null;
}
