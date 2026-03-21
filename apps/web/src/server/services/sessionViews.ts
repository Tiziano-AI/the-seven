import "server-only";

import { BUILT_IN_MODEL_SEEDS } from "@the-seven/config";
import {
  formatUsdFromMicros,
  isMemberPosition,
  memberForPosition,
  type SessionSnapshot,
  sessionSnapshotSchema,
} from "@the-seven/contracts";
import {
  getSessionById,
  listCatalogModelsByIds,
  listProviderCalls,
  listSessionArtifacts,
  listSessionsByUserId,
} from "@the-seven/db";
import { EdgeError } from "../http/errors";

function buildModelNameMap(rows: Awaited<ReturnType<typeof listCatalogModelsByIds>>) {
  const map = new Map<string, string>();
  for (const seed of BUILT_IN_MODEL_SEEDS) {
    map.set(seed.modelId, seed.modelName);
  }
  for (const row of rows) {
    map.set(row.modelId, row.modelName);
  }
  return map;
}

function toSessionSummary(session: {
  id: number;
  query: string;
  questionHash: string;
  ingressSource: "web" | "cli" | "api";
  ingressVersion: string | null;
  councilNameAtRun: string;
  status: "pending" | "processing" | "completed" | "failed";
  failureKind: string | null;
  createdAt: Date;
  updatedAt: Date;
  totalTokens: number;
  totalCostUsdMicros: number;
  totalCostIsPartial: boolean;
}) {
  return {
    id: session.id,
    query: session.query,
    questionHash: session.questionHash,
    ingressSource: session.ingressSource,
    ingressVersion: session.ingressVersion,
    councilNameAtRun: session.councilNameAtRun,
    status: session.status,
    failureKind: session.failureKind,
    createdAt: session.createdAt.toISOString(),
    updatedAt: session.updatedAt.toISOString(),
    totalTokens: session.totalTokens,
    totalCostUsdMicros: session.totalCostUsdMicros,
    totalCostIsPartial: session.totalCostIsPartial,
    totalCost: formatUsdFromMicros(session.totalCostUsdMicros, 6),
  };
}

async function requireOwnedSession(userId: number, sessionId: number) {
  const session = await getSessionById(sessionId);
  if (!session || session.userId !== userId) {
    throw new EdgeError({
      kind: "not_found",
      message: "Session not found",
      details: { resource: "session" },
      status: 404,
    });
  }
  return session;
}

async function buildModelNameLookupForSession(sessionId: number, snapshot: SessionSnapshot) {
  const artifacts = await listSessionArtifacts(sessionId);
  const providerCalls = await listProviderCalls(sessionId);
  const modelIds = [
    ...snapshot.council.members.map((member) => member.model.modelId),
    ...artifacts.map((artifact) => artifact.modelId),
    ...providerCalls.flatMap((call) => [
      call.requestModelId,
      ...(call.responseModel ? [call.responseModel] : []),
      ...(call.billedModelId ? [call.billedModelId] : []),
    ]),
  ];
  return buildModelNameMap(await listCatalogModelsByIds(modelIds));
}

export async function listSessionSummaries(userId: number) {
  const sessions = await listSessionsByUserId(userId);
  return sessions.map(toSessionSummary);
}

export async function getSessionDetail(userId: number, sessionId: number) {
  const session = await requireOwnedSession(userId, sessionId);
  const snapshot = sessionSnapshotSchema.parse(session.snapshotJson);
  const [artifacts, providerCalls, modelNames] = await Promise.all([
    listSessionArtifacts(sessionId),
    listProviderCalls(sessionId),
    buildModelNameLookupForSession(sessionId, snapshot),
  ]);

  return {
    session: {
      ...toSessionSummary(session),
      snapshot,
    },
    artifacts: artifacts.map((artifact) => {
      const position = artifact.memberPosition;
      if (!isMemberPosition(position)) {
        throw new Error(`Invalid artifact member position ${position}`);
      }

      return {
        id: artifact.id,
        sessionId: artifact.sessionId,
        phase: artifact.phase,
        artifactKind: artifact.artifactKind,
        memberPosition: position,
        member: memberForPosition(position),
        modelId: artifact.modelId,
        modelName: modelNames.get(artifact.modelId) ?? artifact.modelId,
        content: artifact.content,
        tokensUsed: artifact.tokensUsed ?? null,
        costUsdMicros: artifact.costUsdMicros ?? null,
        createdAt: artifact.createdAt.toISOString(),
      };
    }),
    providerCalls: providerCalls.map((call) => ({
      id: call.id,
      sessionId: call.sessionId,
      phase: call.phase,
      memberPosition: call.memberPosition,
      requestModelId: call.requestModelId,
      requestModelName: modelNames.get(call.requestModelId) ?? call.requestModelId,
      responseModel: call.responseModel,
      billedModelId: call.billedModelId,
      requestSystemChars: call.requestSystemChars,
      requestUserChars: call.requestUserChars,
      requestTotalChars: call.requestTotalChars,
      requestStartedAt: call.requestStartedAt?.getTime() ?? null,
      responseCompletedAt: call.responseCompletedAt?.getTime() ?? null,
      latencyMs: call.latencyMs ?? null,
      totalCostUsdMicros: call.totalCostUsdMicros ?? null,
      usagePromptTokens: call.usagePromptTokens ?? null,
      usageCompletionTokens: call.usageCompletionTokens ?? null,
      usageTotalTokens: call.usageTotalTokens ?? null,
      finishReason: call.finishReason ?? null,
      nativeFinishReason: call.nativeFinishReason ?? null,
      errorMessage: call.errorMessage ?? null,
      choiceErrorMessage: call.choiceErrorMessage ?? null,
      choiceErrorCode: call.choiceErrorCode ?? null,
      errorStatus: call.errorStatus ?? null,
      responseId: call.responseId ?? null,
      createdAt: call.createdAt.toISOString(),
    })),
  };
}

export async function getSessionDiagnostics(userId: number, sessionId: number) {
  const detail = await getSessionDetail(userId, sessionId);
  return {
    session: detail.session,
    providerCalls: detail.providerCalls,
  };
}

function buildMarkdownExport(detail: Awaited<ReturnType<typeof getSessionDetail>>) {
  const lines: string[] = [
    `# Session ${detail.session.id}`,
    ``,
    `- Status: ${detail.session.status}`,
    `- Council: ${detail.session.councilNameAtRun}`,
    `- Created: ${detail.session.createdAt}`,
    `- Question Hash: ${detail.session.questionHash}`,
    ``,
    `## Query`,
    ``,
    detail.session.snapshot.query,
    ``,
    `## Artifacts`,
    ``,
  ];

  for (const artifact of detail.artifacts) {
    lines.push(`### Phase ${artifact.phase} · ${artifact.member.label} · ${artifact.artifactKind}`);
    lines.push(``);
    lines.push(`- Model: ${artifact.modelName}`);
    lines.push(``);
    lines.push(artifact.content);
    lines.push(``);
  }

  return lines.join("\n");
}

export async function exportSessions(userId: number, sessionIds: ReadonlyArray<number>) {
  const details = [];
  for (const sessionId of sessionIds) {
    details.push(await getSessionDetail(userId, sessionId));
  }

  return {
    markdown: details.map(buildMarkdownExport).join("\n\n---\n\n"),
    json: JSON.stringify(details, null, 2),
  };
}
