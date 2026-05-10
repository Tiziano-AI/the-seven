import { z } from "zod";
import { councilRefSchema, decodeCouncilRef } from "../domain/councilRef";
import {
  councilDetailPayloadSchema,
  councilsListPayloadSchema,
  demoRequestBodySchema,
  demoRequestPayloadSchema,
  duplicateCouncilBodySchema,
  duplicateCouncilPayloadSchema,
  exportSessionsBodySchema,
  exportSessionsPayloadSchema,
  modelAutocompleteBodySchema,
  modelAutocompletePayloadSchema,
  modelValidateBodySchema,
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
  updateCouncilBodySchema,
  validateKeyPayloadSchema,
} from "./schemas";

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

const noParamsSchema = z.object({}).strict();
const noQuerySchema = z.object({}).strict();
const noBodySchema = z.object({}).strict();
const redirectPayloadSchema = z.object({}).strict();
const sessionParamsSchema = z.object({ sessionId: z.coerce.number().int().positive() }).strict();
const locatorParamsSchema = z
  .object({
    locator: z
      .string()
      .min(1)
      .transform((value, context) => {
        const decoded = decodeCouncilRef(value);
        if (decoded) {
          return decoded;
        }
        context.addIssue({
          code: "custom",
          message: "Invalid council reference",
        });
        return z.NEVER;
      }),
  })
  .strict();
const demoConsumeQuerySchema = z.object({ token: z.string().trim().min(1) }).strict();

const commonDenials = [
  { kind: "invalid_input", status: 400, reason: "invalid_request" },
  { kind: "rate_limited", status: 429, reason: "rate_limited" },
  { kind: "internal_error", status: 500, reason: "internal_error" },
] as const satisfies ReadonlyArray<DenialRow>;

const authDenials = [
  { kind: "unauthorized", status: 401, reason: "missing_auth" },
  { kind: "unauthorized", status: 401, reason: "invalid_token" },
  { kind: "unauthorized", status: 401, reason: "expired_token" },
] as const satisfies ReadonlyArray<DenialRow>;

const byokDenials = [
  { kind: "forbidden", status: 403, reason: "demo_not_allowed" },
] as const satisfies ReadonlyArray<DenialRow>;

const sameOriginDenial = {
  kind: "forbidden",
  status: 403,
  reason: "same_origin_required",
} as const satisfies DenialRow;
const demoRequiredDenial = {
  kind: "forbidden",
  status: 403,
  reason: "demo_required",
} as const satisfies DenialRow;
const demoDisabledDenial = {
  kind: "forbidden",
  status: 403,
  reason: "demo_disabled",
} as const satisfies DenialRow;
const demoCouncilOnlyDenial = {
  kind: "forbidden",
  status: 403,
  reason: "demo_council_only",
} as const satisfies DenialRow;
const builtInReadOnlyDenial = {
  kind: "forbidden",
  status: 403,
  reason: "built_in_read_only",
} as const satisfies DenialRow;
const councilNotFoundDenial = {
  kind: "not_found",
  status: 404,
  reason: "council",
} as const satisfies DenialRow;
const sessionNotFoundDenial = {
  kind: "not_found",
  status: 404,
  reason: "session",
} as const satisfies DenialRow;

function route<const Contract extends RouteContract>(input: Contract): Contract {
  return input;
}

