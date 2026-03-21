"use client";

import { cva, type VariantProps } from "class-variance-authority";
import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center rounded-full px-4 py-2 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
  {
    variants: {
      variant: {
        primary: "bg-[var(--accent)] text-[var(--accent-foreground)] hover:brightness-95",
        secondary: "bg-[var(--panel-2)] text-[var(--foreground)] hover:bg-[var(--panel-3)]",
        ghost:
          "bg-transparent text-[var(--muted-foreground)] hover:bg-[var(--panel-2)] hover:text-[var(--foreground)]",
        danger: "bg-[var(--danger)] text-white hover:brightness-95",
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
