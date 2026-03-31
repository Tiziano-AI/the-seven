import "server-only";

import { BUILT_IN_COUNCILS } from "@the-seven/config";
import type { CouncilRef, IngressSource } from "@the-seven/contracts";
import {
  createSessionWithJob,
  enqueueSessionJob,
  getSessionById,
  setSessionPending,
} from "@the-seven/db";
import { decodeAttachmentToText } from "../domain/attachments";
import { encryptJobCredential } from "../domain/jobCredential";
import { hashQuestion } from "../domain/questionHash";
import { buildSessionSnapshot } from "../domain/sessionSnapshot";
import { EdgeError } from "../http/errors";
import { getOutputFormats, resolveCouncilSnapshot } from "./councils";
import { admitDemoRun } from "./demoLimits";

type AuthenticatedActor = Readonly<{
  kind: "byok" | "demo";
  userId: number;
  principal: string;
  openRouterKey: string;
}>;

function requireCommonsCouncil(ref: CouncilRef) {
  if (ref.kind === "built_in" && ref.slug === "commons") {
    return;
  }

  throw new EdgeError({
    kind: "forbidden",
    message: "Demo mode only allows Commons Council",
    details: { reason: "demo_council_only" },
    status: 403,
  });
}

function requireDemoSessionCouncil(councilNameAtRun: string) {
  if (councilNameAtRun === BUILT_IN_COUNCILS.commons.name) {
    return;
  }

  throw new EdgeError({
    kind: "forbidden",
    message: "Demo mode only allows Commons Council",
    details: { reason: "demo_council_only" },
    status: 403,
  });
}

async function admitDemoRunIfNeeded(input: {
  auth: AuthenticatedActor;
  ip: string | null;
  now: Date;
}) {
  if (input.auth.kind !== "demo") {
    return;
  }

  const limited = await admitDemoRun({
    email: input.auth.principal,
    ip: input.ip,
    now: input.now,
  });
  if (limited) {
    throw new EdgeError({
      kind: "rate_limited",
      message: "Demo run rate limit exceeded",
      details: {
        scope: limited.scope,
        limit: limited.limit,
        windowSeconds: limited.windowSeconds,
        resetAt: new Date(limited.resetAtMs).toISOString(),
      },
      status: 429,
    });
  }
}

async function decodeAttachments(
  attachments: ReadonlyArray<Readonly<{ name: string; base64: string }>> | undefined,
) {
  const decoded = [];
  for (const attachment of attachments ?? []) {
    const result = await decodeAttachmentToText(attachment);
    if (!result.ok) {
      throw new EdgeError({
        kind: "invalid_input",
        message: result.error.message,
        details: { issues: [{ path: "attachments", message: result.error.message }] },
        status: 400,
      });
    }
    decoded.push(result.attachment);
  }

  return decoded;
}

async function resolveSnapshot(input: {
  auth: AuthenticatedActor;
  councilRef: CouncilRef;
  query: string;
  attachments: ReadonlyArray<Readonly<{ name: string; text: string }>>;
  now: Date;
}) {
  try {
    const council = await resolveCouncilSnapshot({
      userId: input.auth.userId,
      ref: input.councilRef,
    });
    const outputFormats = getOutputFormats();
    const snapshot = buildSessionSnapshot({
      now: input.now,
      query: input.query,
      attachments: input.attachments,
      outputFormats,
      council,
    });

    return { council, snapshot };
  } catch (error) {
    if (error instanceof Error && error.message === "Council not found") {
      throw new EdgeError({
        kind: "not_found",
        message: "Council not found",
        details: { resource: "council" },
        status: 404,
      });
    }
    throw error;
  }
}

