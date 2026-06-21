import { BUILT_IN_COUNCILS, cliRuntime, liveProof, serverRuntime } from "@the-seven/config";
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
import { formatTerminalSessionFailure } from "./live-session-diagnostics";
import { assertLiveSessionProof, assertNoPendingBillingLookups } from "./live-session-proof";
import { sleep } from "./process-utils";

const LIVE_SESSION_TIMEOUT_MS = 1_800_000;
const LIVE_BILLING_TIMEOUT_MS = 150_000;
const LIVE_API_POLL_TIMEOUT_MS = 60_000;
const LIVE_APP_REACHABILITY_TIMEOUT_MS = 10_000;
const LIVE_REACHABILITY_CHECK_AFTER_TRANSIENT_ERRORS = 3;
const BUILT_IN_REVIEWER_REASONING_EFFORTS = {
  commons: "low",
  lantern: "medium",
  founding: "xhigh",
} as const;
const BUILT_IN_SYNTHESIZER_REASONING_EFFORT = "xhigh";

type SessionDetail = Awaited<ReturnType<typeof fetchSession>>;
type SessionDiagnostics = Awaited<ReturnType<typeof fetchSessionDiagnostics>>;

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

async function assertAppReachable(baseUrl: string) {
  let reachabilityError: string | null = null;
  try {
    const response = await fetch(baseUrl, {
      redirect: "manual",
      signal: AbortSignal.timeout(LIVE_APP_REACHABILITY_TIMEOUT_MS),
    });
    if (response.status >= 200 && response.status < 500) {
      return;
    }
    reachabilityError = `HTTP ${response.status}`;
  } catch (error) {
    reachabilityError = error instanceof Error ? error.message : String(error);
  }

  throw new Error(
    `Local app is not reachable at ${baseUrl}; start it with \`pnpm local:live\`. ${reachabilityError ?? "No response."}`,
  );
}

function formatErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isTransientLiveApiError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.toLowerCase();
  const name = error.name.toLowerCase();
  return (
    name.includes("abort") ||
    name.includes("timeout") ||
    message.includes("fetch failed") ||
    message.includes("terminated") ||
    message.includes("socket") ||
    message.includes("econnreset") ||
    message.includes("econnrefused") ||
    message.includes("operation was aborted") ||
    message.includes("timed out")
  );
}

async function fetchLiveApi<T>(input: {
  authHeader: string;
  baseUrl: string;
  sessionId: number;
  label: string;
  operation: string;
  deadline: number;
  fetcher: (signal: AbortSignal) => Promise<T>;
}): Promise<T> {
  let consecutiveTransientErrors = 0;
  let lastTransientError: string | null = null;

  while (Date.now() < input.deadline) {
    try {
      const timeoutMs = Math.min(
        LIVE_API_POLL_TIMEOUT_MS,
        Math.max(1, input.deadline - Date.now()),
      );
      const result = await input.fetcher(AbortSignal.timeout(timeoutMs));
      consecutiveTransientErrors = 0;
      return result;
    } catch (error) {
      if (!isTransientLiveApiError(error)) {
        throw error;
      }

      consecutiveTransientErrors += 1;
      lastTransientError = formatErrorMessage(error);
      console.warn(
        `${input.label}: transient ${input.operation} poll error for session ${input.sessionId}: ${lastTransientError}; retrying.`,
      );
      if (consecutiveTransientErrors >= LIVE_REACHABILITY_CHECK_AFTER_TRANSIENT_ERRORS) {
        await assertAppReachable(input.baseUrl);
        consecutiveTransientErrors = 0;
      }
      await sleep(2_000);
    }
  }

  throw new Error(
    `${input.label}: ${input.operation} polling exceeded the live timeout for session ${input.sessionId}. Last transient error: ${lastTransientError ?? "none"}`,
  );
}

async function fetchLiveSession(input: {
  authHeader: string;
  baseUrl: string;
  sessionId: number;
  label: string;
  deadline: number;
}): Promise<SessionDetail> {
  return fetchLiveApi({
    ...input,
    operation: "session detail",
    fetcher: (signal) => fetchSession(input.authHeader, input.sessionId, { signal }),
  });
}

async function fetchLiveSessionDiagnostics(input: {
  authHeader: string;
  baseUrl: string;
  sessionId: number;
  label: string;
  deadline: number;
}): Promise<SessionDiagnostics> {
  return fetchLiveApi({
    ...input,
    operation: "session diagnostics",
    fetcher: (signal) => fetchSessionDiagnostics(input.authHeader, input.sessionId, { signal }),
  });
}

