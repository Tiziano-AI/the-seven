import type { Route } from "@playwright/test";
import { type RouteContractId, routeContract } from "@the-seven/contracts";
import {
  demoCookieName,
  fulfillDemoNotAllowed,
  fulfillSameOriginRequired,
  fulfillUnauthorized,
  jsonHeaders,
  proofByokKey,
  proofDemoSessionToken,
  successEnvelope,
} from "./browser-flow-http-core";
import { parseRouteBody, parseRouteIngress, parseRouteQuery } from "./browser-flow-http-parser";

export type FixtureAuthority = "byok" | "demo";
export type FixtureAuthState =
  | Readonly<{ kind: "byok" }>
  | Readonly<{ kind: "demo" }>
  | Readonly<{ kind: "missing" }>
  | Readonly<{ kind: "invalid"; reason: "invalid_token" }>;

function readDemoCookieValue(request: ReturnType<Route["request"]>): string | null {
  const cookie = request.headers().cookie ?? "";
  const prefix = `${demoCookieName}=`;
  const match = cookie
    .split(";")
    .map((item) => item.trim())
    .find((item) => item.startsWith(prefix));
  return match ? match.slice(prefix.length).trim() : null;
}

function parseBearerToken(value: string | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) {
    return null;
  }
  const match = /^Bearer\s+(.+)$/iu.exec(trimmed);
  return match?.[1]?.trim() ?? "";
}

export function requestAuthority(
  request: ReturnType<Route["request"]>,
  policy: "any" | "demo-cookie",
): FixtureAuthState {
  if (policy !== "demo-cookie") {
    const authorization = request.headers().authorization;
    const trimmedAuthorization = authorization?.trim();
    if (trimmedAuthorization) {
      const token = parseBearerToken(trimmedAuthorization);
      if (!token) {
        return { kind: "invalid", reason: "invalid_token" };
      }
      return token === proofByokKey
        ? { kind: "byok" }
        : { kind: "invalid", reason: "invalid_token" };
    }
  }

  const demoToken = readDemoCookieValue(request);
  if (!demoToken) {
    return { kind: "missing" };
  }
  return demoToken === proofDemoSessionToken
    ? { kind: "demo" }
    : { kind: "invalid", reason: "invalid_token" };
}

function nodeEnv(): "development" | "production" | "test" {
  if (process.env.NODE_ENV === "production") {
    return "production";
  }
  if (process.env.NODE_ENV === "test") {
    return "test";
  }
  return "development";
}

