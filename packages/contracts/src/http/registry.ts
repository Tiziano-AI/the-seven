import type { z } from "zod";
import { councilRefSchema } from "../domain/councilRef";
import type { ErrorEnvelope } from "./errors";
import { ROUTE_CONTRACTS } from "./registryRoutes";

export const HTTP_METHODS = ["GET", "POST", "PUT", "DELETE"] as const;
export const AUTH_POLICIES = ["public", "any", "byok", "demo-cookie"] as const;
export const RESPONSE_MODES = ["json", "redirect"] as const;

export type HttpMethod = (typeof HTTP_METHODS)[number];
export type AuthPolicy = (typeof AUTH_POLICIES)[number];
export type ResponseMode = (typeof RESPONSE_MODES)[number];

export type DenialRow = Readonly<{
  kind:
    | "invalid_input"
    | "unauthorized"
    | "forbidden"
    | "not_found"
    | "rate_limited"
    | "upstream_error"
    | "internal_error";
  status: number;
  reason: string;
}>;

export type RouteContract<
  Params = unknown,
  Query = unknown,
  Body = unknown,
  SuccessPayload = unknown,
> = Readonly<{
  id: string;
  method: HttpMethod;
  path: string;
  resource: string;
  auth: AuthPolicy;
  responseMode: ResponseMode;
  status: number;
  paramsSchema: z.ZodType<Params>;
  querySchema: z.ZodType<Query>;
  bodySchema: z.ZodType<Body>;
  successPayloadSchema: z.ZodType<SuccessPayload>;
  denials: ReadonlyArray<DenialRow>;
}>;

export type RouteParams<Contract extends RouteContract> = Contract["paramsSchema"]["_output"];
export type RouteQuery<Contract extends RouteContract> = Contract["querySchema"]["_output"];
export type RouteBody<Contract extends RouteContract> = Contract["bodySchema"]["_output"];
export type RouteSuccessPayload<Contract extends RouteContract> =
  Contract["successPayloadSchema"]["_output"];

export { ROUTE_CONTRACTS };
export type RouteContractId = (typeof ROUTE_CONTRACTS)[number]["id"];

/** Returns one route contract by stable id. Missing ids are programmer errors. */
export function routeContract<const Id extends RouteContractId>(
  id: Id,
): Extract<(typeof ROUTE_CONTRACTS)[number], { id: Id }> {
  const found = ROUTE_CONTRACTS.find((candidate) => candidate.id === id);
  if (!found) {
    throw new Error(`Unknown route contract ${id}`);
  }
  return found as Extract<(typeof ROUTE_CONTRACTS)[number], { id: Id }>;
}

export type RoutePathParams = Readonly<Record<string, string | number>>;

function denialDetailReason(details: ErrorEnvelope["details"]): string | null {
  if ("reason" in details && typeof details.reason === "string") {
    return details.reason;
  }
  if ("scope" in details && typeof details.scope === "string") {
    return "rate_limited";
  }
  if ("resource" in details && typeof details.resource === "string") {
    return details.resource;
  }
  if ("service" in details && typeof details.service === "string") {
    return details.service;
  }
  if ("errorId" in details && typeof details.errorId === "string") {
    return "internal_error";
  }
  return null;
}

/** Returns whether an emitted public error is declared by one route registry row. */
export function routeDeclaresDenial(input: {
  route: RouteContract;
  status: number;
  envelope: ErrorEnvelope;
}): boolean {
  const reason = denialDetailReason(input.envelope.details);
  if (reason === null) {
    return false;
  }
  return input.route.denials.some((row) => {
    if (row.kind !== input.envelope.kind || row.status !== input.status) {
      return false;
    }
    return row.reason === reason;
  });
}

/** Builds a canonical concrete path from a registry route row and path params. */
export function buildRoutePath(route: RouteContract, params: RoutePathParams = {}) {
  return route.path.replace(/\[([^\]]+)\]/g, (_match, key: string) => {
    const value = params[key];
    if (value === undefined) {
      throw new Error(`Missing path parameter ${key} for ${route.id}`);
    }
    return encodeURIComponent(String(value));
  });
}

export { councilRefSchema };
