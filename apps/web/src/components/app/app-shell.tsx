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
    <div className="min-h-screen text-[var(--foreground)]">
      <div className="mx-auto flex min-h-screen w-full max-w-[1320px] flex-col px-5 pb-10 pt-6 md:px-8">
        <header
          className="mb-6 flex flex-col gap-4 rounded-[32px] border border-[var(--border)] px-6 py-5 shadow-[var(--shadow-lg)] backdrop-blur-[10px] md:flex-row md:items-center md:justify-between"
          style={{ background: "var(--gradient-panel)" }}
        >
          <div>
            <div
              className="text-xs font-semibold uppercase tracking-[0.3em] text-[var(--gold)]"
              style={{ fontFamily: "var(--font-display)" }}
            >
              The Seven
            </div>
            <div
              className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-[var(--gold-bright)]"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Council-grade answers, critique, and verdict.
            </div>
          </div>
          <div className="flex flex-col items-start gap-3 md:items-end">
            <nav className="flex flex-wrap gap-2">
              {NAV_ITEMS.filter((item) => !(auth.mode === "demo" && item.href === "/councils")).map(
                (item) => {
                  const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={cn(
                        "rounded-full border px-4 py-2 text-sm font-semibold tracking-[0.02em] transition-all duration-200",
                        active
                          ? "border-[var(--gold)] bg-[var(--bg-soft)] text-[var(--gold-bright)]"
                          : "border-transparent text-[var(--gold)] hover:border-[var(--gold-soft)] hover:bg-[var(--bg-soft)]",
                      )}
                      style={{ fontFamily: "var(--font-display)" }}
                    >
                      {item.label}
                    </Link>
                  );
                },
              )}
            </nav>
            <div className="flex items-center gap-3">
              <Badge
                className={cn(
                  auth.mode === "byok"
                    ? "bg-[var(--gold)] text-[var(--bg)]"
                    : auth.mode === "demo"
                      ? "bg-[var(--evergreen)] text-[var(--bg)]"
                      : "bg-[var(--bg-soft)] text-[var(--text-muted)]",
                )}
              >
                {auth.mode === "byok" ? "BYOK" : auth.mode === "demo" ? "DEMO" : "LOCKED"}
              </Badge>
              {auth.mode === "byok" ? (
                <Button
                  variant="ghost"
                  onClick={() => {
                    if (window.confirm("Lock session and clear your key?")) auth.clearByokKey();
                  }}
                >
                  Lock
                </Button>
              ) : null}
              {auth.mode === "demo" ? (
                <Button
                  variant="ghost"
                  onClick={() => {
                    if (window.confirm("End demo session?")) auth.clearDemoSession();
                  }}
                >
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
