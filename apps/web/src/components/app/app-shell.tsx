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
    <div className="min-h-screen">
      <div className="mx-auto flex min-h-screen w-full max-w-[1320px] flex-col px-5 pb-10 pt-6 md:px-8">
        <header className="mb-6 border-b border-[var(--border)]/70 pb-5">
          <div className="flex flex-wrap items-center justify-between gap-6">
            <div>
              <div className="font-display text-5xl font-bold leading-tight text-[var(--gold)] md:text-6xl">
                The Seven
              </div>
              <div className="font-display mt-2 text-base text-[var(--muted-foreground)] md:text-lg">
                A council of seven voices — answers, critique, verdict
              </div>
            </div>
            <div className="flex flex-col items-start gap-3 md:items-end">
              <nav className="flex flex-wrap items-center gap-2">
                {NAV_ITEMS.filter(
                  (item) => !(auth.mode === "demo" && item.href === "/councils"),
                ).map((item) => {
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
                  className={cn(
                    auth.mode === "byok"
                      ? "badge-accent"
                      : auth.mode === "demo"
                        ? "badge-secondary"
                        : "badge-muted",
                  )}
                >
                  {auth.mode === "byok" ? "BYOK" : auth.mode === "demo" ? "DEMO" : "LOCKED"}
                </Badge>
                {auth.mode === "byok" ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      if (window.confirm("Lock session and clear your key?")) auth.clearByokKey();
                    }}
                  >
                    Lock
                  </Button>
                ) : null}
                {auth.mode === "demo" ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      if (window.confirm("End demo session?")) auth.clearDemoSession();
                    }}
                  >
                    End Demo
                  </Button>
                ) : null}
              </div>
            </div>
          </div>
        </header>
        {props.children}
      </div>
    </div>
  );
}
