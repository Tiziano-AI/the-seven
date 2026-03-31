import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function Badge(props: HTMLAttributes<HTMLSpanElement>) {
  return <span {...props} className={cn("badge badge-muted", props.className)} />;
}
