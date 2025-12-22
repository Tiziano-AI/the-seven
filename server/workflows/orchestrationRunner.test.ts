import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./orchestration", () => {
  return {
    orchestrateSession: vi.fn(),
  };
});

import { orchestrateSession } from "./orchestration";
import { runOrchestration } from "./orchestrationRunner";
import { createSession, getSessionById } from "../stores/sessionStore";
import { setupTestDatabase } from "../stores/testDb";
import { getOrCreateUserByokId } from "../stores/userStore";
import { hashQuestion } from "../domain/questionHash";

describe("orchestrationRunner", () => {
  beforeEach(() => {
    setupTestDatabase();
    vi.mocked(orchestrateSession).mockReset();
  });

  it("marks sessions as failed on unhandled orchestration errors", async () => {
    const user = await getOrCreateUserByokId("byok-test");
    const sessionId = await createSession({
      userId: user.id,
      query: "Runner failure",
      attachedFilesMarkdown: "[]",
      councilNameAtRun: "Test Council",
      runSpec: "{}",
      questionHash: hashQuestion("Runner failure"),
      ingressSource: "web",
      ingressVersion: null,
      status: "pending",
    });

    vi.mocked(orchestrateSession).mockRejectedValue(new Error("boom"));

    await runOrchestration({
      traceId: "trace-test",
      sessionId,
      userId: user.id,
      apiKey: "key-test",
    });

    const session = await getSessionById(sessionId);
    expect(session?.status).toBe("failed");
    expect(session?.failureKind).toBe("internal_error");
  });
});
