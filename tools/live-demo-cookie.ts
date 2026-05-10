import type { LiveProofRuntime, ServerRuntime } from "@the-seven/config";
import {
  querySubmitBodySchema,
  sessionDetailPayloadSchema,
  sessionDiagnosticsPayloadSchema,
  submitPayloadSchema,
  successEnvelopeSchema,
} from "@the-seven/contracts";
import { deleteRateLimitBucketsForScopes } from "@the-seven/db";
import { requestDemoLink } from "../apps/web/src/lib/api";
import { runCommandOrThrow, sleep } from "./process-utils";
import { assertResendInboundAccess, waitForReceivedDemoEmail } from "./resend-live-proof";

const sessionTerminalStates = new Set(["completed", "failed"]);
const demoSessionCookieName = "seven_demo_session";

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

function extractDemoConsumeUrl(input: {
  baseUrl: string;
  html?: string | null;
  text?: string | null;
}) {
  const content = `${input.html ?? ""}\n${input.text ?? ""}`;
  const linkMatch = content.match(
    /https?:\/\/[^\s"'<>]+\/api\/v1\/demo\/consume\?token=[A-Za-z0-9_-]+/,
  );
  if (linkMatch) {
    return linkMatch[0];
  }

  const tokenMatch = content.match(/[?&]token=([A-Za-z0-9_-]+)/);
  if (tokenMatch?.[1]) {
    return new URL(`/api/v1/demo/consume?token=${tokenMatch[1]}`, input.baseUrl).toString();
  }

  throw new Error("Could not extract the demo consume link from the received email.");
}

function readDemoCookie(response: Response) {
  const headersWithCookies = response.headers as Headers & {
    getSetCookie?: () => string[];
  };
  const cookies = headersWithCookies.getSetCookie?.() ?? [];
  const fallbackCookie = response.headers.get("set-cookie");
  const allCookies = fallbackCookie ? [...cookies, fallbackCookie] : cookies;
  const cookie = allCookies.find((value) => value.startsWith(`${demoSessionCookieName}=`));
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

type PayloadSchema<T> = Readonly<{ parse(value: unknown): T }>;

async function demoApiRequest<T>(input: {
  baseUrl: string;
  publicOrigin: string;
  cookieHeader: string;
  path: string;
  method: "GET" | "POST";
  body?: unknown;
  payloadSchema: PayloadSchema<T>;
}) {
  const response = await fetch(new URL(input.path, input.baseUrl), {
    method: input.method,
    headers: {
      "Content-Type": "application/json",
      "X-Seven-Ingress": "api",
      Cookie: input.cookieHeader,
      Origin: input.publicOrigin.replace(/\/+$/, ""),
    },
    body: input.body ? JSON.stringify(input.body) : undefined,
    redirect: "manual",
  });

  const raw = await response.text();
  const data = raw ? (JSON.parse(raw) as unknown) : null;
  if (!response.ok) {
    throw new Error(`Demo API ${input.method} ${input.path} failed (${response.status}): ${raw}`);
  }

  const envelope = successEnvelopeSchema.parse(data);
  return input.payloadSchema.parse(envelope.result.payload);
}

const demoSessionPayloadSchema = {
  parse(value: unknown) {
    if (
      value &&
      typeof value === "object" &&
      "email" in value &&
      typeof value.email === "string" &&
      "expiresAt" in value &&
      typeof value.expiresAt === "number"
    ) {
      return {
        email: value.email,
        expiresAt: value.expiresAt,
      };
    }
    throw new Error("Demo session payload is malformed.");
  },
} satisfies PayloadSchema<Readonly<{ email: string; expiresAt: number }>>;

async function consumeDemoLink(input: {
  baseUrl: string;
  publicOrigin: string;
  email: string;
  receivedEmail: { html?: string | null; text?: string | null };
}) {
  const consumeUrl = extractDemoConsumeUrl({
    baseUrl: input.baseUrl,
    html: input.receivedEmail.html,
    text: input.receivedEmail.text,
  });
  const response = await fetch(consumeUrl, {
    method: "GET",
    headers: { "X-Seven-Ingress": "api" },
    redirect: "manual",
  });
  if (response.status !== 303) {
    const body = await response.text();
    throw new Error(`Demo consume failed (${response.status}): ${body}`);
  }

  const cookie = readDemoCookie(response);
  const session = await demoApiRequest({
    baseUrl: input.baseUrl,
    publicOrigin: input.publicOrigin,
    cookieHeader: cookie.cookieHeader,
    path: "/api/v1/demo/session",
    method: "GET",
    payloadSchema: demoSessionPayloadSchema,
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
  const body = querySubmitBodySchema.parse({
    query: input.query,
    councilRef: input.councilRef,
  });
  return demoApiRequest({
    baseUrl: input.baseUrl,
    publicOrigin: input.publicOrigin,
    cookieHeader: input.cookieHeader,
    path: "/api/v1/sessions",
    method: "POST",
    body,
    payloadSchema: submitPayloadSchema,
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
    path: `/api/v1/sessions/${input.sessionId}`,
    method: "GET",
    payloadSchema: sessionDetailPayloadSchema,
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
    path: `/api/v1/sessions/${input.sessionId}/diagnostics`,
    method: "GET",
    payloadSchema: sessionDiagnosticsPayloadSchema,
  });
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
  await runCommandOrThrow("pnpm", ["test:e2e"], {
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
}

function isLoopbackHost(hostname: string) {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

function resolveProofOrigin(input: { baseUrl: string; publicOrigin: string }) {
  const base = new URL(input.baseUrl);
  if (isLoopbackHost(base.hostname)) {
    return new URL(input.publicOrigin).origin;
  }
  return base.origin;
}

export async function runDemoSmoke(input: {
  liveEnv: LiveProofRuntime;
  serverEnv: ServerRuntime;
  commonsRef: { kind: "built_in"; slug: "commons" };
}) {
  const { liveEnv, serverEnv, commonsRef } = input;
  const proofOrigin = resolveProofOrigin({
    baseUrl: liveEnv.baseUrl,
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
    baseUrl: liveEnv.baseUrl,
    publicOrigin: proofOrigin,
    email: liveEnv.demoTestEmail,
    receivedEmail,
  });

  console.log("Live smoke: demo session submit");
  const demoQuestion =
    "Is a council of 7 AI models more likely to produce a better answer than a single top-tier model given the same question? Under what conditions does multi-model deliberation add value versus just adding cost and latency?";
  const demoRun = await createDemoSessionRun({
    baseUrl: liveEnv.baseUrl,
    publicOrigin: proofOrigin,
    cookieHeader: demoSession.cookieHeader,
    query: demoQuestion,
    councilRef: commonsRef,
  });
  const demoDetail = await waitForTerminalDemoSession({
    baseUrl: liveEnv.baseUrl,
    publicOrigin: proofOrigin,
    cookieHeader: demoSession.cookieHeader,
    sessionId: demoRun.sessionId,
    label: "Demo session",
  });
  const demoDiagnostics = await fetchDemoSessionDiagnostics({
    baseUrl: liveEnv.baseUrl,
    publicOrigin: proofOrigin,
    cookieHeader: demoSession.cookieHeader,
    sessionId: demoRun.sessionId,
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
