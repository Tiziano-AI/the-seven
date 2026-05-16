import type { Route } from "@playwright/test";
import {
  invalidInputDetails,
  parseIngressSource,
  type RouteBody,
  type RouteContractId,
  type RouteParams,
  type RouteQuery,
  routeContract,
} from "@the-seven/contracts";
import { fulfillDeclaredDenial } from "./browser-flow-http-core";

type RequestJson =
  | Readonly<{ kind: "empty" }>
  | Readonly<{ kind: "blank" }>
  | Readonly<{ kind: "invalid_json" }>
  | Readonly<{ kind: "json"; value: unknown }>;

type RouteForId<Id extends RouteContractId> = ReturnType<typeof routeContract<Id>>;

function requestJson(route: Route): RequestJson {
  const postData = route.request().postData();
  if (postData === null || postData.length === 0) {
    return { kind: "empty" };
  }
  if (postData.trim().length === 0) {
    return { kind: "blank" };
  }
  try {
    return { kind: "json", value: JSON.parse(postData) as unknown };
  } catch {
    return { kind: "invalid_json" };
  }
}

function requestJsonMediaType(route: Route): string | null {
  return route.request().headers()["content-type"]?.split(";", 1)[0]?.trim().toLowerCase() ?? null;
}

function zodIssues(error: { issues: ReadonlyArray<{ path: PropertyKey[]; message: string }> }) {
  return error.issues.map((issue) => ({
    path: issue.path.join("."),
    message: issue.message,
  }));
}

function buildQueryRecord(searchParams: URLSearchParams): Record<string, string | string[]> {
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

async function fulfillInvalidBody(
  route: Route,
  routeId: RouteContractId,
  input: {
    status: 400 | 415;
    reason: "invalid_request" | "invalid_json" | "invalid_content_type" | "invalid_ingress";
    message: string;
    issues: ReadonlyArray<Readonly<{ path: string; message: string }>>;
  },
) {
  await fulfillDeclaredDenial(route, routeId, {
    status: input.status,
    kind: "invalid_input",
    message: input.message,
    details: invalidInputDetails({
      reason: input.reason,
      issues: input.issues,
    }),
  });
}

/** Parses a mocked request body through the route registry before fixture mutation. */
export async function parseRouteBody<const Id extends RouteContractId>(
  route: Route,
  routeId: Id,
): Promise<RouteBody<RouteForId<Id>> | null> {
  const contract = routeContract(routeId);
  const emptyBody = contract.bodySchema.safeParse({});
  const raw = requestJson(route);
  if (emptyBody.success) {
    if (raw.kind === "empty") {
      return emptyBody.data as RouteBody<RouteForId<Id>>;
    }
    await fulfillInvalidBody(route, routeId, {
      status: 400,
      reason: "invalid_request",
      message: "Request body must be empty",
      issues: [{ path: "", message: "Request body must be empty" }],
    });
    return null;
  }
  if (requestJsonMediaType(route) !== "application/json") {
    await fulfillInvalidBody(route, routeId, {
      status: 415,
      reason: "invalid_content_type",
      message: "Invalid content type",
      issues: [{ path: "headers.content-type", message: "Content-Type must be application/json" }],
    });
    return null;
  }
  if (raw.kind === "invalid_json" || raw.kind === "blank") {
    await fulfillInvalidBody(route, routeId, {
      status: 400,
      reason: "invalid_json",
      message: "Invalid JSON body",
      issues: [{ path: "", message: "Request body must be valid JSON" }],
    });
    return null;
  }
  const parsed = contract.bodySchema.safeParse(raw.kind === "empty" ? null : raw.value);
  if (!parsed.success) {
    await fulfillInvalidBody(route, routeId, {
      status: 400,
      reason: "invalid_request",
      message: "Invalid request body",
      issues: zodIssues(parsed.error),
    });
    return null;
  }
  return parsed.data as RouteBody<RouteForId<Id>>;
}

/** Parses mocked ingress headers through the public ingress contract before fixture mutation. */
export async function parseRouteIngress(route: Route, routeId: RouteContractId): Promise<boolean> {
  const headers = route.request().headers();
  const rawSource = headers["x-seven-ingress"];
  const source = rawSource === undefined ? "web" : parseIngressSource(rawSource);
  if (!source) {
    await fulfillInvalidBody(route, routeId, {
      status: 400,
      reason: "invalid_ingress",
      message: "Invalid ingress source",
      issues: [
        {
          path: "headers.x-seven-ingress",
          message: "Ingress source must be web, cli, or api",
        },
      ],
    });
    return false;
  }

  const version = headers["x-seven-ingress-version"]?.trim();
  if (version && (/[\r\n]/u.test(version) || version.length > 120)) {
    await fulfillInvalidBody(route, routeId, {
      status: 400,
      reason: "invalid_ingress",
      message: "Invalid ingress version",
      issues: [
        {
          path: "headers.x-seven-ingress-version",
          message: "Ingress version must be single-line and at most 120 characters",
        },
      ],
    });
    return false;
  }

  return true;
}

/** Parses mocked dynamic route params through the route registry before fixture mutation. */
export async function parseRouteParams<const Id extends RouteContractId>(
  route: Route,
  routeId: Id,
  rawParams: Readonly<Record<string, string>>,
): Promise<RouteParams<RouteForId<Id>> | null> {
  const parsed = routeContract(routeId).paramsSchema.safeParse(rawParams);
  if (!parsed.success) {
    await fulfillInvalidBody(route, routeId, {
      status: 400,
      reason: "invalid_request",
      message: "Invalid path parameters",
      issues: zodIssues(parsed.error).map((issue) => ({
        path: `params.${issue.path}`,
        message: issue.message,
      })),
    });
    return null;
  }
  return parsed.data as RouteParams<RouteForId<Id>>;
}

/** Parses mocked route query through the route registry before fixture mutation. */
export async function parseRouteQuery<const Id extends RouteContractId>(
  route: Route,
  routeId: Id,
): Promise<RouteQuery<RouteForId<Id>> | null> {
  const parsed = routeContract(routeId).querySchema.safeParse(
    buildQueryRecord(new URL(route.request().url()).searchParams),
  );
  if (!parsed.success) {
    await fulfillInvalidBody(route, routeId, {
      status: 400,
      reason: "invalid_request",
      message: "Invalid query parameters",
      issues: zodIssues(parsed.error).map((issue) => ({
        path: `query.${issue.path}`,
        message: issue.message,
      })),
    });
    return null;
  }
  return parsed.data as RouteQuery<RouteForId<Id>>;
}
