import type { SessionDetailPayload, SessionDiagnosticsPayload } from "@/lib/apiSchemas";
import { calculateSessionTotals } from "@/features/sessions/domain/totals";
import { formatUsdFromMicros } from "@shared/domain/usage";
import { memberForPosition, parseMemberPosition } from "@shared/domain/sevenMembers";

type SessionResults = SessionDetailPayload;
type SessionDiagnostics = SessionDiagnosticsPayload;

export type ExportItemKey =
  | "question"
  | "verdict"
  | "critiques"
  | "replies"
  | "costs"
  | "prompts"
  | "model_config"
  | "diagnostics";

export type ExportSelection = Readonly<Record<ExportItemKey, boolean>>;

export const DEFAULT_EXPORT_SELECTION: ExportSelection = {
  question: true,
  verdict: true,
  critiques: true,
  replies: true,
  costs: true,
  prompts: true,
  model_config: true,
  diagnostics: true,
};

export type ExportRunBundle = Readonly<{
  session: SessionResults;
  diagnostics: SessionDiagnostics;
}>;

export type ExportPayload = Readonly<{
  exportedAt: string;
  selection: ExportSelection;
  runs: ReadonlyArray<ExportRun>;
}>;

export type ExportRun = Readonly<{
  session: Readonly<{
    id: number;
    status: SessionResults["session"]["status"];
    failureKind: SessionResults["session"]["failureKind"];
    councilNameAtRun: string;
    createdAt: SessionResults["session"]["createdAt"];
    updatedAt: SessionResults["session"]["updatedAt"];
  }>;
  question?: string;
  verdict?: Readonly<{
    member: NonNullable<SessionResults["synthesis"]>["member"];
    modelId: string;
    modelName: string;
    content: string;
    tokensUsed: number | null;
    costUsdMicros: number | null;
  }> | null;
  critiques?: ReadonlyArray<Readonly<{
    reviewerMember: SessionResults["reviews"][number]["reviewerMember"];
    modelId: string;
    modelName: string;
    content: string;
    tokensUsed: number | null;
    costUsdMicros: number | null;
  }>>;
  replies?: ReadonlyArray<Readonly<{
    member: SessionResults["responses"][number]["member"];
    modelId: string;
    modelName: string;
    content: string;
    tokensUsed: number | null;
    costUsdMicros: number | null;
  }>>;
  costs?: Readonly<{
    totalTokens: number;
    totalCostUsdMicros: number;
    totalCostIsPartial: boolean;
  }>;
  prompts?: Readonly<{
    taskMessage: string;
    phasePrompts: SessionDiagnostics["runSpec"]["council"]["phasePrompts"];
    outputFormats: SessionDiagnostics["runSpec"]["outputFormats"];
  }>;
  modelConfig?: Readonly<{
    members: ReadonlyArray<Readonly<{
      memberPosition: number;
      alias: string;
      label: string;
      modelId: string;
      modelName: string | null;
      tuning: SessionDiagnostics["runSpec"]["council"]["members"][number]["tuning"];
    }>>;
  }>;
  diagnostics?: Readonly<{
    openRouterCalls: SessionDiagnostics["openRouterCalls"];
  }>;
  attachments: SessionDiagnostics["attachments"];
}>;

