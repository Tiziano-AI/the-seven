import type { TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={cn(
        "min-h-[132px] w-full rounded-[var(--radius-xl)] border-2 border-[var(--border-input)] bg-[var(--surface-raised)] px-4 py-3 text-sm text-[var(--foreground)] outline-none transition-all duration-200 placeholder:text-[var(--text-dim)] hover:border-[var(--gold)] focus:border-[var(--ring)] focus:shadow-[var(--glow-subtle)]",
        props.className,
      )}
    />
  );
}