export async function submitSession(input: {
  auth: AuthenticatedActor;
  ip: string | null;
  now: Date;
  ingressSource: IngressSource;
  ingressVersion: string | null;
  traceId: string;
  query: string;
  councilRef: CouncilRef;
  attachments?: ReadonlyArray<Readonly<{ name: string; base64: string }>>;
}) {
  if (input.auth.kind === "demo") {
    requireCommonsCouncil(input.councilRef);
  }
  await admitDemoRunIfNeeded({
    auth: input.auth,
    ip: input.ip,
    now: input.now,
  });

  const attachments = await decodeAttachments(input.attachments);
  const { council, snapshot } = await resolveSnapshot({
    auth: input.auth,
    councilRef: input.councilRef,
    query: input.query,
    attachments,
    now: input.now,
  });

  const sessionId = await createSessionWithJob({
    userId: input.auth.userId,
    query: input.query,
    attachments,
    snapshot,
    councilNameAtRun: council.nameAtRun,
    questionHash: hashQuestion(snapshot.userMessage),
    ingressSource: input.ingressSource,
    ingressVersion: input.ingressVersion,
    traceId: input.traceId,
    credentialCiphertext: encryptJobCredential(input.auth.openRouterKey),
  });

  return { sessionId };
}

export async function continueSession(input: {
  auth: AuthenticatedActor;
  ip: string | null;
  now: Date;
  sessionId: number;
}) {
  const session = await getSessionById(input.sessionId);
  if (!session || session.userId !== input.auth.userId) {
    throw new EdgeError({
      kind: "not_found",
      message: "Session not found",
      details: { resource: "session" },
      status: 404,
    });
  }

  if (session.status !== "failed") {
    throw new EdgeError({
      kind: "invalid_input",
      message: `Only failed sessions can be continued (status is "${session.status}")`,
      details: { issues: [{ path: "status", message: "Session not in failed state" }] },
      status: 400,
    });
  }

  if (input.auth.kind === "demo") {
    requireDemoSessionCouncil(session.councilNameAtRun);
  }
  await admitDemoRunIfNeeded({
    auth: input.auth,
    ip: input.ip,
    now: input.now,
  });

  await setSessionPending(session.id);
  await enqueueSessionJob({
    sessionId: session.id,
    credentialCiphertext: encryptJobCredential(input.auth.openRouterKey),
  });
  return { sessionId: session.id };
}

export async function rerunSession(input: {
  auth: AuthenticatedActor;
  ip: string | null;
  now: Date;
  traceId: string;
  ingressSource: IngressSource;
  ingressVersion: string | null;
  sessionId: number;
  councilRef: CouncilRef;
  queryOverride?: string;
}) {
  const session = await getSessionById(input.sessionId);
  if (!session || session.userId !== input.auth.userId) {
    throw new EdgeError({
      kind: "not_found",
      message: "Session not found",
      details: { resource: "session" },
      status: 404,
    });
  }

  if (session.status !== "failed" && session.status !== "completed") {
    throw new EdgeError({
      kind: "invalid_input",
      message: `Only terminal sessions can be rerun (status is "${session.status}")`,
      details: { issues: [{ path: "status", message: "Session not in terminal state" }] },
      status: 400,
    });
  }

  if (input.auth.kind === "demo") {
    requireCommonsCouncil(input.councilRef);
  }
  await admitDemoRunIfNeeded({
    auth: input.auth,
    ip: input.ip,
    now: input.now,
  });

  const query = input.queryOverride ?? session.query;
  const attachments = session.snapshotJson.attachments;
  const { council, snapshot } = await resolveSnapshot({
    auth: input.auth,
    councilRef: input.councilRef,
    query,
    attachments,
    now: input.now,
  });

  const rerunSessionId = await createSessionWithJob({
    userId: input.auth.userId,
    query,
    attachments,
    snapshot,
    councilNameAtRun: council.nameAtRun,
    questionHash: hashQuestion(snapshot.userMessage),
    ingressSource: input.ingressSource,
    ingressVersion: input.ingressVersion,
    traceId: input.traceId,
    credentialCiphertext: encryptJobCredential(input.auth.openRouterKey),
  });

  return { sessionId: rerunSessionId };
}