export function buildJsonExport(params: {
  exportedAt: string;
  selection: ExportSelection;
  runs: ReadonlyArray<ExportRunBundle>;
}): ExportPayload {
  const selection = params.selection;

  const runs = params.runs.map((bundle) => {
    const session = bundle.session;
    const diagnostics = bundle.diagnostics;
    const totals = calculateSessionTotals(session);

    const modelNameByPosition = new Map<number, string>();
    for (const member of session.council.members) {
      modelNameByPosition.set(member.member.position, member.model.modelName);
    }

    const membersConfig = diagnostics.runSpec.council.members.map((member) => {
      const position = member.memberPosition;
      const parsed = parseMemberPosition(position);
      const label = parsed ? memberForPosition(parsed).label : `Member ${position}`;
      const alias = parsed ? memberForPosition(parsed).alias : String(position);
      return {
        memberPosition: position,
        alias,
        label,
        modelId: member.model.modelId,
        modelName: modelNameByPosition.get(position) ?? null,
        tuning: member.tuning ?? null,
      };
    });

    return {
      session: {
        id: session.session.id,
        status: session.session.status,
        failureKind: session.session.failureKind,
        councilNameAtRun: session.session.councilNameAtRun,
        createdAt: session.session.createdAt,
        updatedAt: session.session.updatedAt,
      },
      question: selection.question ? session.session.query : undefined,
      verdict: selection.verdict
        ? session.synthesis
          ? {
              member: session.synthesis.member,
              modelId: session.synthesis.modelId,
              modelName: session.synthesis.modelName,
              content: session.synthesis.synthesis,
              tokensUsed: session.synthesis.tokensUsed ?? null,
              costUsdMicros: session.synthesis.costUsdMicros ?? null,
            }
          : null
        : undefined,
      critiques: selection.critiques
        ? session.reviews.map((review) => ({
            reviewerMember: review.reviewerMember,
            modelId: review.modelId,
            modelName: review.modelName,
            content: review.reviewContent,
            tokensUsed: review.tokensUsed ?? null,
            costUsdMicros: review.costUsdMicros ?? null,
          }))
        : undefined,
      replies: selection.replies
        ? session.responses.map((response) => ({
            member: response.member,
            modelId: response.modelId,
            modelName: response.modelName,
            content: response.response,
            tokensUsed: response.tokensUsed ?? null,
            costUsdMicros: response.costUsdMicros ?? null,
          }))
        : undefined,
      costs: selection.costs
        ? {
            totalTokens: totals.totalTokens,
            totalCostUsdMicros: totals.totalCostUsdMicros,
            totalCostIsPartial: totals.totalCostIsPartial,
          }
        : undefined,
      prompts: selection.prompts
        ? {
            taskMessage: diagnostics.runSpec.userMessage,
            phasePrompts: diagnostics.runSpec.council.phasePrompts,
            outputFormats: diagnostics.runSpec.outputFormats,
          }
        : undefined,
      modelConfig: selection.model_config ? { members: membersConfig } : undefined,
      diagnostics: selection.diagnostics ? { openRouterCalls: diagnostics.openRouterCalls } : undefined,
      attachments: diagnostics.attachments,
    };
  });

  return {
    exportedAt: params.exportedAt,
    selection,
    runs,
  };
}

