import http from "node:http";
import { BUILT_IN_COUNCILS, type LiveProofRuntime, type ServerRuntime } from "@the-seven/config";
import { buildRoutePath, routeContract } from "@the-seven/contracts";
import { deleteRateLimitBucketsForScopes } from "@the-seven/db";
import { requestDemoLink } from "../apps/web/src/lib/api";
import { demoApiRequest } from "./live-demo-api";
import { resolveProofOrigin } from "./live-demo-origin";
import { assertLiveSessionProof, assertNoPendingBillingLookups } from "./live-session-proof";
import { runCommandOrThrow, sleep } from "./process-utils";
import { assertResendInboundAccess, waitForReceivedDemoEmail } from "./resend-live-proof";

const sessionTerminalStates = new Set(["completed", "failed"]);
const demoSessionCookieName = "seven_demo_session";
const demoConsumeRoute = routeContract("demo.consume");
const LIVE_BILLING_TIMEOUT_MS = 150_000;

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function demoProofRateLimitScopes(email: string) {
  const normalized = email.trim().toLowerCase();
  return [
    `demo:email_request:email:${normalized}`,
    "demo:email_request:global",
    "demo:email_request:ip:127.0.0.1",
    "demo:email_request:ip:::1",
    `demo:run:email:${normalized}`,
    "demo:run:global",
    "demo:run:ip:127.0.0.1",
    "demo:run:ip:::1",
    "demo:consume:global",
    "demo:consume:ip:127.0.0.1",
    "demo:consume:ip:::1",
  ];
}

async function clearProofRateLimits(email: string) {
  const deleted = await deleteRateLimitBucketsForScopes(demoProofRateLimitScopes(email));
  if (deleted > 0) {
    console.log(`  cleared ${deleted} proof-owned demo rate-limit bucket(s)`);
  }
}

export function extractDemoConsumeUrlFromEmail(input: { text: string }): string {
  const escapedPath = demoConsumeRoute.path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const linkMatch = input.text.match(
    new RegExp(`https?:\\/\\/[^\\s"'<>]+${escapedPath}\\?token=[A-Za-z0-9_-]+`),
  );
  if (!linkMatch) {
    throw new Error("Could not extract an absolute demo consume link from the received email.");
  }
  return linkMatch[0];
}

export function assertDemoConsumeUrlOrigin(input: { consumeUrl: string; publicOrigin: string }) {
  const consume = new URL(input.consumeUrl);
  const expected = new URL(input.publicOrigin);
  if (consume.origin !== expected.origin) {
    throw new Error(
      `Demo email consume link origin mismatch: ${consume.origin} vs ${expected.origin}`,
    );
  }
}

export function assertDemoConsumeRedirect(input: { response: Response; publicOrigin: string }) {
  if (input.response.status !== 303) {
    throw new Error(`Demo consume redirect mismatch: status ${input.response.status}`);
  }
  const location = input.response.headers.get("location");
  if (!location) {
    throw new Error("Demo consume redirect mismatch: missing location header");
  }
  let parsed: URL;
  try {
    parsed = new URL(location);
  } catch {
    throw new Error(`Demo consume redirect mismatch: non-absolute location ${location}`);
  }
  const expected = new URL(input.publicOrigin);
  if (parsed.origin !== expected.origin || parsed.pathname !== "/") {
    throw new Error(`Demo consume redirect mismatch: ${location}`);
  }
}

export function buildDemoConsumeTransport(input: {
  baseUrl: string;
  consumeUrl: string;
  publicOrigin: string;
}) {
  assertDemoConsumeUrlOrigin({
    consumeUrl: input.consumeUrl,
    publicOrigin: input.publicOrigin,
  });
  const consume = new URL(input.consumeUrl);
  const consumePath = buildRoutePath(demoConsumeRoute);
  if (consume.pathname !== consumePath) {
    throw new Error(`Demo consume link path mismatch: ${consume.pathname}`);
  }
  const targetUrl = new URL(consumePath + consume.search, input.baseUrl);
  return {
    targetUrl,
    hostHeader: new URL(input.publicOrigin).host,
  };
}

