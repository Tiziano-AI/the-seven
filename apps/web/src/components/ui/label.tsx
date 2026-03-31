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
        "text-xs font-semibold uppercase tracking-[0.18em] text-[var(--gold)]",
        className,
      )}
      style={{ fontFamily: "var(--font-display)" }}
    >
      {children}
    </label>
  );
}
