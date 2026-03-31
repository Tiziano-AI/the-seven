import type { LabelHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type FormLabelProps = Omit<LabelHTMLAttributes<HTMLLabelElement>, "htmlFor"> &
  Readonly<{ htmlFor: string }>;

export function Label(props: FormLabelProps) {
  const { children, className, htmlFor, ...rest } = props;
  return (
    <label
      {...rest}
      htmlFor={htmlFor}
      className={cn(
        "font-display text-xs font-semibold uppercase tracking-[0.18em] text-[var(--gold)]",
        className,
      )}
    >
      {children}
    </label>
  );
}
