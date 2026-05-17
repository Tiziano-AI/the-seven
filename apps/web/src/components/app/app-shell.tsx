"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAuth } from "./auth-provider";
import { DemoEndConfirmation } from "./demo-end-confirmation";

const NAV_ITEMS = [
  { href: "/", label: "Ask" },
  { href: "/sessions", label: "Archive" },
] as const;

function formatDemoExpiry(expiresAt: number): string {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(expiresAt));
}

export function AppShell(props: Readonly<{ children: React.ReactNode }>) {
  const pathname = usePathname();
  const auth = useAuth();
  const [pendingAction, setPendingAction] = useState<"lock" | "demo" | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [endingDemo, setEndingDemo] = useState(false);

  return (
    <div className="min-h-screen">
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>
      <div className="mx-auto flex min-h-screen w-full max-w-[1320px] flex-col px-5 pb-10 pt-6 md:px-8">
        <header className="mb-7 border-b border-[var(--border)] pb-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="font-display text-3xl leading-none text-[var(--brass)] md:text-4xl">
                The Seven
              </div>
              <div className="mt-2 text-sm text-[var(--text-dim)]">
                Ask · answer · inspect · archive
              </div>
            </div>
            <div className="flex flex-col items-start gap-2 md:items-end">
              <nav className="flex flex-wrap items-center gap-2">
                {NAV_ITEMS.map((item) => {
                  const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={cn("btn-nav", active && "btn-nav-active")}
                    >
                      {item.label}
                    </Link>
                  );
                })}
              </nav>
              <div className="action-rail">
                <Badge
                  role="status"
                  aria-live="polite"
                  className={cn(
                    "seal auth-seal",
                    auth.mode === "byok"
                      ? "seal-active"
                      : auth.mode === "demo"
                        ? "seal-demo"
                        : "seal-locked",
                  )}
                >
                  {auth.mode === "byok"
                    ? "OpenRouter key ready"
                    : auth.mode === "demo"
                      ? auth.demoSession
                        ? `Demo active · expires ${formatDemoExpiry(auth.demoSession.expiresAt)}`
                        : "Demo active"
                      : "Demo or key needed"}
                </Badge>
                {auth.mode === "byok" ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setActionError(null);
                      setPendingAction("lock");
                    }}
                  >
                    Lock key
                  </Button>
                ) : null}
                {auth.mode === "demo" ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setActionError(null);
                      setPendingAction("demo");
                    }}
                  >
                    End demo
                  </Button>
                ) : null}
              </div>
            </div>
          </div>
        </header>
        {pendingAction === "demo" ? (
          <div className="mb-6">
            <DemoEndConfirmation
              pending={endingDemo}
              error={actionError}
              onCancel={() => {
                setActionError(null);
                setPendingAction(null);
              }}
              onConfirm={() => {
                setEndingDemo(true);
                setActionError(null);
                void auth
                  .clearDemoSession()
                  .then(() => {
                    setPendingAction(null);
                  })
                  .catch(() => {
                    setActionError(
                      "Demo session was not ended. Check the connection and retry; it remains active until the server closes it.",
                    );
                  })
                  .finally(() => setEndingDemo(false));
              }}
            />
          </div>
        ) : pendingAction === "lock" ? (
          <div className="mb-6 panel confirm-panel">
            <div>
              <p className="m-0 font-semibold">Lock OpenRouter key?</p>
              <p className="m-0 mt-1 text-sm text-[var(--text-dim)]">
                The encrypted key remains local; this only clears the active unlock.
              </p>
              {actionError ? (
                <p role="alert" className="alert-danger m-0 mt-2 text-sm">
                  {actionError}
                </p>
              ) : null}
            </div>
            <div className="flex gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setActionError(null);
                  setPendingAction(null);
                }}
              >
                Keep open
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setActionError(null);
                  setPendingAction(null);
                  auth.clearByokKey();
                }}
              >
                Lock key
              </Button>
            </div>
          </div>
        ) : null}
        <main id="main-content" tabIndex={-1}>
          {props.children}
        </main>
      </div>
    </div>
  );
}
