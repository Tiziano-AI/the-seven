import { useMemo } from "react";

import type { SessionDetailPayload } from "@shared/domain/apiSchemas";
import { Skeleton } from "@/components/ui/skeleton";
import { SessionResultsRow, type CouncilRow, type RowStatus } from "./SessionResultsRow";
import { MEMBER_POSITIONS, memberForPosition } from "@shared/domain/sevenMembers";

type OpenRouterCallRow = SessionDetailPayload["openRouterCalls"][number];

/**
 * SessionResultsLadder renders the phase ladder (Verdict -> Critiques -> Replies).
 */
export function SessionResultsLadder(props: {
  isLoading: boolean;
  data: SessionDetailPayload | undefined;
  variant?: "compact" | "detailed";
}) {
  const sessionData = props.data;
  const variant = props.variant ?? "compact";

  if (props.isLoading && !sessionData) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 3 }).map((_, index) => (
          <div key={`skeleton-${index}`} className="inset inset-card">
            <div className="space-y-2">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-3 w-64" />
            </div>
            <div className="mt-4 space-y-3">
              {Array.from({ length: 2 }).map((__, rowIndex) => (
                <Skeleton key={`row-${index}-${rowIndex}`} className="h-10 w-full" />
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (!sessionData) {
    return (
      <div className="empty-state">
        <p className="text-muted-foreground">No run selected</p>
      </div>
    );
  }

  const responses = sessionData.responses;
  const reviews = sessionData.reviews;
  const synthesis = sessionData.synthesis;
  const sessionStatus = sessionData.session.status;

  const callsByPhaseAndMemberPosition = useMemo(() => {
    const map = new Map<string, OpenRouterCallRow>();
    for (const call of sessionData.openRouterCalls) {
      map.set(`${call.phase}:${call.memberPosition}`, call);
    }
    return map;
  }, [sessionData.openRouterCalls]);

  const primaryFailureCall = useMemo(() => {
    for (const call of sessionData.openRouterCalls) {
      if (call.errorMessage) return call;
      if (call.errorStatus) return call;
      if (call.choiceErrorMessage) return call;
      if (call.choiceErrorCode) return call;
    }
    return null;
  }, [sessionData.openRouterCalls]);

  const voicesByPosition = new Map<number, Readonly<{ modelName: string; modelId: string }>>();
  for (const member of sessionData.council.members) {
    voicesByPosition.set(member.member.position, {
      modelName: member.model.modelName,
      modelId: member.model.modelId,
    });
  }

  const responsesByPosition = new Map<number, (typeof responses)[number]>();
  for (const response of responses) {
    responsesByPosition.set(response.member.position, response);
  }

  const reviewsByPosition = new Map<number, (typeof reviews)[number]>();
  for (const review of reviews) {
    reviewsByPosition.set(review.reviewerMember.position, review);
  }

  const members = MEMBER_POSITIONS.map(memberForPosition);
  const completedResponses = responses.filter((r) => r.response.trim().length > 0).length;
  const completedReviews = reviews.filter((r) => r.reviewContent.trim().length > 0).length;
  const hasAllResponses = completedResponses >= 6;
  const hasAllReviews = completedReviews >= 6;

  function getVoiceForMember(
    memberPosition: number
  ): Readonly<{ modelName: string; modelId: string }> | null {
    const configured = voicesByPosition.get(memberPosition) ?? null;
    return configured;
  }

  function buildPhase1Status(member: ReturnType<typeof memberForPosition>): RowStatus {
    if (member.role === "synthesizer") {
      return { kind: "skipped", label: "Listening" };
    }
    const response = responsesByPosition.get(member.position);
    if (response && response.response.trim().length > 0) return { kind: "done", label: "Spoke" };
    if (response) return { kind: "failed", label: "No output" };
    if (sessionStatus === "failed") return { kind: "failed", label: "Did not finish" };
    if (sessionStatus === "pending") return { kind: "queued", label: "Queued" };
    return { kind: "active", label: "Speaking…" };
  }

  function buildPhase2Status(member: ReturnType<typeof memberForPosition>): RowStatus {
    if (member.role === "synthesizer") {
      return { kind: "skipped", label: "Listening" };
    }
    const review = reviewsByPosition.get(member.position);
    if (review && review.reviewContent.trim().length > 0) return { kind: "done", label: "Weighed in" };
    if (review) return { kind: "failed", label: "No output" };
    if (sessionStatus === "failed") return { kind: "failed", label: "Did not finish" };
    if (!hasAllResponses) return { kind: "waiting", label: "Waiting for replies" };
    if (sessionStatus === "pending") return { kind: "queued", label: "Queued" };
    return { kind: "active", label: "Deliberating…" };
  }

  function buildPhase3Status(member: ReturnType<typeof memberForPosition>): RowStatus {
    if (member.role === "reviewer") {
      return { kind: "skipped", label: "Standing by" };
    }
    if (synthesis && synthesis.synthesis.trim().length > 0) return { kind: "done", label: "Verdict delivered" };
    if (synthesis) return { kind: "failed", label: "No output" };
    if (sessionStatus === "failed") return { kind: "failed", label: "No verdict" };
    if (!hasAllReviews) return { kind: "waiting", label: "Waiting for critique" };
    if (sessionStatus === "pending") return { kind: "queued", label: "Queued" };
    return { kind: "active", label: "Drafting verdict…" };
  }

  const renderRow = (row: CouncilRow) => (
    <SessionResultsRow
      key={`member-${row.memberPosition}`}
      row={row}
      call={callsByPhaseAndMemberPosition.get(`${row.phase}:${row.memberPosition}`) ?? null}
      sessionStatus={sessionStatus}
      primaryFailureCall={primaryFailureCall}
      variant={variant}
    />
  );

  function buildPhaseRows(phase: 1 | 2 | 3): CouncilRow[] {
    const rows: CouncilRow[] = [];
    for (const member of members) {
      if (phase === 3 && member.role !== "synthesizer") continue;
      const voice = getVoiceForMember(member.position);
      const call = callsByPhaseAndMemberPosition.get(`${phase}:${member.position}`) ?? null;
      const costUsdMicros = call?.totalCostUsdMicros ?? null;
      const costIsPartial = !!call?.responseId && costUsdMicros === null;

      if (phase === 1) {
        const response = responsesByPosition.get(member.position);
        rows.push({
          phase,
          memberPosition: member.position,
          badgeClassName: "badge-primary",
          memberLabel: member.label,
          memberAlias: member.alias,
          voice: response ? { modelName: response.modelName, modelId: response.modelId } : voice,
          status: buildPhase1Status(member),
          content: response?.response ?? null,
          tokensUsed: call?.usageTotalTokens ?? null,
          costUsdMicros,
          costIsPartial,
        });
        continue;
      }

      if (phase === 2) {
        const review = reviewsByPosition.get(member.position);
        rows.push({
          phase,
          memberPosition: member.position,
          badgeClassName: "badge-secondary",
          memberLabel: member.label,
          memberAlias: member.alias,
          voice: review ? { modelName: review.modelName, modelId: review.modelId } : voice,
          status: buildPhase2Status(member),
          content: review?.reviewContent ?? null,
          tokensUsed: call?.usageTotalTokens ?? null,
          costUsdMicros,
          costIsPartial,
        });
        continue;
      }

      rows.push({
        phase,
        memberPosition: member.position,
        badgeClassName: "badge-accent",
        memberLabel: member.label,
        memberAlias: member.alias,
        voice: synthesis ? { modelName: synthesis.modelName, modelId: synthesis.modelId } : voice,
        status: buildPhase3Status(member),
        content: synthesis?.synthesis ?? null,
        tokensUsed: call?.usageTotalTokens ?? null,
        costUsdMicros,
        costIsPartial,
      });
    }
    return rows;
  }

  const sections = [
    {
      title: "Phase 3 - Verdict",
      subtitle: `Verdict (${synthesis ? 1 : 0}/1)`,
      rows: buildPhaseRows(3),
    },
    {
      title: "Phase 2 - Critiques",
      subtitle: `Critiques (${completedReviews}/6)`,
      rows: buildPhaseRows(2),
    },
    {
      title: "Phase 1 - Replies",
      subtitle: `Replies (${completedResponses}/6)`,
      rows: buildPhaseRows(1),
    },
  ];

  return (
    <div className="space-y-4">
      {sessionStatus === "failed" && (
        <div className="inset inset-card">
          <div className="text-sm font-medium text-foreground">Interrupted</div>
          {primaryFailureCall ? (
            <div className="mt-2 space-y-1">
              <div className="text-xs text-muted-foreground">
                Phase {primaryFailureCall.phase}, slot {primaryFailureCall.member.alias} (
                {primaryFailureCall.requestModelName})
              </div>
              <div className="text-xs text-muted-foreground whitespace-pre-wrap break-words">
                {primaryFailureCall.errorMessage ??
                  primaryFailureCall.choiceErrorMessage ??
                  "No error detail available."}
              </div>
            </div>
          ) : (
            <div className="mt-2 text-xs text-muted-foreground">
              No call record for this run.
            </div>
          )}
        </div>
      )}

      {sections.map((section) => (
        <div key={section.title} className="inset inset-card">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="text-base font-semibold surface-title">{section.title}</div>
              <div className="text-xs text-muted-foreground">{section.subtitle}</div>
            </div>
          </div>
          <div className="mt-4 space-y-3">{section.rows.map(renderRow)}</div>
        </div>
      ))}
    </div>
  );
}