export function buildMarkdownExport(params: {
  exportedAt: string;
  selection: ExportSelection;
  runs: ReadonlyArray<ExportRunBundle>;
}): string {
  const selection = params.selection;
  const lines: string[] = [];
  lines.push("# The Seven — Export");
  lines.push("");
  lines.push(`Exported: ${params.exportedAt}`);
  lines.push("");

  for (const bundle of params.runs) {
    const run = bundle.session;
    const diagnostics = bundle.diagnostics;
    const totals = calculateSessionTotals(run);
    lines.push(`## Run #${run.session.id}`);
    lines.push("");
    lines.push(`- Status: ${run.session.status}`);
    lines.push(`- Council: ${run.session.councilNameAtRun}`);
    lines.push(`- Created: ${run.session.createdAt}`);
    if (run.session.failureKind) {
      lines.push(`- Failure: ${run.session.failureKind}`);
    }
    lines.push("");

    if (selection.question) {
      lines.push("### Question");
      lines.push("");
      lines.push(run.session.query);
      lines.push("");
    }

    if (selection.costs) {
      lines.push("### Costs & Usage");
      lines.push("");
      const costLabel = totals.totalCostIsPartial
        ? totals.totalCostUsdMicros === 0
          ? "pending"
          : `$${formatUsdFromMicros(totals.totalCostUsdMicros, 4)} (partial)`
        : `$${formatUsdFromMicros(totals.totalCostUsdMicros, 4)}`;
      lines.push(`- Total tokens: ${totals.totalTokens.toLocaleString()}`);
      lines.push(`- Total cost: ${costLabel}`);
      lines.push("");
    }

    if (selection.verdict) {
      lines.push("### Verdict");
      lines.push("");
      if (run.synthesis) {
        lines.push(run.synthesis.synthesis);
      } else {
        lines.push("_No verdict captured._");
      }
      lines.push("");
    }

    if (selection.critiques) {
      lines.push("### Critiques");
      lines.push("");
      if (run.reviews.length === 0) {
        lines.push("_No critiques captured._");
        lines.push("");
      } else {
        for (const review of run.reviews) {
          lines.push(`#### ${review.reviewerMember.alias} — ${review.modelName}`);
          lines.push("");
          lines.push(review.reviewContent);
          lines.push("");
        }
      }
    }

    if (selection.replies) {
      lines.push("### Replies");
      lines.push("");
      if (run.responses.length === 0) {
        lines.push("_No replies captured._");
        lines.push("");
      } else {
        for (const response of run.responses) {
          lines.push(`#### ${response.member.alias} — ${response.modelName}`);
          lines.push("");
          lines.push(response.response);
          lines.push("");
        }
      }
    }

    if (selection.prompts) {
      lines.push("### Prompts");
      lines.push("");
      lines.push("#### Task message");
      lines.push("");
      lines.push(diagnostics.runSpec.userMessage);
      lines.push("");
      lines.push("#### Phase prompts");
      lines.push("");
      lines.push(`- Phase 1: ${diagnostics.runSpec.council.phasePrompts.phase1}`);
      lines.push(`- Phase 2: ${diagnostics.runSpec.council.phasePrompts.phase2}`);
      lines.push(`- Phase 3: ${diagnostics.runSpec.council.phasePrompts.phase3}`);
      lines.push("");
      lines.push("#### Output formats");
      lines.push("");
      lines.push("**Phase 1**");
      lines.push("");
      lines.push(diagnostics.runSpec.outputFormats.phase1);
      lines.push("");
      lines.push("**Phase 2**");
      lines.push("");
      lines.push(diagnostics.runSpec.outputFormats.phase2);
      lines.push("");
      lines.push("**Phase 3**");
      lines.push("");
      lines.push(diagnostics.runSpec.outputFormats.phase3);
      lines.push("");
    }

    if (selection.model_config) {
      lines.push("### Model Configuration");
      lines.push("");
      for (const member of diagnostics.runSpec.council.members) {
        const parsed = parseMemberPosition(member.memberPosition);
        const label = parsed ? memberForPosition(parsed).label : `Member ${member.memberPosition}`;
        const alias = parsed ? memberForPosition(parsed).alias : String(member.memberPosition);
        const tuningParts: string[] = [];
        if (member.tuning?.temperature !== null && member.tuning?.temperature !== undefined) {
          tuningParts.push(`temperature=${member.tuning.temperature}`);
        }
        if (member.tuning?.seed !== null && member.tuning?.seed !== undefined) {
          tuningParts.push(`seed=${member.tuning.seed}`);
        }
        if (member.tuning?.verbosity) {
          tuningParts.push(`verbosity=${member.tuning.verbosity}`);
        }
        if (member.tuning?.reasoningEffort) {
          tuningParts.push(`reasoningEffort=${member.tuning.reasoningEffort}`);
        }
        if (member.tuning?.includeReasoning !== null && member.tuning?.includeReasoning !== undefined) {
          tuningParts.push(`includeReasoning=${member.tuning.includeReasoning ? "true" : "false"}`);
        }
        lines.push(`- ${alias} (${label}): ${member.model.modelId}`);
        if (tuningParts.length > 0) {
          lines.push(`  - tuning: ${tuningParts.join(" • ")}`);
        }
      }
      lines.push("");
    }

    if (selection.diagnostics) {
      lines.push("### Diagnostics");
      lines.push("");
      lines.push("| Phase | Slot | Request model | Response model | Tokens | Cost | Finish | Error |");
      lines.push("| --- | --- | --- | --- | --- | --- | --- | --- |");
      for (const call of diagnostics.openRouterCalls) {
        const responseModel = call.responseModelName ?? call.responseModel ?? "—";
        const tokens = call.usageTotalTokens ? call.usageTotalTokens.toLocaleString() : "—";
        const cost =
          call.totalCostUsdMicros !== null
            ? `$${formatUsdFromMicros(call.totalCostUsdMicros, 4)}`
            : call.responseId
              ? "pending"
              : "—";
        const finish = call.finishReason ?? "—";
        const error = (call.errorMessage ?? call.choiceErrorMessage ?? "—").replaceAll("|", "\\|").replaceAll("\n", " ");
        lines.push(
          `| ${call.phase} | ${call.member.alias} | ${call.requestModelName} | ${responseModel} | ${tokens} | ${cost} | ${finish} | ${error} |`
        );
      }
      lines.push("");
    }

    lines.push("### Attachments");
    lines.push("");
    if (diagnostics.attachments.length === 0) {
      lines.push("_No attachments captured._");
      lines.push("");
    } else {
      for (const attachment of diagnostics.attachments) {
        lines.push(`#### ${attachment.name}`);
        lines.push("");
        lines.push(buildFencedBlock(attachment.text, "text"));
        lines.push("");
      }
    }
  }

  return lines.join("\n");
}

export function buildExportFilename(params: {
  sessionIds: ReadonlyArray<number>;
  extension: "json" | "md";
  exportedAt: string;
}): string {
  const stamp = params.exportedAt.replaceAll(":", "").replaceAll(".", "").replace("T", "_").split("Z")[0];
  if (params.sessionIds.length === 1) {
    return `the-seven-run-${params.sessionIds[0]}-${stamp}.${params.extension}`;
  }
  return `the-seven-runs-${params.sessionIds.length}-${stamp}.${params.extension}`;
}

function buildFencedBlock(content: string, language: string): string {
  const fence = fenceFor(content);
  return `${fence}${language}\n${content}\n${fence}`;
}

function fenceFor(content: string): string {
  let maxRun = 0;
  let current = 0;
  for (const char of content) {
    if (char === "`") {
      current += 1;
      if (current > maxRun) maxRun = current;
    } else {
      current = 0;
    }
  }
  return "`".repeat(Math.max(3, maxRun + 1));
}
