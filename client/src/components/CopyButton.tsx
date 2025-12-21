import { useEffect, useRef, useState } from "react";
import { Check, Copy } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

type CopyButtonProps = Readonly<{
  value: string;
  label?: string;
  tooltip?: string;
  variant?: "ghost" | "outline" | "secondary" | "primary" | "tertiary";
  size?: "icon" | "icon-sm" | "icon-lg";
  className?: string;
  disabled?: boolean;
}>;

/**
 * CopyButton copies the provided value to the clipboard with toast feedback.
 */
export function CopyButton({
  value,
  label = "Copy",
  tooltip = "Copy",
  variant = "ghost",
  size = "icon-sm",
  className,
  disabled = false,
}: CopyButtonProps) {
  const [copied, setCopied] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!copied) return;
    timeoutRef.current = setTimeout(() => {
      setCopied(false);
    }, 1500);
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, [copied]);

  const handleCopy = async () => {
    if (disabled) return;
    const trimmed = value.trim();
    if (!trimmed) {
      toast.error("Nothing to copy");
      return;
    }
    if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) {
      toast.error("Clipboard unavailable");
      return;
    }

    try {
      await navigator.clipboard.writeText(trimmed);
      setCopied(true);
      toast.success("Copied");
    } catch (error: unknown) {
      toast.error("Copy failed");
    }
  };

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant={variant}
          size={size}
          aria-label={label}
          onClick={() => {
            void handleCopy();
          }}
          className={cn("shrink-0", className)}
          disabled={disabled}
        >
          {copied ? <Check className="icon-sm" /> : <Copy className="icon-sm" />}
        </Button>
      </TooltipTrigger>
      <TooltipContent sideOffset={6}>
        {copied ? "Copied" : tooltip}
      </TooltipContent>
    </Tooltip>
  );
}
