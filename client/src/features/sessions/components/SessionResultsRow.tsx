import { CheckCircle2, ChevronDown, Loader2, MinusCircle, XCircle } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { Markdown } from "@/components/Markdown";
import { CopyButton } from "@/components/CopyButton";
import { formatUsdFromMicros } from "@shared/domain/usage";
import type { RouterOutputs } from "@/lib/trpcTypes";

type OpenRouterCallRow = RouterOutputs["query"]["getSession"]["openRouterCalls"][number];
type SessionStatus = RouterOutputs["query"]["getSession"]["session"]["status"];

export type RowStatus = Readonly<{
  kind: "queued" | "waiting" | "active" | "done" | "skipped" | "failed";
  label: string;
}>;

export type CouncilRow = Readonly<{
  phase: 1 | 2 | 3;
  memberPosition: number;
  badgeClassName: string;
  memberLabel: string;
  memberAlias: string;
  voice: Readonly<{ modelName: string; modelId: string }> | null;
  status: RowStatus;
  content: string | null;
  tokensUsed: number | null | undefined;
  costUsdMicros: number | null;
  costIsPartial: boolean;
}>;

function statusIcon(status: RowStatus) {
  if (status.kind === "active") {
    return <Loader2 className="animate-spin icon-sm text-violet" />;
  }
  if (status.kind === "done") {
    return <CheckCircle2 className="icon-sm text-evergreen" />;
  }
  if (status.kind === "failed") {
    return <XCircle className="icon-sm text-destructive" />;
  }
  if (status.kind === "skipped") {
    return <MinusCircle className="icon-sm text-muted-foreground" />;
  }
  return <Loader2 className="icon-sm text-muted-foreground opacity-40" />;
}

function phaseLabel(phase: 1 | 2 | 3): string {
  if (phase === 1) return "Reply";
  if (phase === 2) return "Critique";
  return "Verdict";
}

/**
 * SessionResultsRow renders a single council member row with disclosure for details.
 */
