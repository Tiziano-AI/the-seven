import "server-only";

import { randomUUID } from "node:crypto";
import { serverRuntime } from "@the-seven/config";
import {
  buildErrorEnvelope,
  forbiddenDetails,
  internalErrorDetails,
  invalidInputDetails,
  type RouteBody,
  type RouteContract,
  type RouteParams,
  type RouteQuery,
  rateLimitedDetails,
  routeDeclaresDenial,
} from "@the-seven/contracts";
import type { NextRequest, NextResponse } from "next/server";
import { redactRateLimitScope } from "../domain/redaction";
import { admitIngressFloodLimit } from "../services/ingressLimits";
import type { AuthContext } from "./auth";
import { resolveAuthContext } from "./auth";
import { createRequestMetadataContext, type RequestContext } from "./context";
import { jsonError, jsonSuccess } from "./envelopes";
import { EdgeError, mapProviderErrorToEdgeError } from "./errors";
import { parseIngressHeaders } from "./ingress";
import { parseJsonBody, parseNoBody } from "./parse";

type RawRouteParams = Promise<Readonly<Record<string, string>>> | Readonly<Record<string, string>>;

export type ParsedRouteInput<Contract extends RouteContract> = Readonly<{
  params: RouteParams<Contract>;
  query: RouteQuery<Contract>;
  body: RouteBody<Contract>;
}>;

function unauthenticatedContext(): AuthContext {
  return { kind: "none" };
}

function throwSameOriginRequired(): never {
  throw new EdgeError({
    kind: "forbidden",
    message: "Same-origin request required for cookie authentication",
    details: forbiddenDetails("same_origin_required"),
    status: 403,
  });
}

function normalizedHostname(value: string): string {
  return value.replace(/^\[/, "").replace(/\]$/, "");
}

function isLoopbackHostname(value: string): boolean {
  const hostname = normalizedHostname(value);
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

function sameOriginAdmissionKey(origin: string, nodeEnv: "development" | "production" | "test") {
  const parsed = new URL(origin);
  if (
    nodeEnv !== "production" &&
    parsed.protocol === "http:" &&
    isLoopbackHostname(parsed.hostname)
  ) {
    return `http://loopback:${parsed.port || "80"}`;
  }
  return parsed.origin;
}

function assertSameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  const referer = request.headers.get("referer");
  const fetchSite = request.headers.get("sec-fetch-site")?.trim().toLowerCase();
  const env = serverRuntime();
  const configuredOrigin = env.publicOrigin.replace(/\/+$/, "");
  const requestOrigin = request.nextUrl.origin;
  const allowed = new Set(
    env.nodeEnv === "production"
      ? [sameOriginAdmissionKey(configuredOrigin, env.nodeEnv)]
      : [
          sameOriginAdmissionKey(configuredOrigin, env.nodeEnv),
          sameOriginAdmissionKey(requestOrigin, env.nodeEnv),
        ],
  );
  const explicitOrigins = new Set<string>();
  if (origin) {
    const originValue = parseUrlOrigin(origin, env.nodeEnv);
    if (!originValue) {
      throwSameOriginRequired();
    }
    explicitOrigins.add(originValue);
  }
  if (referer) {
    const refererOrigin = parseUrlOrigin(referer, env.nodeEnv);
    if (!refererOrigin) {
      throwSameOriginRequired();
    }
    explicitOrigins.add(refererOrigin);
  }
  if (fetchSite && fetchSite !== "same-origin") {
    throwSameOriginRequired();
  }
  if (explicitOrigins.size > 1) {
    throwSameOriginRequired();
  }
  const [explicitOrigin] = explicitOrigins;
  if (explicitOrigin) {
    if (!allowed.has(explicitOrigin)) {
      throwSameOriginRequired();
    }
    return;
  }
  if (fetchSite === "same-origin") {
    return;
  }

  throwSameOriginRequired();
}

function parseUrlOrigin(
  value: string,
  nodeEnv: "development" | "production" | "test",
): string | null {
  try {
    return sameOriginAdmissionKey(new URL(value).origin, nodeEnv);
  } catch {
    return null;
  }
}

