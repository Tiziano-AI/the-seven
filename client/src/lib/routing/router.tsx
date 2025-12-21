import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

export type NavigateOptions = Readonly<{
  replace?: boolean;
  state?: unknown;
}>;

type RouterContextValue = Readonly<{
  pathname: string;
  navigate: (to: string, options?: NavigateOptions) => void;
}>;

const RouterContext = createContext<RouterContextValue | null>(null);

type LocationListener = () => void;

const locationListeners = new Set<LocationListener>();

function notifyLocationListeners() {
  for (const listener of locationListeners) listener();
}

function ensureHistoryPatched() {
  if (typeof window === "undefined") return;

  const patchKey = Symbol.for("the_seven_history_patch_v1");
  if (patchKey in window) return;

  window.addEventListener("popstate", notifyLocationListeners);
  window.addEventListener("hashchange", notifyLocationListeners);

  for (const method of ["pushState", "replaceState"] as const) {
    const original = history[method];
    history[method] = function (...args) {
      const result = original.apply(this, args);
      notifyLocationListeners();
      return result;
    };
  }

  Object.defineProperty(window, patchKey, { value: true });
}

function readPathname() {
  if (typeof window === "undefined") return "/";
  return window.location.pathname;
}

function normalizeInternalPath(to: string) {
  if (!to) return "/";
  if (to.startsWith("/")) return to;
  return `/${to}`;
}

export function RouterProvider(props: { children: React.ReactNode }) {
  ensureHistoryPatched();

  const [pathname, setPathname] = useState(() => readPathname());

  useEffect(() => {
    const sync = () => {
      setPathname(readPathname());
    };

    locationListeners.add(sync);
    sync();

    return () => {
      locationListeners.delete(sync);
    };
  }, []);

  const navigate = useCallback((to: string, options: NavigateOptions = {}) => {
    const replace = options.replace ?? false;
    const state = options.state ?? null;
    const url = normalizeInternalPath(to);

    history[replace ? "replaceState" : "pushState"](state, "", url);
    setPathname(readPathname());
    notifyLocationListeners();
  }, []);

  const value = useMemo<RouterContextValue>(() => ({ pathname, navigate }), [navigate, pathname]);

  return <RouterContext.Provider value={value}>{props.children}</RouterContext.Provider>;
}

export function usePathname() {
  const ctx = useContext(RouterContext);
  if (!ctx) throw new Error("usePathname must be used within <RouterProvider>");
  return ctx.pathname;
}

export function useNavigate() {
  const ctx = useContext(RouterContext);
  if (!ctx) throw new Error("useNavigate must be used within <RouterProvider>");
  return ctx.navigate;
}
