import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Suspense, lazy } from "react";
import ErrorBoundary from "./components/ErrorBoundary";
import { RouterProvider, usePathname } from "@/lib/routing/router";
import { parseRoute } from "@/lib/routing/routes";

const Home = lazy(async () => import("./pages/home/HomePage"));
const Council = lazy(async () => import("./pages/council/CouncilPage"));
const Journal = lazy(async () => import("./pages/JournalPage"));
const SessionDetail = lazy(async () => import("./pages/sessionDetail/SessionDetailPage"));
const NotFound = lazy(async () => import("./pages/NotFound"));

function RouteLoadingFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-field">
      <div className="text-sm text-muted-foreground">Loading…</div>
    </div>
  );
}

function AppRoutes() {
  const pathname = usePathname();
  const route = parseRoute(pathname);

  return (
    <Suspense fallback={<RouteLoadingFallback />}>
      {route.kind === "home" && <Home />}
      {route.kind === "council" && <Council />}
      {route.kind === "journal" && <Journal />}
      {route.kind === "session_detail" && (
        <SessionDetail sessionIdParam={route.sessionIdParam} />
      )}
      {route.kind === "not_found" && <NotFound />}
    </Suspense>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <TooltipProvider>
        <Toaster />
        <RouterProvider>
          <AppRoutes />
        </RouterProvider>
      </TooltipProvider>
    </ErrorBoundary>
  );
}

export default App;