async function waitForTerminalSession(input: {
  authHeader: string;
  baseUrl: string;
  sessionId: number;
  label: string;
}) {
  const deadline = Date.now() + LIVE_SESSION_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const detail = await fetchLiveSession({ ...input, deadline });
    if (detail.session.status === "completed") {
      console.log(`${input.label}: completed`);
      return detail;
    }
    if (detail.session.status === "failed") {
      return describeTerminalSessionFailure({ ...input, reason: "failed" });
    }
    await sleep(2_000);
  }

  return describeTerminalSessionFailure({ ...input, reason: "timed out" });
}

async function waitForBillingDiagnostics(input: {
  authHeader: string;
  baseUrl: string;
  sessionId: number;
  label: string;
}) {
  const deadline = Date.now() + LIVE_BILLING_TIMEOUT_MS;
  let diagnostics = await fetchLiveSessionDiagnostics({ ...input, deadline });
  while (diagnostics.providerCalls.some((call) => call.billingLookupStatus === "pending")) {
    if (Date.now() >= deadline) {
      assertNoPendingBillingLookups({
        providerCalls: diagnostics.providerCalls,
        label: input.label,
      });
    }
    await sleep(5_000);
    diagnostics = await fetchLiveSessionDiagnostics({ ...input, deadline });
  }
  return diagnostics;
}

async function waitForFailureBillingDiagnostics(input: {
  authHeader: string;
  baseUrl: string;
  sessionId: number;
  label: string;
}) {
  const deadline = Date.now() + LIVE_BILLING_TIMEOUT_MS;
  let diagnostics = await fetchLiveSessionDiagnostics({ ...input, deadline });
  while (
    diagnostics.providerCalls.some((call) => call.billingLookupStatus === "pending") &&
    Date.now() < deadline
  ) {
    await sleep(5_000);
    diagnostics = await fetchLiveSessionDiagnostics({ ...input, deadline });
  }
  return diagnostics;
}

async function describeTerminalSessionFailure(input: {
  authHeader: string;
  baseUrl: string;
  sessionId: number;
  label: string;
  reason: string;
}): Promise<never> {
  const deadline = Date.now() + LIVE_API_POLL_TIMEOUT_MS;
  const detail = await fetchLiveSession({ ...input, deadline });
  const diagnostics = await waitForFailureBillingDiagnostics(input);

  throw new Error(
    formatTerminalSessionFailure({
      label: input.label,
      reason: input.reason,
      detail,
      diagnostics,
    }),
  );
}

async function selectByokCouncils(authHeader: string) {
  const candidates = [
    { kind: "built_in", slug: "commons" },
    { kind: "built_in", slug: "lantern" },
    { kind: "built_in", slug: "founding" },
  ] as const;

  for (const candidate of candidates) {
    const council = BUILT_IN_COUNCILS[candidate.slug];
    for (const member of council.members) {
      const isSynthesizer = member.memberPosition === 7;
      const expectedReasoningEffort = isSynthesizer
        ? BUILT_IN_SYNTHESIZER_REASONING_EFFORT
        : BUILT_IN_REVIEWER_REASONING_EFFORTS[candidate.slug];
      const expectedVerbosity = isSynthesizer ? "max" : "low";
      assert(
        member.tuning?.reasoningEffort === expectedReasoningEffort,
        `${candidate.slug} ${member.model.modelId} is not using ${expectedReasoningEffort} built-in reasoning effort.`,
      );
      assert(
        member.tuning.temperature === null &&
          member.tuning.topP === null &&
          member.tuning.seed === null &&
          member.tuning.verbosity === expectedVerbosity &&
          member.tuning.includeReasoning === null,
        `${candidate.slug} ${member.model.modelId} has non-position built-in tuning defaults.`,
      );
    }

    const validations = await Promise.all(
      council.members.map((member) => validateModel(authHeader, member.model.modelId)),
    );
    for (let index = 0; index < validations.length; index += 1) {
      assert(
        validations[index]?.valid === true,
        `${candidate.slug} model ${council.members[index]?.model.modelId ?? index} did not validate.`,
      );
    }
    assert(
      validations.every((validation) => validation.valid),
      `${candidate.slug} council did not validate cleanly against the live catalog.`,
    );
  }

  return candidates;
}

