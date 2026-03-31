"use client";

import { cva, type VariantProps } from "class-variance-authority";
import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center rounded-full px-5 py-3 text-sm font-medium transition-all duration-200 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50",
  {
    variants: {
      variant: {
        primary:
          "bg-gradient-to-br from-[var(--violet)] to-[var(--gold)] border border-[var(--gold)] text-[var(--foreground)] shadow-[var(--shadow-deep)] hover:shadow-[var(--glow-violet),var(--shadow-deep)] hover:-translate-y-px hover:border-[var(--gold-bright)]",
        secondary:
          "bg-gradient-to-br from-[var(--evergreen-soft)] to-[var(--evergreen)] border border-[var(--evergreen)] text-[var(--foreground)] shadow-[var(--shadow-deep)] hover:shadow-[var(--glow-evergreen),var(--shadow-deep)] hover:-translate-y-px hover:border-[var(--evergreen-bright)]",
        ghost:
          "bg-transparent text-[var(--text-muted)] hover:bg-[var(--bg-soft)] hover:text-[var(--foreground)]",
        danger:
          "bg-[var(--destructive)] border border-[var(--destructive)] text-[var(--foreground)] hover:brightness-110",
      },
    },
    defaultVariants: {
      variant: "primary",
    },
  },
);

export function Button(
  props: ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof buttonVariants>,
) {
  const { className, variant, ...rest } = props;
  return <button className={cn(buttonVariants({ variant }), className)} type="button" {...rest} />;
}
