import {
  type CouncilMemberAssignment,
  type CouncilRef,
  decodeCouncilRef,
  encodeCouncilRef,
  routeContract,
} from "@the-seven/contracts";
import { ApiErrorResponse, apiRequest } from "./apiClient";

export function readCouncilRef(encoded: string | null) {
  return encoded ? decodeCouncilRef(encoded) : null;
}

export async function validateByokKey(apiKey: string) {
  try {
    return await apiRequest({
      route: routeContract("auth.validate"),
      authHeader: `Bearer ${apiKey}`,
    });
  } catch (error) {
    if (error instanceof ApiErrorResponse && error.kind === "unauthorized") {
      return { valid: false };
    }
    throw error;
  }
}

export async function requestDemoLink(email: string) {
  return apiRequest({
    route: routeContract("demo.request"),
    body: { email },
  });
}

export async function fetchDemoSession() {
  return apiRequest({
    route: routeContract("demo.session"),
  });
}

export async function logoutDemoSession() {
  return apiRequest({
    route: routeContract("demo.logout"),
  });
}

export async function fetchCouncils(authHeader: string | null) {
  return apiRequest({
    route: routeContract("councils.list"),
    authHeader,
  });
}

export async function fetchCouncil(authHeader: string | null, ref: CouncilRef) {
  return apiRequest({
    route: routeContract("councils.get"),
    params: { locator: encodeCouncilRef(ref) },
    authHeader,
  });
}

export async function fetchOutputFormats(authHeader: string | null) {
  return apiRequest({
    route: routeContract("councils.outputFormats"),
    authHeader,
  });
}

export async function duplicateCouncil(
  authHeader: string | null,
  source: CouncilRef,
  name: string,
) {
  return apiRequest({
    route: routeContract("councils.duplicate"),
    authHeader,
    body: { source, name },
  });
}

export async function updateCouncil(input: {
  authHeader: string;
  ref: CouncilRef;
  name: string;
  phasePrompts: { phase1: string; phase2: string; phase3: string };
  members: CouncilMemberAssignment[];
}) {
  return apiRequest({
    route: routeContract("councils.update"),
    params: { locator: encodeCouncilRef(input.ref) },
    authHeader: input.authHeader,
    body: {
      name: input.name,
      phasePrompts: input.phasePrompts,
      members: input.members,
    },
  });
}

export async function deleteCouncil(authHeader: string | null, ref: CouncilRef) {
  return apiRequest({
    route: routeContract("councils.delete"),
    params: { locator: encodeCouncilRef(ref) },
    authHeader,
  });
}

export async function validateModel(authHeader: string | null, modelId: string) {
  return apiRequest({
    route: routeContract("models.validate"),
    authHeader,
    body: { modelId },
  });
}

export async function autocompleteModels(authHeader: string | null, query: string, limit?: number) {
  return apiRequest({
    route: routeContract("models.autocomplete"),
    authHeader,
    body: { query, limit },
  });
}

export async function createSession(input: {
  authHeader: string | null;
  query: string;
  councilRef: CouncilRef;
  attachments?: Array<{ name: string; base64: string }>;
}) {
  return apiRequest({
    route: routeContract("sessions.create"),
    authHeader: input.authHeader,
    body: {
      query: input.query,
      councilRef: input.councilRef,
      attachments: input.attachments,
    },
  });
}

export async function fetchSessions(authHeader: string | null) {
  return apiRequest({
    route: routeContract("sessions.list"),
    authHeader,
  });
}

export async function fetchSession(authHeader: string | null, sessionId: number) {
  return apiRequest({
    route: routeContract("sessions.get"),
    params: { sessionId },
    authHeader,
  });
}

export async function continueSession(authHeader: string | null, sessionId: number) {
  return apiRequest({
    route: routeContract("sessions.continue"),
    params: { sessionId },
    authHeader,
  });
}

export async function rerunSession(input: {
  authHeader: string | null;
  sessionId: number;
  councilRef: CouncilRef;
  queryOverride?: string;
}) {
  return apiRequest({
    route: routeContract("sessions.rerun"),
    params: { sessionId: input.sessionId },
    authHeader: input.authHeader,
    body: {
      councilRef: input.councilRef,
      queryOverride: input.queryOverride,
    },
  });
}

export async function fetchSessionDiagnostics(authHeader: string | null, sessionId: number) {
  return apiRequest({
    route: routeContract("sessions.diagnostics"),
    params: { sessionId },
    authHeader,
  });
}

export async function exportSessions(authHeader: string | null, sessionIds: number[]) {
  return apiRequest({
    route: routeContract("sessions.export"),
    authHeader,
    body: { sessionIds },
  });
}