export function SessionResultsRow(props: {
  row: CouncilRow;
  call: OpenRouterCallRow | null;
  sessionStatus: SessionStatus;
  primaryFailureCall: OpenRouterCallRow | null;
  variant: "compact" | "detailed";
}) {
  const { row, call, sessionStatus, primaryFailureCall, variant } = props;
  const contextLength = call?.requestModelContextLength ?? null;
  const maxCompletion = call?.requestModelMaxCompletionTokens ?? null;
  const hasContent = row.content !== null && row.content.trim().length > 0;
  const canExpand = hasContent || row.status.kind === "failed" || call !== null;

  const sharedRowBody = (
    <div className="flex items-start justify-between gap-4">
      <div className="flex items-start gap-3">
        <span className={cn("badge", row.badgeClassName)}>{row.memberAlias}</span>
        <div className="min-w-0">
          <div className="text-sm font-medium text-foreground">{row.memberLabel}</div>
          {row.voice ? (
            <div className="text-xs text-muted-foreground">
              Voice: {row.voice.modelName}
              {variant === "detailed" && <span className="ml-2">({row.voice.modelId})</span>}
            </div>
          ) : (
            <div className="text-xs text-muted-foreground">Voice: —</div>
          )}
        </div>
      </div>

      <div className="flex items-center gap-3 shrink-0">
        {statusIcon(row.status)}
        <span className="text-sm text-muted-foreground">{row.status.label}</span>
        {canExpand && (
          <ChevronDown className="icon-sm text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
        )}
      </div>
    </div>
  );

  if (!canExpand) {
    return <div key={`member-${row.memberPosition}`} className="inset">{sharedRowBody}</div>;
  }

  return (
    <Collapsible key={`member-${row.memberPosition}`} className="inset inset-no-pad">
      <CollapsibleTrigger asChild>
        <button
          type="button"
          className="group w-full text-left p-4 hover:bg-muted/40 transition-colors"
        >
          {sharedRowBody}
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent className="px-4 pb-4">
        {hasContent ? (
          <>
            <div className="inset inset-card mt-3">
              <div className="flex items-center justify-between gap-2 mb-3">
                <div className="text-sm font-medium text-foreground">{phaseLabel(row.phase)}</div>
                <CopyButton value={row.content ?? ""} />
              </div>
              <Markdown markdown={row.content} />
            </div>
            {variant === "detailed" && (row.tokensUsed || row.costUsdMicros !== null || row.costIsPartial) && (
              <div className="mt-3 flex flex-wrap gap-4 text-muted-foreground text-sm">
                {row.tokensUsed ? <span>Tokens: {row.tokensUsed.toLocaleString()}</span> : null}
                {row.costUsdMicros !== null ? (
                  <span>Cost: ${formatUsdFromMicros(row.costUsdMicros, 4)}</span>
                ) : row.costIsPartial ? (
                  <span>Cost: pending</span>
                ) : null}
                {contextLength !== null ? (
                  <span>Context: {contextLength.toLocaleString()}</span>
                ) : null}
                {maxCompletion !== null ? (
                  <span>Max completion: {maxCompletion.toLocaleString()}</span>
                ) : null}
              </div>
            )}
          </>
        ) : (
          <div className="inset inset-card mt-3 space-y-2">
            <div className="text-sm font-medium text-foreground">No response.</div>
            {call ? (
              <div className="space-y-1">
                <div className="text-xs text-muted-foreground whitespace-pre-wrap break-words">
                  {call.errorMessage ?? call.choiceErrorMessage ?? "No error detail available."}
                </div>
                <div className="text-xs text-muted-foreground">
                  {call.responseId ? `response_id=${call.responseId}` : null}
                  {call.responseId && call.finishReason ? " • " : null}
                  {call.finishReason ? `finish_reason=${call.finishReason}` : null}
                  {call.finishReason && call.nativeFinishReason ? " • " : null}
                  {call.nativeFinishReason ? `native_finish_reason=${call.nativeFinishReason}` : null}
                  {(call.finishReason || call.nativeFinishReason) && call.usageTotalTokens ? " • " : null}
                  {call.usageTotalTokens ? `tokens=${call.usageTotalTokens.toLocaleString()}` : null}
                  {call.usageTotalTokens &&
                  (call.requestModelContextLength !== null || call.requestModelMaxCompletionTokens !== null)
                    ? " • "
                    : null}
                  {call.requestModelContextLength !== null
                    ? `model_context=${call.requestModelContextLength.toLocaleString()}`
                    : null}
                  {call.requestModelContextLength !== null && call.requestModelMaxCompletionTokens !== null
                    ? " • "
                    : null}
                  {call.requestModelMaxCompletionTokens !== null
                    ? `model_max_completion_tokens=${call.requestModelMaxCompletionTokens.toLocaleString()}`
                    : null}
                  {(call.usageTotalTokens ||
                    call.requestModelContextLength !== null ||
                    call.requestModelMaxCompletionTokens !== null) &&
                  call.requestTotalChars
                    ? " • "
                    : null}
                  request_chars={call.requestTotalChars.toLocaleString()}
                </div>
                {(call.choiceErrorCode || call.choiceErrorMessage) && (
                  <div className="text-xs text-muted-foreground whitespace-pre-wrap break-words">
                    {call.choiceErrorCode ? `choice_error_code=${call.choiceErrorCode}` : null}
                    {call.choiceErrorCode && call.choiceErrorMessage ? " • " : null}
                    {call.choiceErrorMessage ? `choice_error_message=${call.choiceErrorMessage}` : null}
                  </div>
                )}
                {call.errorStatus && (
                  <div className="text-xs text-muted-foreground">http_status={call.errorStatus}</div>
                )}
              </div>
            ) : sessionStatus === "failed" && primaryFailureCall ? (
              <div className="space-y-1">
                <div className="text-xs text-muted-foreground">
                  Not attempted. Execution stopped after an earlier failure:
                </div>
                <div className="text-xs text-muted-foreground whitespace-pre-wrap break-words">
                  Phase {primaryFailureCall.phase}, slot {primaryFailureCall.member.alias} (
                  {primaryFailureCall.requestModelName})
                </div>
                <div className="text-xs text-muted-foreground whitespace-pre-wrap break-words">
                  {primaryFailureCall.errorMessage ??
                    primaryFailureCall.choiceErrorMessage ??
                    "No provider error message recorded."}
                </div>
              </div>
            ) : (
              <div className="text-xs text-muted-foreground">
                No call record for this phase.
              </div>
            )}
          </div>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}
