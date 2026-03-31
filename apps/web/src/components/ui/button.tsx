"use client";

import { cva, type VariantProps } from "class-variance-authority";
import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

const buttonVariants = cva("btn", {
  variants: {
    variant: {
      primary: "btn-primary",
      secondary: "btn-secondary",
      ghost: "btn-ghost",
      outline: "btn-outline",
      danger: "btn-danger",
    },
    size: {
      default: "btn-size-default",
      sm: "btn-size-sm",
      lg: "btn-size-lg",
    },
  },
  defaultVariants: {
    variant: "primary",
    size: "default",
  },
});

export function Button(
  props: ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof buttonVariants>,
) {
  const { className, variant, size, ...rest } = props;
  return (
    <button className={cn(buttonVariants({ variant, size }), className)} type="button" {...rest} />
  );
}