export const ROUTE_CONTRACTS = [
  route({
    id: "auth.validate",
    method: "POST",
    path: "/api/v1/auth/validate",
    resource: "auth.validate",
    auth: "byok",
    responseMode: "json",
    status: 200,
    paramsSchema: noParamsSchema,
    querySchema: noQuerySchema,
    bodySchema: noBodySchema,
    successPayloadSchema: validateKeyPayloadSchema,
    denials: [...commonDenials, ...authDenials],
  }),
  route({
    id: "demo.request",
    method: "POST",
    path: "/api/v1/demo/request",
    resource: "demo.request",
    auth: "public",
    responseMode: "json",
    status: 200,
    paramsSchema: noParamsSchema,
    querySchema: noQuerySchema,
    bodySchema: demoRequestBodySchema,
    successPayloadSchema: demoRequestPayloadSchema,
    denials: [...commonDenials, demoDisabledDenial],
  }),
  route({
    id: "demo.consume",
    method: "GET",
    path: "/api/v1/demo/consume",
    resource: "demo.consume",
    auth: "public",
    responseMode: "redirect",
    status: 303,
    paramsSchema: noParamsSchema,
    querySchema: demoConsumeQuerySchema,
    bodySchema: noBodySchema,
    successPayloadSchema: redirectPayloadSchema,
    denials: [
      ...commonDenials,
      { kind: "unauthorized", status: 401, reason: "invalid_token" },
      { kind: "unauthorized", status: 401, reason: "expired_token" },
      demoDisabledDenial,
    ],
  }),
  route({
    id: "demo.session",
    method: "GET",
    path: "/api/v1/demo/session",
    resource: "demo.session",
    auth: "demo-cookie",
    responseMode: "json",
    status: 200,
    paramsSchema: noParamsSchema,
    querySchema: noQuerySchema,
    bodySchema: noBodySchema,
    successPayloadSchema: z.object({ email: z.string().email(), expiresAt: z.number().int() }),
    denials: [...commonDenials, ...authDenials, demoRequiredDenial],
  }),
  route({
    id: "demo.logout",
    method: "POST",
    path: "/api/v1/demo/logout",
    resource: "demo.logout",
    auth: "demo-cookie",
    responseMode: "json",
    status: 200,
    paramsSchema: noParamsSchema,
    querySchema: noQuerySchema,
    bodySchema: noBodySchema,
    successPayloadSchema: successFlagPayloadSchema,
    denials: [...commonDenials, ...authDenials, demoRequiredDenial, sameOriginDenial],
  }),
  route({
    id: "councils.list",
    method: "GET",
    path: "/api/v1/councils",
    resource: "councils.list",
    auth: "any",
    responseMode: "json",
    status: 200,
    paramsSchema: noParamsSchema,
    querySchema: noQuerySchema,
    bodySchema: noBodySchema,
    successPayloadSchema: councilsListPayloadSchema,
    denials: [...commonDenials, ...authDenials, demoCouncilOnlyDenial, councilNotFoundDenial],
  }),
  route({
    id: "councils.get",
    method: "GET",
    path: "/api/v1/councils/[locator]",
    resource: "councils.get",
    auth: "any",
    responseMode: "json",
    status: 200,
    paramsSchema: locatorParamsSchema,
    querySchema: noQuerySchema,
    bodySchema: noBodySchema,
    successPayloadSchema: councilDetailPayloadSchema,
    denials: [...commonDenials, ...authDenials],
  }),
  route({
    id: "councils.duplicate",
    method: "POST",
    path: "/api/v1/councils/duplicate",
    resource: "councils.duplicate",
    auth: "byok",
    responseMode: "json",
    status: 200,
    paramsSchema: noParamsSchema,
    querySchema: noQuerySchema,
    bodySchema: duplicateCouncilBodySchema,
    successPayloadSchema: duplicateCouncilPayloadSchema,
    denials: [...commonDenials, ...authDenials, ...byokDenials, councilNotFoundDenial],
  }),
  route({
    id: "councils.update",
    method: "PUT",
    path: "/api/v1/councils/[locator]",
    resource: "councils.update",
    auth: "byok",
    responseMode: "json",
    status: 200,
    paramsSchema: locatorParamsSchema,
    querySchema: noQuerySchema,
    bodySchema: updateCouncilBodySchema,
    successPayloadSchema: successFlagPayloadSchema,
    denials: [
      ...commonDenials,
      ...authDenials,
      ...byokDenials,
      builtInReadOnlyDenial,
      councilNotFoundDenial,
    ],
  }),
  route({
    id: "councils.delete",
    method: "DELETE",
    path: "/api/v1/councils/[locator]",
    resource: "councils.delete",
    auth: "byok",
    responseMode: "json",
    status: 200,
    paramsSchema: locatorParamsSchema,
    querySchema: noQuerySchema,
    bodySchema: noBodySchema,
    successPayloadSchema: successFlagPayloadSchema,
    denials: [
      ...commonDenials,
      ...authDenials,
      ...byokDenials,
      builtInReadOnlyDenial,
      councilNotFoundDenial,
    ],
  }),
  route({
    id: "councils.outputFormats",
    method: "GET",
    path: "/api/v1/councils/output-formats",
    resource: "councils.outputFormats",
    auth: "any",
    responseMode: "json",
    status: 200,
    paramsSchema: noParamsSchema,
    querySchema: noQuerySchema,
    bodySchema: noBodySchema,
    successPayloadSchema: outputFormatsPayloadSchema,
    denials: [...commonDenials, ...authDenials, demoCouncilOnlyDenial, councilNotFoundDenial],
  }),
  route({
    id: "models.validate",
    method: "POST",
    path: "/api/v1/models/validate",
    resource: "models.validate",
    auth: "byok",
    responseMode: "json",
    status: 200,
    paramsSchema: noParamsSchema,
    querySchema: noQuerySchema,
    bodySchema: modelValidateBodySchema,
    successPayloadSchema: modelValidatePayloadSchema,
    denials: [...commonDenials, ...authDenials, ...byokDenials],
  }),
  route({
    id: "models.autocomplete",
    method: "POST",
    path: "/api/v1/models/autocomplete",
    resource: "models.autocomplete",
    auth: "byok",
    responseMode: "json",
    status: 200,
    paramsSchema: noParamsSchema,
    querySchema: noQuerySchema,
    bodySchema: modelAutocompleteBodySchema,
    successPayloadSchema: modelAutocompletePayloadSchema,
    denials: [...commonDenials, ...authDenials, ...byokDenials],
  }),
  route({
    id: "sessions.create",
    method: "POST",
    path: "/api/v1/sessions",
    resource: "sessions.create",
    auth: "any",
    responseMode: "json",
    status: 201,
    paramsSchema: noParamsSchema,
    querySchema: noQuerySchema,
    bodySchema: querySubmitBodySchema,
    successPayloadSchema: submitPayloadSchema,
    denials: [...commonDenials, ...authDenials, sessionNotFoundDenial],
  }),
  route({
    id: "sessions.list",
    method: "GET",
    path: "/api/v1/sessions",
    resource: "sessions.list",
    auth: "any",
    responseMode: "json",
    status: 200,
    paramsSchema: noParamsSchema,
    querySchema: noQuerySchema,
    bodySchema: noBodySchema,
    successPayloadSchema: sessionListPayloadSchema,
    denials: [...commonDenials, ...authDenials, sessionNotFoundDenial],
  }),
  route({
    id: "sessions.get",
    method: "GET",
    path: "/api/v1/sessions/[sessionId]",
    resource: "sessions.get",
    auth: "any",
    responseMode: "json",
    status: 200,
    paramsSchema: sessionParamsSchema,
    querySchema: noQuerySchema,
    bodySchema: noBodySchema,
    successPayloadSchema: sessionDetailPayloadSchema,
    denials: [...commonDenials, ...authDenials, sessionNotFoundDenial],
  }),
  route({
    id: "sessions.continue",
    method: "POST",
    path: "/api/v1/sessions/[sessionId]/continue",
    resource: "sessions.continue",
    auth: "any",
    responseMode: "json",
    status: 200,
    paramsSchema: sessionParamsSchema,
    querySchema: noQuerySchema,
    bodySchema: queryContinueBodySchema,
    successPayloadSchema: submitPayloadSchema,
    denials: [...commonDenials, ...authDenials, sessionNotFoundDenial],
  }),
  route({
    id: "sessions.rerun",
    method: "POST",
    path: "/api/v1/sessions/[sessionId]/rerun",
    resource: "sessions.rerun",
    auth: "any",
    responseMode: "json",
    status: 200,
    paramsSchema: sessionParamsSchema,
    querySchema: noQuerySchema,
    bodySchema: queryRerunBodySchema,
    successPayloadSchema: submitPayloadSchema,
    denials: [...commonDenials, ...authDenials],
  }),
  route({
    id: "sessions.diagnostics",
    method: "GET",
    path: "/api/v1/sessions/[sessionId]/diagnostics",
    resource: "sessions.diagnostics",
    auth: "any",
    responseMode: "json",
    status: 200,
    paramsSchema: sessionParamsSchema,
    querySchema: noQuerySchema,
    bodySchema: noBodySchema,
    successPayloadSchema: sessionDiagnosticsPayloadSchema,
    denials: [...commonDenials, ...authDenials],
  }),
  route({
    id: "sessions.export",
    method: "POST",
    path: "/api/v1/sessions/export",
    resource: "sessions.export",
    auth: "any",
    responseMode: "json",
    status: 200,
    paramsSchema: noParamsSchema,
    querySchema: noQuerySchema,
    bodySchema: exportSessionsBodySchema,
    successPayloadSchema: exportSessionsPayloadSchema,
    denials: [...commonDenials, ...authDenials],
  }),
] as const satisfies ReadonlyArray<RouteContract>;

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