type DemoConsumeResponse = Readonly<{
  status: number;
  location: string | null;
  setCookies: readonly string[];
  body: string;
}>;

function assertDemoConsumeResponseRedirect(input: {
  response: DemoConsumeResponse;
  publicOrigin: string;
}) {
  if (input.response.status !== 303) {
    throw new Error(`Demo consume redirect mismatch: status ${input.response.status}`);
  }
  const location = input.response.location;
  if (!location) {
    throw new Error("Demo consume redirect mismatch: missing location header");
  }
  let parsed: URL;
  try {
    parsed = new URL(location);
  } catch {
    throw new Error(`Demo consume redirect mismatch: non-absolute location ${location}`);
  }
  const expected = new URL(input.publicOrigin);
  if (parsed.origin !== expected.origin || parsed.pathname !== "/") {
    throw new Error(`Demo consume redirect mismatch: ${location}`);
  }
}

function readDemoCookie(response: DemoConsumeResponse) {
  const cookie = response.setCookies.find((value) => value.startsWith(`${demoSessionCookieName}=`));
  const pair = cookie?.split(";", 1)[0];
  const cookieValue = pair?.slice(demoSessionCookieName.length + 1);
  if (!cookie || !pair || !cookieValue) {
    throw new Error("Demo consume response did not set the HttpOnly demo session cookie.");
  }
  return {
    cookieHeader: pair,
    cookieValue,
  };
}

export async function requestDemoConsume(input: {
  targetUrl: URL;
  hostHeader: string;
}): Promise<DemoConsumeResponse> {
  const headers = {
    Host: input.hostHeader,
  };

  if (input.targetUrl.protocol === "https:") {
    if (input.targetUrl.host !== input.hostHeader) {
      throw new Error(
        "HTTPS demo consume proof cannot override Host; use loopback HTTP transport.",
      );
    }
    const response = await fetch(input.targetUrl, {
      method: "GET",
      headers,
      redirect: "manual",
    });
    return {
      status: response.status,
      location: response.headers.get("location"),
      setCookies:
        (response.headers as Headers & { getSetCookie?: () => string[] }).getSetCookie?.() ?? [],
      body: await response.text(),
    };
  }

  if (input.targetUrl.protocol !== "http:") {
    throw new Error(`Unsupported demo consume transport protocol ${input.targetUrl.protocol}`);
  }

  return new Promise<DemoConsumeResponse>((resolve, reject) => {
    const request = http.request(
      input.targetUrl,
      {
        method: "GET",
        headers,
      },
      (response) => {
        response.setEncoding("utf8");
        let body = "";
        response.on("data", (chunk: string) => {
          body += chunk;
        });
        response.on("end", () => {
          const setCookie = response.headers["set-cookie"];
          resolve({
            status: response.statusCode ?? 0,
            location:
              typeof response.headers.location === "string" ? response.headers.location : null,
            setCookies: Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : [],
            body,
          });
        });
      },
    );
    request.on("error", reject);
    request.end();
  });
}

async function consumeDemoLink(input: {
  baseUrl: string;
  publicOrigin: string;
  email: string;
  receivedEmail: { html?: string | null; text?: string | null };
}) {
  const consumeUrl = extractDemoConsumeUrlFromEmail({
    text: `${input.receivedEmail.html ?? ""}\n${input.receivedEmail.text ?? ""}`,
  });
  const transport = buildDemoConsumeTransport({
    baseUrl: input.baseUrl,
    consumeUrl,
    publicOrigin: input.publicOrigin,
  });
  const response = await requestDemoConsume(transport);
  if (response.status !== 303) {
    throw new Error(`Demo consume failed (${response.status}): ${response.body}`);
  }
  assertDemoConsumeResponseRedirect({ response, publicOrigin: input.publicOrigin });

  const cookie = readDemoCookie(response);
  const session = await demoApiRequest({
    baseUrl: input.baseUrl,
    publicOrigin: input.publicOrigin,
    cookieHeader: cookie.cookieHeader,
    route: routeContract("demo.session"),
  });

  assert(session.email === input.email.trim().toLowerCase(), "Demo session email mismatch.");
  return {
    ...cookie,
    email: session.email,
    expiresAt: session.expiresAt,
  };
}