async function admitRequest(request: NextRequest, route: RouteContract): Promise<RequestContext> {
  const metadata = createRequestMetadataContext(request);
  const limited = await admitIngressFloodLimit({
    ip: metadata.ip,
    now: metadata.now,
  });
  if (limited) {
    throw new EdgeError({
      kind: "rate_limited",
      message: "Request rate limit exceeded",
      details: rateLimitedDetails({
        scope: redactRateLimitScope(limited.scope),
        limit: limited.limit,
        windowSeconds: limited.windowSeconds,
        resetAt: new Date(limited.resetAtMs).toISOString(),
      }),
      status: 429,
    });
  }

  const ctx = {
    ...metadata,
    auth:
      route.auth === "public"
        ? unauthenticatedContext()
        : await resolveAuthContext(request, metadata.now, route.auth),
  };

  if (
    request.method !== "GET" &&
    (route.auth === "demo-cookie" || (ctx.auth.kind === "demo" && route.auth !== "byok"))
  ) {
    assertSameOrigin(request);
  }

  return ctx;
}

function buildQueryRecord(searchParams: URLSearchParams) {
  const query: Record<string, string | string[]> = {};
  for (const [key, value] of searchParams.entries()) {
    const existing = query[key];
    if (typeof existing === "string") {
      query[key] = [existing, value];
    } else if (Array.isArray(existing)) {
      query[key] = [...existing, value];
    } else {
      query[key] = value;
    }
  }
  return query;
}

async function parseRouteBody<Contract extends RouteContract>(
  request: NextRequest,
  route: Contract,
): Promise<RouteBody<Contract>> {
  const emptyBody = route.bodySchema.safeParse({});
  if (emptyBody.success) {
    await parseNoBody(request);
    return emptyBody.data;
  }
  return parseJsonBody(request, route.bodySchema);
}

async function parseRouteInput<Contract extends RouteContract>(
  request: NextRequest,
  route: Contract,
  rawParams?: RawRouteParams,
): Promise<ParsedRouteInput<Contract>> {
  const paramsResult = route.paramsSchema.safeParse(rawParams ? await rawParams : {});
  if (!paramsResult.success) {
    throw new EdgeError({
      kind: "invalid_input",
      message: "Invalid path parameters",
      details: invalidInputDetails({
        reason: "invalid_request",
        issues: paramsResult.error.issues.map((issue) => ({
          path: `params.${issue.path.join(".")}`,
          message: issue.message,
        })),
      }),
      status: 400,
    });
  }

  const queryResult = route.querySchema.safeParse(buildQueryRecord(request.nextUrl.searchParams));
  if (!queryResult.success) {
    throw new EdgeError({
      kind: "invalid_input",
      message: "Invalid query parameters",
      details: invalidInputDetails({
        reason: "invalid_request",
        issues: queryResult.error.issues.map((issue) => ({
          path: `query.${issue.path.join(".")}`,
          message: issue.message,
        })),
      }),
      status: 400,
    });
  }

  const body = await parseRouteBody(request, route);
  return {
    params: paramsResult.data,
    query: queryResult.data,
    body,
  };
}

function undeclaredRouteDenial(input: { route: RouteContract; traceId: string; now: Date }) {
  return jsonError({
    traceId: input.traceId,
    kind: "internal_error",
    message: "Internal server error",
    details: internalErrorDetails(randomUUID()),
    now: input.now,
    status: 500,
  });
}

function edgeErrorToResponse(input: {
  route: RouteContract;
  error: EdgeError;
  traceId: string;
  now: Date;
}) {
  const envelope = buildErrorEnvelope({
    traceId: input.traceId,
    now: input.now,
    kind: input.error.kind,
    message: input.error.message,
    details: input.error.details,
  });
  if (
    !routeDeclaresDenial({
      route: input.route,
      status: input.error.status,
      envelope,
    })
  ) {
    return undeclaredRouteDenial(input);
  }

  return jsonError({
    traceId: input.traceId,
    kind: input.error.kind,
    message: input.error.message,
    details: input.error.details,
    now: input.now,
    status: input.error.status,
  });
}

