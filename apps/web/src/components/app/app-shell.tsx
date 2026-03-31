"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAuth } from "./auth-provider";

const NAV_ITEMS = [
  { href: "/", label: "Ask" },
  { href: "/councils", label: "Councils" },
  { href: "/sessions", label: "Sessions" },
] as const;

export function AppShell(props: Readonly<{ children: React.ReactNode }>) {
  const pathname = usePathname();
  const auth = useAuth();

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <div className="mx-auto flex min-h-screen w-full max-w-[1320px] flex-col px-5 pb-10 pt-6 md:px-8">
        <header className="mb-6 flex flex-col gap-4 rounded-[32px] border border-[var(--border)] bg-[var(--panel)] px-6 py-5 shadow-[0_20px_50px_rgba(17,24,39,0.08)] md:flex-row md:items-center md:justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.3em] text-[var(--muted-foreground)]">
              The Seven
            </div>
            <div className="mt-2 text-2xl font-semibold tracking-[-0.04em]">
              Council-grade answers, critique, and verdict.
            </div>
          </div>
          <div className="flex flex-col items-start gap-3 md:items-end">
            <nav className="flex flex-wrap gap-2">
              {NAV_ITEMS.filter((item) => !(auth.mode === "demo" && item.href === "/councils")).map(
                (item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "rounded-full px-4 py-2 text-sm font-medium transition",
                      pathname === item.href || pathname.startsWith(`${item.href}/`)
                        ? "bg-[var(--accent)] text-[var(--accent-foreground)]"
                        : "bg-[var(--panel-2)] text-[var(--muted-foreground)] hover:bg-[var(--panel-3)] hover:text-[var(--foreground)]",
                    )}
                  >
                    {item.label}
                  </Link>
                ),
              )}
            </nav>
            <div className="flex items-center gap-3">
              <Badge>
                {auth.mode === "byok" ? "BYOK" : auth.mode === "demo" ? "DEMO" : "LOCKED"}
              </Badge>
              {auth.mode === "byok" ? (
                <Button variant="secondary" onClick={auth.clearByokKey}>
                  Lock
                </Button>
              ) : null}
              {auth.mode === "demo" ? (
                <Button variant="secondary" onClick={auth.clearDemoSession}>
                  End Demo
                </Button>
              ) : null}
            </div>
          </div>
        </header>
        {props.children}
      </div>
    </div>
  );
}
