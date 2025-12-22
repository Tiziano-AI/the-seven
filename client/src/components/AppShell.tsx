import type { ReactNode } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate, usePathname } from "@/lib/routing/router";
import { parseRoute } from "@/lib/routing/routes";
import { cn } from "@/lib/utils";

export type AppShellLayout = "centered" | "page";

export type AppShellProps = Readonly<{
  children: ReactNode;
  layout?: AppShellLayout;
  showNav?: boolean;
  onLock?: () => void;
}>;

function resolveActiveNav(pathname: string): "ask" | "journal" | "council" | null {
  const route = parseRoute(pathname);
  if (route.kind === "home") return "ask";
  if (route.kind === "journal" || route.kind === "session_detail") return "journal";
  if (route.kind === "council") return "council";
  return null;
}

/**
 * AppShell provides the global layout chrome (header + navigation + main surface).
 */
export function AppShell({ children, layout = "page", showNav, onLock }: AppShellProps) {
  const { isAuthenticated, mode, clearByokKey, clearDemoSession } = useAuth();
  const navigate = useNavigate();
  const pathname = usePathname();

  const navEnabled = showNav ?? isAuthenticated;
  const active = resolveActiveNav(pathname);
  const keyStatusLabel =
    mode === "byok" ? "Key unlocked" : mode === "demo" ? "Demo active" : "Key locked";

  const handleLock = () => {
    if (onLock) {
      onLock();
      return;
    }
    if (mode === "demo") {
      clearDemoSession();
    } else {
      clearByokKey();
    }
    toast.message("Locked");
    navigate("/");
  };

  return (
    <div className="min-h-screen bg-gradient-field">
      <header className="border-b border-border/70">
        <div className="container py-4">
          <div className="flex flex-wrap items-center justify-between gap-6">
            <button
              type="button"
              onClick={() => navigate("/")}
              className="text-left"
              aria-label="Go to home"
            >
              <div className="text-5xl md:text-6xl font-bold text-gold leading-tight font-display">
                The Seven
              </div>
              <div className="text-base md:text-lg text-muted-foreground mt-2 font-ui">
                A council of seven voices - answers, critique, verdict
              </div>
            </button>

            {navEnabled && (
              <nav className="flex flex-wrap items-center gap-2">
                <Button
                  variant="ghost"
                  onClick={() => navigate("/")}
                  size="sm"
                  className={cn("btn-nav", active === "ask" ? "btn-nav-active" : undefined)}
                >
                  Ask
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => navigate("/journal")}
                  size="sm"
                  className={cn("btn-nav", active === "journal" ? "btn-nav-active" : undefined)}
                >
                  Journal
                </Button>
                {mode !== "demo" && (
                  <Button
                    variant="ghost"
                    onClick={() => navigate("/council")}
                    size="sm"
                    className={cn("btn-nav", active === "council" ? "btn-nav-active" : undefined)}
                  >
                    Council
                  </Button>
                )}
              </nav>
            )}

            <div className="action-rail">
              <span className={cn("badge", isAuthenticated ? "badge-secondary" : "badge-muted")}>
                {keyStatusLabel}
              </span>
              {isAuthenticated && (
                <Button variant="outline" size="sm" onClick={handleLock}>
                  Lock
                </Button>
              )}
            </div>
          </div>
        </div>
      </header>

      <main
        className={
          layout === "centered"
            ? "container section-py flex items-center justify-center"
            : "container section-py"
        }
      >
        {children}
      </main>
    </div>
  );
}
