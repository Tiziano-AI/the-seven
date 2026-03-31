import {
  type CouncilMemberTuning,
  type CouncilRef,
  councilDetailPayloadSchema,
  councilsListPayloadSchema,
  decodeCouncilRef,
  demoConsumePayloadSchema,
  demoRequestPayloadSchema,
  duplicateCouncilPayloadSchema,
  encodeCouncilRef,
  exportSessionsPayloadSchema,
  modelAutocompletePayloadSchema,
  modelValidatePayloadSchema,
  outputFormatsPayloadSchema,
  queryContinueBodySchema,
  queryRerunBodySchema,
  querySubmitBodySchema,
  sessionDetailPayloadSchema,
  sessionDiagnosticsPayloadSchema,
  sessionListPayloadSchema,
  submitPayloadSchema,
  successFlagPayloadSchema,
  validateKeyPayloadSchema,
} from "@the-seven/contracts";
import { apiRequest } from "./apiClient";

export function readCouncilRef(encoded: string | null) {
  return encoded ? decodeCouncilRef(encoded) : null;
}

export async function validateByokKey(apiKey: string) {
  return apiRequest({
    path: "/api/v1/auth/validate",
    method: "POST",
    authHeader: `Bearer ${apiKey}`,
    payloadSchema: validateKeyPayloadSchema,
  });
}

export async function requestDemoLink(email: string) {
  return apiRequest({
    path: "/api/v1/demo/request",
    method: "POST",
    body: { email },
    payloadSchema: demoRequestPayloadSchema,
  });
}

export async function consumeDemoLink(token: string) {
  return apiRequest({
    path: "/api/v1/demo/consume",
    method: "POST",
    body: { token },
    payloadSchema: demoConsumePayloadSchema,
  });
}

export async function fetchCouncils(authHeader: string) {
  return apiRequest({
    path: "/api/v1/councils",
    method: "GET",
    authHeader,
    payloadSchema: councilsListPayloadSchema,
  });
}

export async function fetchCouncil(authHeader: string, ref: CouncilRef) {
  return apiRequest({
    path: `/api/v1/councils/${encodeURIComponent(encodeCouncilRef(ref))}`,
    method: "GET",
    authHeader,
    payloadSchema: councilDetailPayloadSchema,
  });
}

export async function fetchOutputFormats(authHeader: string) {
  return apiRequest({
    path: "/api/v1/councils/output-formats",
    method: "GET",
    authHeader,
    payloadSchema: outputFormatsPayloadSchema,
  });
}

export async function duplicateCouncil(authHeader: string, source: CouncilRef, name: string) {
  return apiRequest({
    path: "/api/v1/councils/duplicate",
    method: "POST",
    authHeader,
    body: { source, name },
    payloadSchema: duplicateCouncilPayloadSchema,
  });
}

export async function updateCouncil(input: {
  authHeader: string;
  ref: CouncilRef;
  name: string;
  phasePrompts: { phase1: string; phase2: string; phase3: string };
  members: Array<{
    memberPosition: number;
    model: { provider: "openrouter"; modelId: string };
    tuning: CouncilMemberTuning | null;
  }>;
}) {
  return apiRequest({
    path: `/api/v1/councils/${encodeURIComponent(encodeCouncilRef(input.ref))}`,
    method: "PUT",
    authHeader: input.authHeader,
    body: {
      name: input.name,
      phasePrompts: input.phasePrompts,
      members: input.members,
    },
    payloadSchema: successFlagPayloadSchema,
  });
}

export async function deleteCouncil(authHeader: string, ref: CouncilRef) {
  return apiRequest({
    path: `/api/v1/councils/${encodeURIComponent(encodeCouncilRef(ref))}`,
    method: "DELETE",
    authHeader,
    payloadSchema: successFlagPayloadSchema,
  });
}

export async function validateModel(authHeader: string, modelId: string) {
  return apiRequest({
    path: "/api/v1/models/validate",
    method: "POST",
    authHeader,
    body: { modelId },
    payloadSchema: modelValidatePayloadSchema,
  });
}

export async function autocompleteModels(authHeader: string, query: string, limit?: number) {
  return apiRequest({
    path: "/api/v1/models/autocomplete",
    method: "POST",
    authHeader,
    body: { query, limit },
    payloadSchema: modelAutocompletePayloadSchema,
  });
}

export async function createSession(input: {
  authHeader: string;
  query: string;
  councilRef: CouncilRef;
  attachments?: Array<{ name: string; base64: string }>;
}) {
  const body = querySubmitBodySchema.parse({
    query: input.query,
    councilRef: input.councilRef,
    attachments: input.attachments,
  });

  return apiRequest({
    path: "/api/v1/sessions",
    method: "POST",
    authHeader: input.authHeader,
    body,
    payloadSchema: submitPayloadSchema,
  });
}

export async function fetchSessions(authHeader: string) {
  return apiRequest({
    path: "/api/v1/sessions",
    method: "GET",
    authHeader,
    payloadSchema: sessionListPayloadSchema,
  });
}

export async function fetchSession(authHeader: string, sessionId: number) {
  return apiRequest({
    path: `/api/v1/sessions/${sessionId}`,
    method: "GET",
    authHeader,
    payloadSchema: sessionDetailPayloadSchema,
  });
}

export async function continueSession(authHeader: string, sessionId: number) {
  return apiRequest({
    path: `/api/v1/sessions/${sessionId}/continue`,
    method: "POST",
    authHeader,
    body: queryContinueBodySchema.parse({ sessionId }),
    payloadSchema: submitPayloadSchema,
  });
}

export async function rerunSession(input: {
  authHeader: string;
  sessionId: number;
  councilRef: CouncilRef;
  queryOverride?: string;
}) {
  return apiRequest({
    path: `/api/v1/sessions/${input.sessionId}/rerun`,
    method: "POST",
    authHeader: input.authHeader,
    body: queryRerunBodySchema.parse({
      sessionId: input.sessionId,
      councilRef: input.councilRef,
      queryOverride: input.queryOverride,
    }),
    payloadSchema: submitPayloadSchema,
  });
}

export async function fetchSessionDiagnostics(authHeader: string, sessionId: number) {
  return apiRequest({
    path: `/api/v1/sessions/${sessionId}/diagnostics`,
    method: "GET",
    authHeader,
    payloadSchema: sessionDiagnosticsPayloadSchema,
  });
}

export async function exportSessions(authHeader: string, sessionIds: number[]) {
  return apiRequest({
    path: "/api/v1/sessions/export",
    method: "POST",
    authHeader,
    body: { sessionIds },
    payloadSchema: exportSessionsPayloadSchema,
  });
}
