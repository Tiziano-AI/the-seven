import { MEMBER_POSITIONS, parseCouncilMembers, type SessionSnapshot } from "@the-seven/contracts";
import { eq } from "drizzle-orm";
import { getDb } from "../client";
import { jobs } from "../schema";
import { createSessionWithJob } from "./sessions";
import { getOrCreateUser } from "./users";

const CLAIMABLE_TEST_TIME = new Date("2026-05-13T11:59:00.000Z");

function buildSnapshot(): SessionSnapshot {
  const members = parseCouncilMembers(
    MEMBER_POSITIONS.map((memberPosition) => ({
      memberPosition,
      model: { provider: "openrouter", modelId: `provider/model-${memberPosition}` },
      tuning: null,
    })),
  );

  return {
    version: 1,
    createdAt: "2026-05-13T00:00:00.000Z",
    query: "How should we launch?",
    userMessage: "How should we launch?",
    attachments: [],
    outputFormats: {
      phase1: "Return a concise answer.",
      phase2: "Return strict JSON.",
      phase3: "Return the final answer.",
    },
    council: {
      nameAtRun: "Test Council",
      phasePrompts: {
        phase1: "Answer directly.",
        phase2: "Evaluate directly.",
        phase3: "Synthesize directly.",
      },
      members,
    },
  };
}

export async function createQueuedSession(): Promise<number> {
  const user = await getOrCreateUser({ kind: "byok", principal: "principal:test" });
  const sessionId = await createSessionWithJob({
    userId: user.id,
    query: "How should we launch?",
    attachments: [],
    snapshot: buildSnapshot(),
    councilNameAtRun: "Test Council",
    questionHash: "question-hash",
    ingressSource: "api",
    ingressVersion: "test",
    traceId: "trace-test",
    buildCredentialCiphertext: ({ sessionId, jobId }) => `cipher:${sessionId}:${jobId}`,
  });
  const db = await getDb();
  await db
    .update(jobs)
    .set({ nextRunAt: CLAIMABLE_TEST_TIME })
    .where(eq(jobs.sessionId, sessionId));
  return sessionId;
}
