import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { formatFailureKind } from "./session-inspector-formatters";

export function SessionStatusBadge(props: {
  status: "pending" | "processing" | "completed" | "failed";
  failureKind: string | null;
}) {
  const label =
    props.status === "pending"
      ? "Filed"
      : props.status === "processing"
        ? "Deliberating"
        : props.status === "completed"
          ? "Verdict entered"
          : props.failureKind
            ? `Needs recovery · ${formatFailureKind(props.failureKind)}`
            : "Needs recovery";

  const isActive = props.status === "pending" || props.status === "processing";

  return (
    <Badge
      className={cn(
        "seal",
        props.status === "completed" && "seal-success",
        props.status === "processing" && "seal-active",
        props.status === "failed" && "seal-danger",
        props.status === "pending" && "seal-filed",
        isActive && "border-[var(--brass)]",
      )}
    >
      {label}
    </Badge>
  );
}