async function createDemoSessionRun(input: {
  baseUrl: string;
  publicOrigin: string;
  cookieHeader: string;
  query: string;
  councilRef: { kind: "built_in"; slug: "commons" };
}) {
  return demoApiRequest({
    baseUrl: input.baseUrl,
    publicOrigin: input.publicOrigin,
    cookieHeader: input.cookieHeader,
    route: routeContract("sessions.create"),
    body: {
      query: input.query,
      councilRef: input.councilRef,
    },
  });
}

async function fetchDemoSession(input: {
  baseUrl: string;
  publicOrigin: string;
  cookieHeader: string;
  sessionId: number;
}) {
  return demoApiRequest({
    baseUrl: input.baseUrl,
    publicOrigin: input.publicOrigin,
    cookieHeader: input.cookieHeader,
    route: routeContract("sessions.get"),
    params: { sessionId: input.sessionId },
  });
}

async function fetchDemoSessionDiagnostics(input: {
  baseUrl: string;
  publicOrigin: string;
  cookieHeader: string;
  sessionId: number;
}) {
  return demoApiRequest({
    baseUrl: input.baseUrl,
    publicOrigin: input.publicOrigin,
    cookieHeader: input.cookieHeader,
    route: routeContract("sessions.diagnostics"),
    params: { sessionId: input.sessionId },
  });
}

async function waitForDemoBillingDiagnostics(input: {
  baseUrl: string;
  publicOrigin: string;
  cookieHeader: string;
  sessionId: number;
  label: string;
}) {
  const deadline = Date.now() + LIVE_BILLING_TIMEOUT_MS;
  let diagnostics = await fetchDemoSessionDiagnostics(input);
  while (diagnostics.providerCalls.some((call) => call.billingLookupStatus === "pending")) {
    if (Date.now() >= deadline) {
      assertNoPendingBillingLookups({
        providerCalls: diagnostics.providerCalls,
        label: input.label,
      });
    }
    await sleep(5_000);
    diagnostics = await fetchDemoSessionDiagnostics(input);
  }
  return diagnostics;
}

async function waitForTerminalDemoSession(input: {
  baseUrl: string;
  publicOrigin: string;
  cookieHeader: string;
  sessionId: number;
  label: string;
}) {
  const deadline = Date.now() + 600_000;
  while (Date.now() < deadline) {
    const detail = await fetchDemoSession(input);
    if (sessionTerminalStates.has(detail.session.status)) {
      console.log(`${input.label}: ${detail.session.status}`);
      return detail;
    }
    await sleep(2_000);
  }

  throw new Error(`${input.label} did not reach a terminal state in time.`);
}
async function runPlaywrightSmoke(input: {
  demoCookie: string;
  demoEmail: string;
  demoExpiresAt: number;
  sessionId: number;
  sessionQuery: string;
}) {
  await runCommandOrThrow("pnpm", ["exec", "playwright", "test", "apps/web/e2e/smoke.spec.ts"], {
    env: {
      ...process.env,
      SEVEN_PLAYWRIGHT_EXTERNAL_SERVER: "1",
      SEVEN_PLAYWRIGHT_DEMO_COOKIE: input.demoCookie,
      SEVEN_PLAYWRIGHT_DEMO_EMAIL: input.demoEmail,
      SEVEN_PLAYWRIGHT_DEMO_EXPIRES_AT: String(input.demoExpiresAt),
      SEVEN_PLAYWRIGHT_SESSION_ID: String(input.sessionId),
      SEVEN_PLAYWRIGHT_SESSION_QUERY: input.sessionQuery,
    },
  });
}

