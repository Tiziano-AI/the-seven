import type { InputHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={cn(
        "h-11 w-full rounded-[var(--radius-lg)] border-2 border-[var(--border-input)] bg-[var(--surface-raised)] px-4 text-sm text-[var(--foreground)] outline-none transition-all duration-200 placeholder:text-[var(--text-dim)] hover:border-[var(--gold)] focus:border-[var(--ring)] focus:shadow-[var(--glow-subtle)]",
        props.className,
      )}
    />
  );
}
