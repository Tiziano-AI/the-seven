import type { Route } from "@playwright/test";
import {
  buildErrorEnvelope,
  buildSuccessEnvelope,
  forbiddenDetails,
  type invalidInputDetails,
  jsonApiCacheControl,
  notFoundDetails,
  type RouteContractId,
  routeContract,
  routeDeclaresDenial,
  unauthorizedDetails,
} from "@the-seven/contracts";

export const timestamp = "2026-05-12T10:00:00.000Z";
export const demoCookieName = "seven_demo_session";
export const proofByokKey = "sk-or-valid-browser-proof";
export const proofByokAuthorization = `Bearer ${proofByokKey}`;
export const proofDemoSessionToken = "mock-demo-session";

export function jsonHeaders(traceId: string) {
  return {
    "Cache-Control": jsonApiCacheControl,
    "X-Trace-Id": traceId,
  } as const;
}

export function successEnvelope(routeId: RouteContractId, payload: unknown) {
  const contract = routeContract(routeId);
  return buildSuccessEnvelope({
    traceId: `trace-${contract.resource}`,
    now: new Date(timestamp),
    resource: contract.resource,
    payload: contract.successPayloadSchema.parse(payload),
  });
}

/** Sends one contract-validated successful v1 API envelope for browser-flow fixtures. */
export async function fulfillSuccess(route: Route, routeId: RouteContractId, payload: unknown) {
  const contract = routeContract(routeId);
  const envelope = successEnvelope(routeId, payload);
  await route.fulfill({
    status: contract.status,
    contentType: "application/json",
    headers: jsonHeaders(envelope.trace_id),
    body: JSON.stringify(envelope),
  });
}

/** Sends one registry-declared not-found envelope for browser-flow fixtures. */
export async function fulfillNotFound(
  route: Route,
  routeId: RouteContractId,
  resource: "council" | "session",
) {
  await fulfillDeclaredDenial(route, routeId, {
    status: 404,
    kind: "not_found",
    message: "Resource not found",
    details: notFoundDetails(resource),
  });
}

function denialEnvelope(
  routeId: RouteContractId,
  input: {
    kind: "invalid_input" | "unauthorized" | "forbidden" | "not_found";
    message: string;
    details:
      | ReturnType<typeof invalidInputDetails>
      | ReturnType<typeof unauthorizedDetails>
      | ReturnType<typeof forbiddenDetails>
      | ReturnType<typeof notFoundDetails>;
  },
) {
  const contract = routeContract(routeId);
  return buildErrorEnvelope({
    traceId: `trace-${contract.resource}-${input.kind}`,
    now: new Date(timestamp),
    kind: input.kind,
    message: input.message,
    details: input.details,
  });
}

export async function fulfillDeclaredDenial(
  route: Route,
  routeId: RouteContractId,
  input: {
    status: number;
    kind: "invalid_input" | "unauthorized" | "forbidden" | "not_found";
    message: string;
    details:
      | ReturnType<typeof invalidInputDetails>
      | ReturnType<typeof unauthorizedDetails>
      | ReturnType<typeof forbiddenDetails>
      | ReturnType<typeof notFoundDetails>;
  },
) {
  const contract = routeContract(routeId);
  const envelope = denialEnvelope(routeId, input);
  if (!routeDeclaresDenial({ route: contract, status: input.status, envelope })) {
    throw new Error(`${routeId} does not declare ${input.kind}`);
  }
  await route.fulfill({
    status: input.status,
    contentType: "application/json",
    headers: jsonHeaders(envelope.trace_id),
    body: JSON.stringify(envelope),
  });
}

/** Sends a canonical unauthorized envelope for browser-flow fixtures. */
export async function fulfillUnauthorized(
  route: Route,
  routeId: RouteContractId,
  reason: "missing_auth" | "invalid_token" | "expired_token" = "missing_auth",
) {
  await fulfillDeclaredDenial(route, routeId, {
    status: 401,
    kind: "unauthorized",
    message: "Missing or invalid authentication",
    details: unauthorizedDetails(reason),
  });
}

/** Sends a canonical demo-not-allowed envelope for BYOK-only browser-flow fixtures. */
export async function fulfillDemoNotAllowed(route: Route, routeId: RouteContractId) {
  await fulfillDeclaredDenial(route, routeId, {
    status: 403,
    kind: "forbidden",
    message: "This endpoint requires BYOK authentication",
    details: forbiddenDetails("demo_not_allowed"),
  });
}

/** Sends a canonical same-origin denial for demo-cookie mutation fixtures. */
export async function fulfillSameOriginRequired(route: Route, routeId: RouteContractId) {
  await fulfillDeclaredDenial(route, routeId, {
    status: 403,
    kind: "forbidden",
    message: "Same-origin request required for cookie authentication",
    details: forbiddenDetails("same_origin_required"),
  });
}

/** Sends a canonical demo-council-only denial for browser-flow fixtures. */
export async function fulfillDemoCouncilOnly(route: Route, routeId: RouteContractId) {
  await fulfillDeclaredDenial(route, routeId, {
    status: 403,
    kind: "forbidden",
    message: "Demo mode only allows Commons Council",
    details: forbiddenDetails("demo_council_only"),
  });
}
