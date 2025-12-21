import { cn } from "@/lib/utils";
import { formatSessionStatus, statusBadgeClass, type SessionStatus } from "../domain/status";

export function StatusBadge(props: { status: SessionStatus; className?: string }) {
  return (
    <span className={cn("badge", statusBadgeClass(props.status), props.className)}>
      {formatSessionStatus(props.status)}
    </span>
  );
}
