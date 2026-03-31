import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function Card(props: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      {...props}
      className={cn(
        "rounded-[28px] border border-[var(--border)] bg-[var(--bg-soft)] shadow-[var(--shadow-lg)] backdrop-blur-[10px]",
        props.className,
      )}
      style={{
        background: "var(--gradient-panel)",
        ...props.style,
      }}
    />
  );
}