function sameOriginAdmissionKey(value: string, env: "development" | "production" | "test"): string {
  const parsed = new URL(value);
  const hostname = parsed.hostname.replace(/^\[/u, "").replace(/\]$/u, "");
  if (
    env !== "production" &&
    parsed.protocol === "http:" &&
    (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1")
  ) {
    return `http://loopback:${parsed.port || "80"}`;
  }
  return parsed.origin;
}

function parseOriginKey(value: string, env: "development" | "production" | "test"): string | null {
  try {
    return sameOriginAdmissionKey(new URL(value).origin, env);
  } catch {
    return null;
  }
}

function requestHasSameOriginEvidence(request: ReturnType<Route["request"]>) {
  const headers = request.headers();
  const fetchSite = headers["sec-fetch-site"]?.trim().toLowerCase();
  if (fetchSite && fetchSite !== "same-origin") {
    return false;
  }
  const env = nodeEnv();
  const requestOrigin = parseOriginKey(request.url(), env);
  const configuredOrigin = parseOriginKey(
    process.env.SEVEN_PUBLIC_ORIGIN?.trim() || new URL(request.url()).origin,
    env,
  );
  if (!requestOrigin || !configuredOrigin) {
    return false;
  }
  const allowed = new Set(
    env === "production" ? [configuredOrigin] : [configuredOrigin, requestOrigin],
  );
  const explicitOrigins = new Set<string>();
  if (headers.origin) {
    const origin = parseOriginKey(headers.origin, env);
    if (!origin) {
      return false;
    }
    explicitOrigins.add(origin);
  }
  if (headers.referer) {
    const referer = parseOriginKey(headers.referer, env);
    if (!referer) {
      return false;
    }
    explicitOrigins.add(referer);
  }
  if (explicitOrigins.size > 1) {
    return false;
  }
  const [explicitOrigin] = explicitOrigins;
  if (explicitOrigin) {
    return allowed.has(explicitOrigin);
  }
  return fetchSite === "same-origin";
}

async function requireByokAuthority(
  route: Route,
  routeId: RouteContractId,
  authority: FixtureAuthState,
): Promise<boolean> {
  if (authority.kind === "byok") {
    return true;
  }
  if (authority.kind === "demo") {
    await fulfillDemoNotAllowed(route, routeId);
    return false;
  }
  await fulfillUnauthorized(
    route,
    routeId,
    authority.kind === "invalid" ? authority.reason : "missing_auth",
  );
  return false;
}

async function requireAnyAuthority(
  route: Route,
  routeId: RouteContractId,
  authority: FixtureAuthState,
): Promise<FixtureAuthority | null> {
  if (authority.kind === "byok") {
    return "byok";
  }
  if (authority.kind !== "demo") {
    await fulfillUnauthorized(
      route,
      routeId,
      authority.kind === "invalid" ? authority.reason : "missing_auth",
    );
    return null;
  }
  return "demo";
}

async function requireDemoCookieAuthority(
  route: Route,
  routeId: RouteContractId,
): Promise<boolean> {
  const authority = requestAuthority(route.request(), "demo-cookie");
  if (authority.kind !== "demo") {
    await fulfillUnauthorized(
      route,
      routeId,
      authority.kind === "invalid" ? authority.reason : "missing_auth",
    );
    return false;
  }
  return true;
}

/** Enforces adapter-owned same-origin admission before mocked demo-cookie mutations parse input. */
export async function requireDemoCookieMutationSameOrigin(
  route: Route,
  routeId: RouteContractId,
): Promise<boolean> {
  if (!requestHasSameOriginEvidence(route.request())) {
    await fulfillSameOriginRequired(route, routeId);
    return false;
  }
  return true;
}

/** Enforces adapter-owned same-origin admission for already-resolved demo authority. */
export async function requireResolvedDemoMutationSameOrigin(
  route: Route,
  routeId: RouteContractId,
  authority: FixtureAuthState,
): Promise<boolean> {
  if (authority.kind !== "demo" || route.request().method() === "GET") {
    return true;
  }
  return await requireDemoCookieMutationSameOrigin(route, routeId);
}

/** Admits a previously resolved BYOK authority after mocked route input has parsed. */
export async function admitResolvedByok(
  route: Route,
  routeId: RouteContractId,
  authority: FixtureAuthState,
): Promise<boolean> {
  return await requireByokAuthority(route, routeId, authority);
}

/** Admits previously resolved BYOK or demo-cookie authority after mocked route input has parsed. */
export async function admitResolvedAnyAuthority(
  route: Route,
  routeId: RouteContractId,
  authority: FixtureAuthState,
): Promise<FixtureAuthority | null> {
  return await requireAnyAuthority(route, routeId, authority);
}

/** Admits only demo-cookie read authority before fixtures return demo session state. */
export async function admitDemoCookieRead(
  route: Route,
  routeId: RouteContractId,
): Promise<boolean> {
  return await requireDemoCookieAuthority(route, routeId);
}

/** Sends a canonical demo-logout success that clears the browser cookie. */
export async function fulfillDemoLogoutSuccess(route: Route): Promise<boolean> {
  if (!(await parseRouteIngress(route, "demo.logout"))) {
    return false;
  }
  if (!(await requireDemoCookieMutationSameOrigin(route, "demo.logout"))) {
    return false;
  }
  if ((await parseRouteQuery(route, "demo.logout")) === null) {
    return false;
  }
  if ((await parseRouteBody(route, "demo.logout")) === null) {
    return false;
  }
  if (!(await admitDemoCookieRead(route, "demo.logout"))) {
    return false;
  }
  const contract = routeContract("demo.logout");
  const envelope = successEnvelope("demo.logout", { success: true });
  await route.fulfill({
    status: contract.status,
    contentType: "application/json",
    headers: {
      ...jsonHeaders(envelope.trace_id),
      "set-cookie": `${demoCookieName}=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax`,
    },
    body: JSON.stringify(envelope),
  });
  return true;
}
