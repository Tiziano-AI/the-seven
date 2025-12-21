export type SessionStatus = "pending" | "processing" | "completed" | "failed";

export function formatSessionStatus(status: SessionStatus): string {
  if (status === "pending") return "Queued";
  if (status === "processing") return "Running";
  if (status === "completed") return "Complete";
  return "Interrupted";
}

export function statusBadgeClass(status: SessionStatus): string {
  if (status === "completed") return "badge-secondary";
  if (status === "processing") return "badge-accent";
  if (status === "pending") return "badge-muted";
  return "badge-muted";
}
