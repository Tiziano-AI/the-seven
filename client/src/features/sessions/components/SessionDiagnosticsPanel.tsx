import type { ReactNode } from "react";
import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Markdown } from "@/components/Markdown";
import { CopyButton } from "@/components/CopyButton";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatUsdFromMicros } from "@shared/domain/usage";
import { memberForPosition, parseMemberPosition } from "@shared/domain/sevenMembers";

type DiagnosticsSectionProps = Readonly<{
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
}>;

function DiagnosticsSection(props: DiagnosticsSectionProps) {
  return (
    <div className="inset">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-sm font-medium text-foreground">{props.title}</div>
          {props.description ? (
            <div className="text-xs text-muted-foreground mt-1">{props.description}</div>
          ) : null}
        </div>
        {props.action ? <div className="action-rail">{props.action}</div> : null}
      </div>
      <div className="mt-3">{props.children}</div>
    </div>
  );
}

/**
 * SessionDiagnosticsPanel renders the stacked diagnostics sections with a single disclosure.
 */
export function SessionDiagnosticsPanel(props: { sessionId: number }) {
  const diagnosticsQuery = trpc.query.getSessionDiagnostics.useQuery(
    { sessionId: props.sessionId },
    { refetchOnWindowFocus: false }
  );
  const [open, setOpen] = useState(false);

  if (diagnosticsQuery.isLoading && !diagnosticsQuery.data) {
    return (
      <div className="inset inset-card">
        <div className="space-y-3">
          <Skeleton className="h-4 w-36" />
          <Skeleton className="h-4 w-64" />
          <Skeleton className="h-4 w-full" />
        </div>
      </div>
    );
  }

  if (diagnosticsQuery.isError) {
    return (
      <div className="inset inset-card">
        <div className="text-sm font-medium text-foreground">Diagnostics</div>
        <p className="text-muted-foreground text-sm mt-2">{diagnosticsQuery.error.message}</p>
      </div>
    );
  }

  const data = diagnosticsQuery.data;
  if (!data) return null;

  const diagnosticsExport = JSON.stringify(
    {
      session: data.session,
      runSpec: data.runSpec,
      attachments: data.attachments,
      openRouterCalls: data.openRouterCalls,
    },
    null,
    2
  );

  return (
    <Collapsible className="inset inset-card" open={open} onOpenChange={setOpen}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-base font-semibold surface-title">Diagnostics</div>
          <div className="text-xs text-muted-foreground">
            Inspect the exact formatted task and OpenRouter metadata (usage, finish reason, errors).
          </div>
        </div>
        <div className="action-rail">
          <CopyButton value={diagnosticsExport} tooltip="Copy diagnostics JSON" />
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="sm" className="group">
              {open ? "Hide details" : "Show details"}
              <ChevronDown className="icon-sm transition-transform group-data-[state=open]:rotate-180" />
            </Button>
          </CollapsibleTrigger>
        </div>
      </div>

      <CollapsibleContent className="mt-4 space-y-4">
        <DiagnosticsSection
          title="Calls"
          description="One row per OpenRouter request attempt (Phase 1/2/3). Usage tokens are normalized; cost reflects billing totals when available."
        >
          <Table>
            <TableCaption className="text-left">
              OpenRouter call records for this run.
            </TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead>Phase</TableHead>
                <TableHead>Slot</TableHead>
                <TableHead>Model</TableHead>
                <TableHead className="text-right">Prompt tokens</TableHead>
                <TableHead className="text-right">Completion tokens</TableHead>
                <TableHead className="text-right">Total tokens</TableHead>
                <TableHead className="text-right">Cost</TableHead>
                <TableHead>Finish</TableHead>
                <TableHead>Error</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.openRouterCalls.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-muted-foreground text-sm whitespace-normal">
                    No OpenRouter call records yet.
                  </TableCell>
                </TableRow>
              ) : (
                data.openRouterCalls.map((call) => (
                  <TableRow key={call.id}>
                    <TableCell>{call.phase}</TableCell>
                    <TableCell>{call.member.alias}</TableCell>
                    <TableCell className="whitespace-normal">
                      <div className="font-medium">{call.requestModelName}</div>
                      {call.responseModel && call.responseModel !== call.requestModelId ? (
                        <div className="text-xs text-muted-foreground">
                          routed: {call.responseModelName ?? call.responseModel}
                        </div>
                      ) : null}
                      {(call.requestModelContextLength !== null ||
                        call.requestModelMaxCompletionTokens !== null) && (
                        <div className="text-xs text-muted-foreground">
                          {call.requestModelContextLength !== null
                            ? `context: ${call.requestModelContextLength.toLocaleString()} tokens`
                            : "context: unknown"}
                          {call.requestModelMaxCompletionTokens !== null
                            ? ` • max completion: ${call.requestModelMaxCompletionTokens.toLocaleString()} tokens`
                            : ""}
                        </div>
                      )}
                      {call.billedModelName ? (
                        <div className="text-xs text-muted-foreground">
                          billed: {call.billedModelName}
                        </div>
                      ) : null}
                      {(call.nativeTokensPrompt !== null ||
                        call.nativeTokensCompletion !== null ||
                        call.nativeTokensReasoning !== null) && (
                        <div className="text-xs text-muted-foreground">
                          native tokens: {call.nativeTokensPrompt ?? 0}/{call.nativeTokensCompletion ?? 0}
                          {call.nativeTokensReasoning !== null ? `/${call.nativeTokensReasoning}` : ""}
                        </div>
                      )}
                      <div className="text-xs text-muted-foreground">
                        request chars: {call.requestTotalChars.toLocaleString()} (sys{" "}
                        {call.requestSystemChars.toLocaleString()}, user{" "}
                        {call.requestUserChars.toLocaleString()})
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      {call.usagePromptTokens?.toLocaleString() ?? "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      {call.usageCompletionTokens?.toLocaleString() ?? "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      {call.usageTotalTokens?.toLocaleString() ?? "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      {call.totalCostUsdMicros !== null
                        ? `$${formatUsdFromMicros(call.totalCostUsdMicros, 4)}`
                        : call.responseId
                          ? "pending"
                          : "—"}
                    </TableCell>
                    <TableCell className="whitespace-normal">
                      <div>{call.finishReason ?? "—"}</div>
                      {call.nativeFinishReason && call.nativeFinishReason !== call.finishReason ? (
                        <div className="text-xs text-muted-foreground">
                          native: {call.nativeFinishReason}
                        </div>
                      ) : null}
                    </TableCell>
                    <TableCell className="whitespace-normal text-xs text-muted-foreground">
                      {call.errorMessage ?? call.choiceErrorMessage ?? "—"}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </DiagnosticsSection>

        <DiagnosticsSection
          title="Task"
          description="The formatted user message sent to the council."
          action={<CopyButton value={data.runSpec.userMessage} tooltip="Copy task message" />}
        >
          <Markdown markdown={data.runSpec.userMessage} />
        </DiagnosticsSection>

        <DiagnosticsSection title="Formats" description="Output formats injected into each phase.">
          <div className="space-y-3">
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium">Phase 1 output format</p>
                <CopyButton value={data.runSpec.outputFormats.phase1} />
              </div>
              <Textarea
                value={data.runSpec.outputFormats.phase1}
                readOnly
                rows={4}
                className="control-compact control-readonly font-mono resize-y"
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium">Phase 2 output format</p>
                <CopyButton value={data.runSpec.outputFormats.phase2} />
              </div>
              <Textarea
                value={data.runSpec.outputFormats.phase2}
                readOnly
                rows={8}
                className="control-compact control-readonly font-mono resize-y"
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium">Phase 3 output format</p>
                <CopyButton value={data.runSpec.outputFormats.phase3} />
              </div>
              <Textarea
                value={data.runSpec.outputFormats.phase3}
                readOnly
                rows={4}
                className="control-compact control-readonly font-mono resize-y"
              />
            </div>
          </div>
        </DiagnosticsSection>

        <DiagnosticsSection
          title="Council"
          description="Council snapshot captured in runSpec (models + tuning)."
          action={
            <CopyButton value={JSON.stringify(data.runSpec.council, null, 2)} tooltip="Copy council JSON" />
          }
        >
          <Table>
            <TableCaption className="text-left">
              Council snapshot recorded at submit time.
            </TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead>Slot</TableHead>
                <TableHead>Model</TableHead>
                <TableHead>Tuning</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.runSpec.council.members.map((member) => {
                const tuning = member.tuning;
                const parts: string[] = [];
                if (tuning && tuning.temperature !== null && tuning.temperature !== undefined) {
                  parts.push(`temperature=${tuning.temperature}`);
                }
                if (tuning && tuning.seed !== null && tuning.seed !== undefined) {
                  parts.push(`seed=${tuning.seed}`);
                }
                if (tuning && tuning.verbosity) {
                  parts.push(`verbosity=${tuning.verbosity}`);
                }
                if (tuning && tuning.reasoningEffort) {
                  parts.push(`reasoningEffort=${tuning.reasoningEffort}`);
                }
                if (tuning && tuning.includeReasoning !== null && tuning.includeReasoning !== undefined) {
                  parts.push(`includeReasoning=${tuning.includeReasoning ? "true" : "false"}`);
                }

                const parsedPosition = parseMemberPosition(member.memberPosition);
                const label = parsedPosition
                  ? memberForPosition(parsedPosition).alias
                  : String(member.memberPosition);
                return (
                  <TableRow key={member.memberPosition}>
                    <TableCell>{label}</TableCell>
                    <TableCell className="whitespace-normal">{member.model.modelId}</TableCell>
                    <TableCell className="whitespace-normal text-xs text-muted-foreground">
                      {parts.length > 0 ? parts.join(" • ") : "Auto"}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </DiagnosticsSection>

        <DiagnosticsSection title="Attachments">
          {data.attachments.length === 0 ? (
            <div className="text-sm text-muted-foreground">No attachments for this run.</div>
          ) : (
            <div className="space-y-3">
              {data.attachments.map((attachment) => (
                <div key={attachment.name} className="inset inset-card">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-sm font-medium">{attachment.name}</div>
                    <CopyButton value={attachment.text} tooltip="Copy attachment text" />
                  </div>
                  <div className="mt-3">
                    <Markdown markdown={attachment.text} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </DiagnosticsSection>
      </CollapsibleContent>
    </Collapsible>
  );
}
