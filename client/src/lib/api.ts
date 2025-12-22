import { apiRequest } from "./apiClient";
import {
  councilDetailPayloadSchema,
  councilsListPayloadSchema,
  demoConsumePayloadSchema,
  demoRequestPayloadSchema,
  duplicateCouncilPayloadSchema,
  modelAutocompletePayloadSchema,
  modelValidatePayloadSchema,
  outputFormatsPayloadSchema,
  sessionDetailPayloadSchema,
  sessionDiagnosticsPayloadSchema,
  sessionListPayloadSchema,
  submitPayloadSchema,
  successPayloadSchema,
  validateKeyPayloadSchema,
} from "./apiSchemas";
import { encodeCouncilRef, type CouncilRef } from "@shared/domain/councilRef";
import type { CouncilMemberTuning } from "@shared/domain/councilMemberTuning";

export async function validateByokKey(params: { apiKey: string }): Promise<{ valid: boolean }> {
  return apiRequest({
    path: "/api/auth/validate",
    method: "POST",
    authHeader: `Bearer ${params.apiKey}`,
    payloadSchema: validateKeyPayloadSchema,
  });
}

export async function requestDemoLink(params: { email: string }): Promise<{ email: string }> {
  return apiRequest({
    path: "/api/demo/request",
    method: "POST",
    body: { email: params.email },
    payloadSchema: demoRequestPayloadSchema,
  });
}

export async function consumeDemoLink(params: { token: string }): Promise<{ email: string; token: string; expiresAt: number }> {
  return apiRequest({
    path: "/api/demo/consume",
    method: "POST",
    body: { token: params.token },
    payloadSchema: demoConsumePayloadSchema,
  });
}

export async function fetchCouncils(params: { authHeader: string }): Promise<ReturnType<typeof councilsListPayloadSchema.parse>> {
  return apiRequest({
    path: "/api/councils",
    method: "GET",
    authHeader: params.authHeader,
    payloadSchema: councilsListPayloadSchema,
  });
}

export async function fetchCouncil(params: { authHeader: string; ref: CouncilRef }): Promise<ReturnType<typeof councilDetailPayloadSchema.parse>> {
  const encoded = encodeCouncilRef(params.ref);
  return apiRequest({
    path: `/api/councils/${encodeURIComponent(encoded)}`,
    method: "GET",
    authHeader: params.authHeader,
    payloadSchema: councilDetailPayloadSchema,
  });
}

export async function fetchOutputFormats(params: { authHeader: string }): Promise<ReturnType<typeof outputFormatsPayloadSchema.parse>> {
  return apiRequest({
    path: "/api/councils/output-formats",
    method: "GET",
    authHeader: params.authHeader,
    payloadSchema: outputFormatsPayloadSchema,
  });
}

export async function duplicateCouncil(params: { authHeader: string; source: CouncilRef; name: string }): Promise<{ councilId: number }> {
  return apiRequest({
    path: "/api/councils/duplicate",
    method: "POST",
    authHeader: params.authHeader,
    body: { source: params.source, name: params.name },
    payloadSchema: duplicateCouncilPayloadSchema,
  });
}

export async function updateCouncil(params: {
  authHeader: string;
  councilId: number;
  name: string;
  phasePrompts: { phase1: string; phase2: string; phase3: string };
  members: Array<{ memberPosition: number; model: { provider: string; modelId: string }; tuning: CouncilMemberTuning | null }>;
}): Promise<{ success: true }> {
  return apiRequest({
    path: `/api/councils/${params.councilId}`,
    method: "PUT",
    authHeader: params.authHeader,
    body: {
      name: params.name,
      phasePrompts: params.phasePrompts,
      members: params.members,
    },
    payloadSchema: successPayloadSchema,
  });
}

export async function deleteCouncil(params: { authHeader: string; councilId: number }): Promise<{ success: true }> {
  return apiRequest({
    path: `/api/councils/${params.councilId}`,
    method: "DELETE",
    authHeader: params.authHeader,
    payloadSchema: successPayloadSchema,
  });
}

export async function validateModel(params: { authHeader: string; modelId: string }): Promise<ReturnType<typeof modelValidatePayloadSchema.parse>> {
  return apiRequest({
    path: "/api/models/validate",
    method: "POST",
    authHeader: params.authHeader,
    body: { modelId: params.modelId },
    payloadSchema: modelValidatePayloadSchema,
  });
}

export async function autocompleteModels(params: { authHeader: string; query: string; limit?: number }): Promise<ReturnType<typeof modelAutocompletePayloadSchema.parse>> {
  return apiRequest({
    path: "/api/models/autocomplete",
    method: "POST",
    authHeader: params.authHeader,
    body: { query: params.query, limit: params.limit },
    payloadSchema: modelAutocompletePayloadSchema,
  });
}

export async function submitQuery(params: {
  authHeader: string;
  query: string;
  councilRef: CouncilRef;
  attachments?: Array<{ name: string; base64: string }>;
}): Promise<{ sessionId: number }> {
  return apiRequest({
    path: "/api/query/submit",
    method: "POST",
    authHeader: params.authHeader,
    body: {
      query: params.query,
      councilRef: params.councilRef,
      attachments: params.attachments,
    },
    payloadSchema: submitPayloadSchema,
  });
}

export async function continueSession(params: { authHeader: string; sessionId: number }): Promise<{ sessionId: number }> {
  return apiRequest({
    path: "/api/query/continue",
    method: "POST",
    authHeader: params.authHeader,
    body: { sessionId: params.sessionId },
    payloadSchema: submitPayloadSchema,
  });
}

export async function rerunSession(params: {
  authHeader: string;
  sessionId: number;
  councilRef: CouncilRef;
  queryOverride?: string;
}): Promise<{ sessionId: number }> {
  return apiRequest({
    path: "/api/query/rerun",
    method: "POST",
    authHeader: params.authHeader,
    body: {
      sessionId: params.sessionId,
      councilRef: params.councilRef,
      queryOverride: params.queryOverride,
    },
    payloadSchema: submitPayloadSchema,
  });
}

export async function fetchSession(params: { authHeader: string; sessionId: number }): Promise<ReturnType<typeof sessionDetailPayloadSchema.parse>> {
  return apiRequest({
    path: `/api/query/sessions/${params.sessionId}`,
    method: "GET",
    authHeader: params.authHeader,
    payloadSchema: sessionDetailPayloadSchema,
  });
}

export async function fetchSessions(params: { authHeader: string }): Promise<ReturnType<typeof sessionListPayloadSchema.parse>> {
  return apiRequest({
    path: "/api/query/sessions",
    method: "GET",
    authHeader: params.authHeader,
    payloadSchema: sessionListPayloadSchema,
  });
}

export async function fetchSessionDiagnostics(params: { authHeader: string; sessionId: number }): Promise<ReturnType<typeof sessionDiagnosticsPayloadSchema.parse>> {
  return apiRequest({
    path: `/api/query/sessions/${params.sessionId}/diagnostics`,
    method: "GET",
    authHeader: params.authHeader,
    payloadSchema: sessionDiagnosticsPayloadSchema,
  });
}
