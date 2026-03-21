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

  return (
    <Badge
      className={cn(
        props.status === "completed" && "bg-emerald-100 text-emerald-800",
        props.status === "processing" && "bg-amber-100 text-amber-800",
        props.status === "pending" && "bg-slate-100 text-slate-700",
        props.status === "failed" && "bg-rose-100 text-rose-800",
      )}
    >
      {label}
    </Badge>
  );
}
