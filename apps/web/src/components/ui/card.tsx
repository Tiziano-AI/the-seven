import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function Card(props: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      {...props}
      className={cn(
        "rounded-[28px] border border-[var(--border)] bg-[var(--panel)] shadow-[0_20px_50px_rgba(17,24,39,0.08)]",
        props.className,
      )}
    />
  );
}
