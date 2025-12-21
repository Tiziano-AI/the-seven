export type AppRoute =
  | Readonly<{ kind: "home" }>
  | Readonly<{ kind: "council" }>
  | Readonly<{ kind: "journal" }>
  | Readonly<{ kind: "session_detail"; sessionIdParam: string }>
  | Readonly<{ kind: "not_found" }>;

const SESSION_PREFIX = "/session/";

export function parseRoute(pathname: string): AppRoute {
  if (pathname === "/") return { kind: "home" };
  if (pathname === "/council") return { kind: "council" };
  if (pathname === "/journal") return { kind: "journal" };
  if (pathname === "/404") return { kind: "not_found" };

  if (pathname.startsWith(SESSION_PREFIX)) {
    const rest = pathname.slice(SESSION_PREFIX.length);
    if (!rest) return { kind: "not_found" };
    if (rest.includes("/")) return { kind: "not_found" };
    return { kind: "session_detail", sessionIdParam: decodeURIComponent(rest) };
  }

  return { kind: "not_found" };
}