function assertSessionArtifacts(
  detail: Awaited<ReturnType<typeof fetchSession>>,
  diagnostics: Awaited<ReturnType<typeof fetchSessionDiagnostics>>,
  slug: keyof typeof BUILT_IN_REVIEWER_REASONING_EFFORTS,
) {
  assert(diagnostics.session.id === detail.session.id, "Diagnostics session id mismatch.");
  assert(diagnostics.providerCalls.length > 0, "Expected provider calls in session diagnostics.");
  for (const call of diagnostics.providerCalls) {
    assert(call.requestModelId.length > 0, "Provider diagnostics are missing request model id.");
    assert(call.catalogRefreshedAt !== null, "Provider diagnostics are missing catalog freshness.");
    assert(
      call.supportedParameters.length > 0,
      `Provider diagnostics for ${call.requestModelId} are missing supported parameters.`,
    );
    assert(
      call.sentParameters.length > 0 || call.deniedParameters.length > 0,
      `Provider diagnostics for ${call.requestModelId} are missing sent or denied parameters.`,
    );
    assert(
      call.sentParameters.includes("reasoning"),
      `${slug} diagnostics for ${call.requestModelId} did not send tier reasoning effort.`,
    );
    assert(call.billingLookupStatus.length > 0, "Provider diagnostics are missing billing status.");
    if (call.errorMessage === null && call.choiceErrorMessage === null) {
      assert(
        call.responseId !== null,
        "Successful provider diagnostics are missing generation id.",
      );
      assert(
        call.responseModel !== null,
        "Successful provider diagnostics are missing response model.",
      );
    }
  }
  assert(
    detail.session.status === "completed",
    `Expected completed session, received ${detail.session.status}.`,
  );
  assert(detail.artifacts.length > 0, "Expected artifacts for a completed session.");
  assertLiveSessionProof({
    artifacts: detail.artifacts,
    providerCalls: diagnostics.providerCalls,
    snapshotMembers: detail.session.snapshot.council.members,
    expectedMembers: BUILT_IN_COUNCILS[slug].members,
    label: `session ${detail.session.id}`,
  });
  assertNoPendingBillingLookups({
    providerCalls: diagnostics.providerCalls,
    label: `session ${detail.session.id}`,
  });
}

async function main() {
  const liveEnv = liveProof();
  const cliEnv = cliRuntime();
  const serverEnv = serverRuntime();
  assert(cliEnv.baseUrl !== null, "SEVEN_BASE_URL is required for `pnpm test:live`.");
  await assertAppReachable(cliEnv.baseUrl);

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

  const byokCouncilRefs = await selectByokCouncils(authHeader);
  const byokModelId = BUILT_IN_COUNCILS[byokCouncilRefs[0].slug].members[0].model.modelId;

  console.log("Live smoke: model validate + autocomplete");
  const modelValidation = await validateModel(authHeader, byokModelId);
  assert(modelValidation.valid, `Model validation failed for ${byokModelId}.`);
  const modelQuery = (byokModelId.split("/")[1] ?? "gpt").replace(/:.*$/, "");
  const suggestions = await autocompleteModels(authHeader, modelQuery, 5);
  assert(suggestions.suggestions.length > 0, "Expected model autocomplete suggestions.");

  console.log("Live smoke: council CRUD");
  const duplicateName = `Live Smoke ${new Date().toISOString()}`;
  const duplicated = await duplicateCouncil(authHeader, byokCouncilRefs[0], duplicateName);
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

  await runDemoSmoke({ baseUrl: cliEnv.baseUrl, liveEnv, serverEnv, commonsRef });

  for (const byokCouncilRef of byokCouncilRefs) {
    console.log(`Live smoke: BYOK ${byokCouncilRef.slug} session submit`);
    const byokQuestion =
      "When does a multi-model council beat a single best model, and when is the extra latency not worth it?";
    const byokSession = await createSession({
      authHeader,
      query: byokQuestion,
      councilRef: byokCouncilRef,
    });
    const byokDetail = await waitForTerminalSession({
      authHeader,
      baseUrl: cliEnv.baseUrl,
      sessionId: byokSession.sessionId,
      label: `BYOK ${byokCouncilRef.slug} session`,
    });
    const byokDiagnostics = await waitForBillingDiagnostics({
      authHeader,
      baseUrl: cliEnv.baseUrl,
      sessionId: byokSession.sessionId,
      label: `BYOK ${byokCouncilRef.slug} session`,
    });
    assertSessionArtifacts(byokDetail, byokDiagnostics, byokCouncilRef.slug);
  }
}

await main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