function mapErrorToResponse(input: {
  route: RouteContract;
  error: unknown;
  traceId: string;
  now: Date;
}) {
  if (input.error instanceof EdgeError) {
    return edgeErrorToResponse({
      route: input.route,
      error: input.error,
      traceId: input.traceId,
      now: input.now,
    });
  }

  const mappedProviderError = mapProviderErrorToEdgeError(input.error);
  if (mappedProviderError) {
    return edgeErrorToResponse({
      route: input.route,
      error: mappedProviderError,
      traceId: input.traceId,
      now: input.now,
    });
  }

  if (input.error instanceof Error && input.error.name === "ZodError") {
    return jsonError({
      traceId: input.traceId,
      kind: "internal_error",
      message: "Internal server error",
      details: internalErrorDetails(randomUUID()),
      now: input.now,
      status: 500,
    });
  }

  return jsonError({
    traceId: input.traceId,
    kind: "internal_error",
    message: "Internal server error",
    details: internalErrorDetails(randomUUID()),
    now: input.now,
    status: 500,
  });
}

export async function handleRoute<Contract extends RouteContract>(
  request: NextRequest,
  input: {
    route: Contract;
    params?: RawRouteParams;
    handler: (
      ctx: RequestContext,
      request: NextRequest,
      parsed: ParsedRouteInput<Contract>,
    ) => Promise<unknown>;
  },
) {
  const fallback = { traceId: randomUUID(), now: new Date() };
  let ctx: RequestContext | null = null;

  try {
    ctx = await admitRequest(request, input.route);

    const parsed = await parseRouteInput(request, input.route, input.params);
    const payload = await input.handler(ctx, request, parsed);
    const validatedPayload = input.route.successPayloadSchema.parse(payload);
    return jsonSuccess({
      traceId: ctx.traceId,
      resource: input.route.resource,
      payload: validatedPayload,
      now: ctx.now,
      status: input.route.status,
    });
  } catch (error) {
    return mapErrorToResponse({
      error,
      route: input.route,
      traceId: ctx?.traceId ?? fallback.traceId,
      now: ctx?.now ?? fallback.now,
    });
  }
}

export async function handleRedirectRoute<Contract extends RouteContract>(
  request: NextRequest,
  input: {
    route: Contract;
    params?: RawRouteParams;
    preAdmission?: (
      request: NextRequest,
    ) => Promise<NextResponse | undefined> | NextResponse | undefined;
    handler: (
      ctx: RequestContext,
      request: NextRequest,
      parsed: ParsedRouteInput<Contract>,
    ) => Promise<NextResponse>;
  },
) {
  const fallback = { traceId: randomUUID(), now: new Date() };
  let ctx: RequestContext | null = null;

  try {
    if (input.preAdmission) {
      parseIngressHeaders(request);
      const earlyResponse = await input.preAdmission(request);
      if (earlyResponse) {
        if (earlyResponse.status !== input.route.status) {
          throw new EdgeError({
            kind: "internal_error",
            message: "Internal server error",
            details: internalErrorDetails(randomUUID()),
            status: 500,
          });
        }
        earlyResponse.headers.set("X-Trace-Id", fallback.traceId);
        return earlyResponse;
      }
    }
    ctx = await admitRequest(request, input.route);
    const parsed = await parseRouteInput(request, input.route, input.params);
    const response = await input.handler(ctx, request, parsed);
    if (input.route.responseMode !== "redirect" || response.status !== input.route.status) {
      throw new EdgeError({
        kind: "internal_error",
        message: "Internal server error",
        details: internalErrorDetails(randomUUID()),
        status: 500,
      });
    }
    response.headers.set("X-Trace-Id", ctx.traceId);
    return response;
  } catch (error) {
    return mapErrorToResponse({
      error,
      route: input.route,
      traceId: ctx?.traceId ?? fallback.traceId,
      now: ctx?.now ?? fallback.now,
    });
  }
}
