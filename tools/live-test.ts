import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import {
  BUILT_IN_COUNCILS,
  loadLiveTestEnv,
  loadServerEnv,
  type ServerEnv,
} from "@the-seven/config";
import {
  autocompleteModels,
  consumeDemoLink,
  createSession,
  deleteCouncil,
  duplicateCouncil,
  fetchCouncil,
  fetchSession,
  fetchSessionDiagnostics,
  requestDemoLink,
  updateCouncil,
  validateByokKey,
  validateModel,
} from "../apps/web/src/lib/api";
import { runCommandOrThrow, sleep, stopChild } from "./process-utils";

const sessionTerminalStates = new Set(["completed", "failed"]);

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

async function assertAppReachable(baseUrl: string) {
  try {
    const response = await fetch(baseUrl, { redirect: "manual" });
    if (response.status >= 200 && response.status < 500) {
      return;
    }
  } catch {}

  throw new Error(`Local app is not reachable at ${baseUrl}; start it with \`pnpm local:live\`.`);
}

async function resendRequest(
  env: ServerEnv,
  method: "GET" | "POST" | "DELETE",
  path: string,
  body?: unknown,
) {
  const apiKey = env.demo.resendApiKey;
  assert(apiKey !== null, "SEVEN_DEMO_RESEND_API_KEY is required for live demo verification.");

  const response = await fetch(`https://api.resend.com${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await response.text();
  const data = text ? (JSON.parse(text) as unknown) : null;
  if (!response.ok) {
    const message =
      data && typeof data === "object" && "message" in data && typeof data.message === "string"
        ? data.message
        : response.statusText;
    throw new Error(`Resend API ${method} ${path} failed (${response.status}): ${message}`);
  }
  return data;
}

async function assertResendInboundAccess(env: ServerEnv) {
  try {
    await resendRequest(env, "GET", "/emails/receiving?limit=1");
  } catch (error) {
    if (
      error instanceof Error &&
      /restricted to only send emails|restricted_api_key/i.test(error.message)
    ) {
      throw new Error(
        "SEVEN_DEMO_RESEND_API_KEY is send-only. Full local live verification requires a Resend API key that can manage webhooks and read received emails.",
      );
    }
    throw error;
  }
}

async function createTemporaryWebhook(env: ServerEnv, publicUrl: string) {
  const data = await resendRequest(env, "POST", "/webhooks", {
    url: publicUrl,
    enabled: true,
    events: ["email.received"],
  });
  if (!data || typeof data !== "object" || !("id" in data) || typeof data.id !== "string") {
    throw new Error("Resend webhook creation response did not include an id.");
  }
  return { id: data.id };
}

async function deleteTemporaryWebhook(env: ServerEnv, webhookId: string) {
  await resendRequest(env, "DELETE", `/webhooks/${webhookId}`);
}

async function retrieveReceivedEmail(env: ServerEnv, emailId: string) {
  const data = await resendRequest(env, "GET", `/emails/${emailId}`);
  if (!data || typeof data !== "object" || !("id" in data) || typeof data.id !== "string") {
    throw new Error("Received email payload is malformed.");
  }

  return {
    id: data.id,
    html: "html" in data && typeof data.html === "string" ? data.html : null,
    text: "text" in data && typeof data.text === "string" ? data.text : null,
  };
}

function readBodyText(message: IncomingMessage) {
  return new Promise<string>((resolve, reject) => {
    let body = "";
    message.setEncoding("utf8");
    message.on("data", (chunk) => {
      body += chunk;
    });
    message.on("end", () => resolve(body));
    message.on("error", reject);
  });
}

async function writeJson(response: ServerResponse, statusCode: number, body: object) {
  response.statusCode = statusCode;
  response.setHeader("content-type", "application/json");
  response.end(JSON.stringify(body));
}

async function startWebhookReceiver() {
  const routePath = `/resend-webhook/${randomUUID()}`;
  let resolveEmailId: ((emailId: string) => void) | null = null;
  let rejectEmailId: ((error: unknown) => void) | null = null;
  const emailIdPromise = new Promise<string>((resolve, reject) => {
    resolveEmailId = resolve;
    rejectEmailId = reject;
  });

  const server = createServer(async (request, response) => {
    try {
      if (request.method !== "POST" || request.url !== routePath) {
        await writeJson(response, 404, { ok: false });
        return;
      }

      const body = await readBodyText(request);
      const rawPayload = body ? (JSON.parse(body) as unknown) : {};
      const emailId =
        rawPayload &&
        typeof rawPayload === "object" &&
        "type" in rawPayload &&
        rawPayload.type === "email.received" &&
        "data" in rawPayload &&
        rawPayload.data &&
        typeof rawPayload.data === "object" &&
        "email_id" in rawPayload.data &&
        typeof rawPayload.data.email_id === "string"
          ? rawPayload.data.email_id
          : null;
      if (!emailId) {
        throw new Error("Resend webhook did not include an email_id.");
      }

      await writeJson(response, 200, { ok: true });
      resolveEmailId?.(emailId);
    } catch (error) {
      await writeJson(response, 400, { ok: false });
      rejectEmailId?.(error);
    }
  });

  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Failed to bind webhook receiver.");
  }

  return {
    server,
    port: address.port,
    routePath,
    async close() {
      server.close();
    },
    async waitForEmailId() {
      const timeoutPromise = new Promise<string>((_, reject) => {
        setTimeout(() => {
          reject(new Error("Timed out waiting for the Resend inbound webhook."));
        }, 90_000);
      });
      return await Promise.race([emailIdPromise, timeoutPromise]);
    },
  };
}

async function startQuickTunnel(targetUrl: string) {
  const child = spawn("cloudflared", ["tunnel", "--url", targetUrl, "--no-autoupdate"], {
    cwd: process.cwd(),
    stdio: ["ignore", "pipe", "pipe"],
  });

  const publicUrl = await new Promise<string>((resolve, reject) => {
    const deadline = Date.now() + 30_000;
    let stderr = "";

    function inspectChunk(chunk: Buffer | string) {
      const text = chunk.toString();
      stderr += text;
      const match = text.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/i);
      if (match) {
        resolve(match[0]);
        return;
      }
      if (Date.now() > deadline) {
        reject(new Error(stderr || "Timed out waiting for the Cloudflare quick tunnel URL."));
      }
    }

    child.stdout.on("data", inspectChunk);
    child.stderr.on("data", inspectChunk);
    child.on("error", reject);
    child.on("close", (code) => {
      reject(new Error(stderr || `cloudflared exited with code ${code ?? 1}`));
    });
  });

  return {
    publicUrl,
    async close() {
      await stopChild(child);
    },
  };
}

function extractDemoToken(input: { html?: string | null; text?: string | null }) {
  const content = `${input.html ?? ""}\n${input.text ?? ""}`;
  const match = content.match(/[?&]demo_token=([A-Za-z0-9_-]+)/);
  if (!match) {
    throw new Error("Could not extract demo_token from the received email.");
  }
  return match[1];
}

async function waitForTerminalSession(authHeader: string, sessionId: number, label: string) {
  const deadline = Date.now() + 240_000;
  while (Date.now() < deadline) {
    const detail = await fetchSession(authHeader, sessionId);
    if (sessionTerminalStates.has(detail.session.status)) {
      console.log(`${label}: ${detail.session.status}`);
      return detail;
    }
    await sleep(2_000);
  }

  throw new Error(`${label} did not reach a terminal state in time.`);
}

async function selectByokCouncil(authHeader: string) {
  const candidates = [
    { kind: "built_in", slug: "founding" },
    { kind: "built_in", slug: "lantern" },
    { kind: "built_in", slug: "commons" },
  ] as const;

  for (const candidate of candidates) {
    const council = BUILT_IN_COUNCILS[candidate.slug];
    const validations = await Promise.all(
      council.members.map((member) => validateModel(authHeader, member.model.modelId)),
    );
    if (validations.every((validation) => validation.valid)) {
      return candidate;
    }
  }

  throw new Error("No built-in council currently validates cleanly against the live catalog.");
}

function assertSessionArtifacts(
  detail: Awaited<ReturnType<typeof fetchSession>>,
  diagnostics: Awaited<ReturnType<typeof fetchSessionDiagnostics>>,
) {
  assert(diagnostics.session.id === detail.session.id, "Diagnostics session id mismatch.");
  assert(diagnostics.providerCalls.length > 0, "Expected provider calls in session diagnostics.");

  if (detail.session.status === "completed") {
    assert(detail.artifacts.length > 0, "Expected artifacts for a completed session.");
    return;
  }

  assert(
    detail.session.failureKind !== null || diagnostics.providerCalls.length > 0,
    "Expected a failure kind or provider evidence for a failed session.",
  );
}

async function runPlaywrightSmoke(input: {
  demoToken: string;
  demoEmail: string;
  demoExpiresAt: number;
  sessionId: number;
  sessionQuery: string;
}) {
  await runCommandOrThrow("pnpm", ["test:e2e"], {
    env: {
      ...process.env,
      SEVEN_PLAYWRIGHT_EXTERNAL_SERVER: "1",
      SEVEN_PLAYWRIGHT_DEMO_TOKEN: input.demoToken,
      SEVEN_PLAYWRIGHT_DEMO_EMAIL: input.demoEmail,
      SEVEN_PLAYWRIGHT_DEMO_EXPIRES_AT: String(input.demoExpiresAt),
      SEVEN_PLAYWRIGHT_SESSION_ID: String(input.sessionId),
      SEVEN_PLAYWRIGHT_SESSION_QUERY: input.sessionQuery,
    },
  });
}

async function main() {
  const liveEnv = loadLiveTestEnv();
  const serverEnv = loadServerEnv();
  await assertAppReachable(liveEnv.baseUrl);

  assert(serverEnv.demo.enabled, "SEVEN_DEMO_ENABLED must be 1 for `pnpm test:live`.");
  assert(
    serverEnv.demo.openRouterApiKey !== null,
    "SEVEN_DEMO_OPENROUTER_KEY is required for `pnpm test:live`.",
  );
  assert(
    serverEnv.demo.resendApiKey !== null,
    "SEVEN_DEMO_RESEND_API_KEY is required for `pnpm test:live`.",
  );
  assert(
    serverEnv.demo.emailFrom !== null,
    "SEVEN_DEMO_EMAIL_FROM is required for `pnpm test:live`.",
  );

  const commonsRef = { kind: "built_in", slug: "commons" } as const;
  const authHeader = `Bearer ${liveEnv.byokKey}`;

  console.log("Live smoke: auth validate");
  const validation = await validateByokKey(liveEnv.byokKey);
  assert(validation.valid, "OpenRouter rejected SEVEN_BYOK_KEY.");

  const byokCouncilRef = await selectByokCouncil(authHeader);
  const byokModelId = BUILT_IN_COUNCILS[byokCouncilRef.slug].members[0].model.modelId;

  console.log("Live smoke: model validate + autocomplete");
  const modelValidation = await validateModel(authHeader, byokModelId);
  assert(modelValidation.valid, `Model validation failed for ${byokModelId}.`);
  const modelQuery = (byokModelId.split("/")[1] ?? "gpt").replace(/:.*$/, "");
  const suggestions = await autocompleteModels(authHeader, modelQuery, 5);
  assert(suggestions.suggestions.length > 0, "Expected model autocomplete suggestions.");

  console.log("Live smoke: council CRUD");
  const duplicateName = `Live Smoke ${new Date().toISOString()}`;
  const duplicated = await duplicateCouncil(authHeader, byokCouncilRef, duplicateName);
  const duplicatedRef = { kind: "user", councilId: duplicated.councilId } as const;
  try {
    const detail = await fetchCouncil(authHeader, duplicatedRef);
    await updateCouncil({
      authHeader,
      ref: duplicatedRef,
      name: `${duplicateName} Updated`,
      phasePrompts: {
        ...detail.phasePrompts,
        phase1: `${detail.phasePrompts.phase1}\n\nLive smoke marker.`,
      },
      members: detail.members,
    });
    const updated = await fetchCouncil(authHeader, duplicatedRef);
    assert(updated.name === `${duplicateName} Updated`, "Council update did not persist.");
  } finally {
    await deleteCouncil(authHeader, duplicatedRef);
  }

  console.log("Live smoke: BYOK session submit");
  const byokQuestion = `BYOK live smoke ${new Date().toISOString()}`;
  const byokSession = await createSession({
    authHeader,
    query: byokQuestion,
    councilRef: byokCouncilRef,
  });
  const byokDetail = await waitForTerminalSession(
    authHeader,
    byokSession.sessionId,
    "BYOK session",
  );
  const byokDiagnostics = await fetchSessionDiagnostics(authHeader, byokSession.sessionId);
  assertSessionArtifacts(byokDetail, byokDiagnostics);

  console.log("Live smoke: demo request + consume");
  await assertResendInboundAccess(serverEnv);
  const receiver = await startWebhookReceiver();
  const tunnel = await startQuickTunnel(`http://127.0.0.1:${receiver.port}`);
  let webhookId: string | null = null;
  try {
    const webhook = await createTemporaryWebhook(
      serverEnv,
      `${tunnel.publicUrl}${receiver.routePath}`,
    );
    webhookId = webhook.id;

    const demoRequest = await requestDemoLink(liveEnv.demoTestEmail);
    assert(
      demoRequest.email === liveEnv.demoTestEmail.trim().toLowerCase(),
      "Demo request returned an unexpected recipient.",
    );

    const emailId = await receiver.waitForEmailId();
    const receivedEmail = await retrieveReceivedEmail(serverEnv, emailId);
    const demoToken = extractDemoToken(receivedEmail);
    const demoSession = await consumeDemoLink(demoToken);
    const demoAuthHeader = `Demo ${demoSession.token}`;

    console.log("Live smoke: demo session submit");
    const demoQuestion = `Demo live smoke ${new Date().toISOString()}`;
    const demoRun = await createSession({
      authHeader: demoAuthHeader,
      query: demoQuestion,
      councilRef: commonsRef,
    });
    const demoDetail = await waitForTerminalSession(
      demoAuthHeader,
      demoRun.sessionId,
      "Demo session",
    );
    const demoDiagnostics = await fetchSessionDiagnostics(demoAuthHeader, demoRun.sessionId);
    assertSessionArtifacts(demoDetail, demoDiagnostics);

    console.log("Live smoke: playwright");
    await runPlaywrightSmoke({
      demoToken: demoSession.token,
      demoEmail: demoSession.email,
      demoExpiresAt: demoSession.expiresAt,
      sessionId: demoRun.sessionId,
      sessionQuery: demoQuestion,
    });
  } finally {
    if (webhookId) {
      await deleteTemporaryWebhook(serverEnv, webhookId);
    }
    await tunnel.close();
    await receiver.close();
  }
}

await main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
