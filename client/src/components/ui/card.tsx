import * as React from "react";
import { Slot } from "@radix-ui/react-slot";

import { cn } from "@/lib/utils";

type CardProps = React.ComponentProps<"div"> & { asChild?: boolean };

/**
 * Card is the primary surface container for page sections.
 * It provides the base surface styling and should wrap all major UI sections.
 */
function Card({ className, asChild, ...props }: CardProps) {
  const Comp = asChild ? Slot : "div";
  return (
    <Comp
      data-slot="card"
      className={cn("card flex flex-col", className)}
      {...props}
    />
  );
}

/**
 * CardHeader renders the surface header region (title + description + actions).
 */
function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-header"
      className={cn(
        "flex flex-col gap-3 px-6 pt-6 pb-4 border-b border-border/60",
        className
      )}
      {...props}
    />
  );
}

/**
 * CardTitle renders the surface title with display typography.
 */
function CardTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-title"
      className={cn("surface-title text-3xl leading-tight font-semibold", className)}
      {...props}
    />
  );
}

/**
 * CardDescription renders supporting copy under the surface title.
 */
function CardDescription({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-description"
      className={cn("text-muted-foreground text-base", className)}
      {...props}
    />
  );
}

/**
 * CardAction renders a right-aligned action rail inside CardHeader.
 */
function CardAction({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-action"
      className={cn("action-rail", className)}
      {...props}
    />
  );
}

/**
 * CardContent renders the body region of a surface.
 */
function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-content"
      className={cn("px-6 py-5", className)}
      {...props}
    />
  );
}

/**
 * CardFooter renders trailing actions for a surface.
 */
function CardFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-footer"
      className={cn("flex items-center px-6 pb-6", className)}
      {...props}
    />
  );
}

export {
  Card,
  CardHeader,
  CardFooter,
  CardTitle,
  CardAction,
  CardDescription,
  CardContent,
};
