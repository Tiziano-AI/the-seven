import { getDb } from "../client";
import { providerCalls, sessionArtifacts } from "../schema";
import type { ProviderCallWriteInput, SessionArtifactWriteInput } from "./sessions";

function requireTestEnvironment(helperName: string) {
  if (process.env.NODE_ENV !== "test") {
    throw new Error(`${helperName} is only available while NODE_ENV=test.`);
  }
}

export async function createSessionArtifactForTest(input: SessionArtifactWriteInput) {
  requireTestEnvironment("createSessionArtifactForTest");
  const db = await getDb();
  await db
    .insert(sessionArtifacts)
    .values({
      sessionId: input.sessionId,
      phase: input.phase,
      artifactKind: input.artifactKind,
      memberPosition: input.memberPosition,
      modelId: input.modelId,
      content: input.content,
      tokensUsed: input.tokensUsed ?? null,
      costUsdMicros: input.costUsdMicros ?? null,
    })
    .onConflictDoNothing();
}

export async function createProviderCallForTest(input: ProviderCallWriteInput) {
  requireTestEnvironment("createProviderCallForTest");
  const db = await getDb();
  await db.insert(providerCalls).values(input);
}
