export function downloadText(filename: string, text: string, type: string) {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function formatCost(micros: number | null) {
  if (micros === null) return "n/a";
  return `$${(micros / 1_000_000).toFixed(6)}`;
}

export function formatLatencySeconds(detail: {
  providerCalls: ReadonlyArray<{ latencyMs: number | null }>;
}) {
  const total = detail.providerCalls.reduce((sum, call) => sum + (call.latencyMs ?? 0), 0);
  if (!total) return null;
  return `${(total / 1000).toFixed(1)}s provider-call time`;
}

export function formatExhibitLabel(exhibits: readonly unknown[]) {
  if (exhibits.length === 0) return "no exhibits";
  return exhibits.length === 1 ? "1 exhibit" : `${exhibits.length} exhibits`;
}

type SessionStatus = "pending" | "processing" | "completed" | "failed";

export function formatTokenEvidence(status: SessionStatus, tokens: number) {
  if ((status === "pending" || status === "processing") && tokens === 0) {
    return "tokens pending";
  }
  return `${tokens} tokens`;
}

export function formatCostEvidence(detail: {
  status: SessionStatus;
  totalCostIsPartial: boolean;
  totalCostUsdMicros: number;
}) {
  if (
    (detail.status === "pending" || detail.status === "processing") &&
    detail.totalCostUsdMicros === 0
  ) {
    return "cost pending";
  }
  if (detail.totalCostIsPartial && detail.totalCostUsdMicros === 0) {
    return "cost pending";
  }
  if (detail.totalCostIsPartial) {
    return `partial cost ${formatCost(detail.totalCostUsdMicros)}`;
  }
  return formatCost(detail.totalCostUsdMicros);
}

export function formatFailureKind(failureKind: string | null) {
  if (!failureKind) return "Unknown failure";
  if (failureKind === "server_restart") return "Interrupted after server restart";
  if (failureKind === "phase1_inference_failed") return "Draft phase failed";
  if (failureKind === "phase2_inference_failed") return "Critique phase failed";
  if (failureKind === "phase3_inference_failed") return "Verdict phase failed";
  if (failureKind === "invalid_run_spec") return "Run specification needs repair";
  if (failureKind === "concurrent_execution") return "Another worker already owns this run";
  if (failureKind === "openrouter_rate_limited") return "OpenRouter rate limited this run";
  if (failureKind === "internal_error") return "Internal run error";
  return failureKind.replaceAll("_", " ");
}

export function manuscriptLoadIssue(error: unknown) {
  return error instanceof Error && /not found/iu.test(error.message)
    ? "Manuscript not found."
    : "Failed to load manuscript.";
}
