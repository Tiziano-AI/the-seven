import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export function SessionStatusBadge(props: {
  status: "pending" | "processing" | "completed" | "failed";
  failureKind: string | null;
}) {
  const label =
    props.status === "failed" && props.failureKind
      ? `failed · ${props.failureKind.replaceAll("_", " ")}`
      : props.status;

  const isActive = props.status === "pending" || props.status === "processing";

  return (
    <Badge
      className={cn(
        props.status === "completed" && "bg-[var(--evergreen)] text-[var(--bg)]",
        props.status === "processing" && "bg-[var(--gold)] text-[var(--bg)]",
        props.status === "pending" && "bg-[var(--wood-soft)] text-[var(--foreground)]",
        props.status === "failed" && "bg-[var(--destructive)] text-[var(--foreground)]",
        isActive && "animate-pulse-glow",
      )}
    >
      {label}
    </Badge>
  );
}