function assertSessionArtifacts(
  detail: Awaited<ReturnType<typeof fetchDemoSession>>,
  diagnostics: Awaited<ReturnType<typeof fetchDemoSessionDiagnostics>>,
) {
  assert(diagnostics.session.id === detail.session.id, "Diagnostics session id mismatch.");
  assert(diagnostics.providerCalls.length > 0, "Expected provider calls in session diagnostics.");
  assert(
    detail.session.status === "completed",
    `Expected completed demo session, received ${detail.session.status}.`,
  );
  assert(detail.artifacts.length > 0, "Expected artifacts for a completed session.");
  assertLiveSessionProof({
    artifacts: detail.artifacts,
    providerCalls: diagnostics.providerCalls,
    snapshotMembers: detail.session.snapshot.council.members,
    expectedMembers: BUILT_IN_COUNCILS.commons.members,
    label: `demo session ${detail.session.id}`,
  });
  assertNoPendingBillingLookups({
    providerCalls: diagnostics.providerCalls,
    label: `demo session ${detail.session.id}`,
  });
}

export async function runDemoSmoke(input: {
  baseUrl: string;
  liveEnv: LiveProofRuntime;
  serverEnv: ServerRuntime;
  commonsRef: { kind: "built_in"; slug: "commons" };
}) {
  const { baseUrl, liveEnv, serverEnv, commonsRef } = input;
  const proofOrigin = resolveProofOrigin({
    baseUrl,
    publicOrigin: serverEnv.publicOrigin,
  });

  console.log("Live smoke: demo request + consume");
  await assertResendInboundAccess(serverEnv);
  await clearProofRateLimits(liveEnv.demoTestEmail);
  const requestedAt = new Date(Date.now() - 5_000);
  const demoRequest = await requestDemoLink(liveEnv.demoTestEmail);
  console.log(`  demo email sent to: ${demoRequest.email}`);
  assert(
    demoRequest.email === liveEnv.demoTestEmail.trim().toLowerCase(),
    "Demo request returned an unexpected recipient.",
  );

  const receivedEmail = await waitForReceivedDemoEmail({
    env: serverEnv,
    recipient: demoRequest.email,
    requestedAt,
  });
  const demoSession = await consumeDemoLink({
    baseUrl,
    publicOrigin: proofOrigin,
    email: liveEnv.demoTestEmail,
    receivedEmail,
  });

  console.log("Live smoke: demo session submit");
  const demoQuestion =
    "Is a council of 7 AI models more likely to produce a better answer than a single top-tier model given the same question? Under what conditions does multi-model deliberation add value versus just adding cost and latency?";
  const demoRun = await createDemoSessionRun({
    baseUrl,
    publicOrigin: proofOrigin,
    cookieHeader: demoSession.cookieHeader,
    query: demoQuestion,
    councilRef: commonsRef,
  });
  const demoDetail = await waitForTerminalDemoSession({
    baseUrl,
    publicOrigin: proofOrigin,
    cookieHeader: demoSession.cookieHeader,
    sessionId: demoRun.sessionId,
    label: "Demo session",
  });
  const demoDiagnostics = await waitForDemoBillingDiagnostics({
    baseUrl,
    publicOrigin: proofOrigin,
    cookieHeader: demoSession.cookieHeader,
    sessionId: demoRun.sessionId,
    label: "Demo session",
  });
  assertSessionArtifacts(demoDetail, demoDiagnostics);

  console.log("Live smoke: playwright");
  await runPlaywrightSmoke({
    demoCookie: demoSession.cookieValue,
    demoEmail: demoSession.email,
    demoExpiresAt: demoSession.expiresAt,
    sessionId: demoRun.sessionId,
    sessionQuery: demoQuestion,
  });
}
