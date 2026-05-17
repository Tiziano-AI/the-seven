import type { fetchCouncils } from "@/lib/api";

type CouncilSummary = Awaited<ReturnType<typeof fetchCouncils>>["councils"][number];

/** Encodes a council list item for browser-owned radio and draft persistence. */
export function councilChoiceValue(council: CouncilSummary): string {
  return council.ref.kind === "built_in"
    ? `built_in:${council.ref.slug}`
    : `user:${council.ref.councilId}`;
}

/** Maps demo consume denial state to the locked-gate banner copy. */
export function demoLinkBannerMessage(state: string): string {
  if (state === "expired") return "Your demo link expired. Request a fresh one below.";
  if (state === "disabled") {
    return "Demo mode is unavailable right now. Bring your own key instead, or try again later.";
  }
  return "That demo link is invalid or already used. Request a fresh one below.";
}

/** Formats selected file byte counts for the ask composer. */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
