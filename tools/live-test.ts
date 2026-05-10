import { BUILT_IN_COUNCILS, liveProof, serverRuntime } from "@the-seven/config";
import {
  autocompleteModels,
  createSession,
  deleteCouncil,
  duplicateCouncil,
  fetchCouncil,
  fetchSession,
  fetchSessionDiagnostics,
  updateCouncil,
  validateByokKey,
  validateModel,
} from "../apps/web/src/lib/api";
import { runDemoSmoke } from "./live-demo-cookie";
import { sleep } from "./process-utils";

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

async function waitForTerminalSession(authHeader: string, sessionId: number, label: string) {
  const deadline = Date.now() + 600_000;
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
    { kind: "built_in", slug: "commons" },
    { kind: "built_in", slug: "lantern" },
    { kind: "built_in", slug: "founding" },
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
  assert(
    detail.session.status === "completed",
    `Expected completed session, received ${detail.session.status}.`,
  );
  assert(detail.artifacts.length > 0, "Expected artifacts for a completed session.");
}

const skipDemo = process.env.SEVEN_SKIP_DEMO_LIVE === "1";

async function main() {
  const liveEnv = liveProof();
  const serverEnv = serverRuntime();
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
  const byokQuestion =
    "When building a multi-model orchestration system, should you optimize for the best answer (use the smartest model for everything) or for diverse perspectives (use different architectures even if individually weaker)? When does diversity beat raw capability?";
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

  if (skipDemo) {
    console.log("Live smoke: demo flow skipped (SEVEN_SKIP_DEMO_LIVE=1)");
  } else {
    await runDemoSmoke({ liveEnv, serverEnv, commonsRef });
  }
}

await main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
