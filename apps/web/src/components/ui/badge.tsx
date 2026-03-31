import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function Badge(props: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      {...props}
      className={cn(
        "inline-flex items-center rounded-full bg-[var(--bg-soft)] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]",
        props.className,
      )}
    />
  );
}
