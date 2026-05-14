import {
  buildRoutePath,
  errorEnvelopeSchema,
  type RouteContract,
  type RoutePathParams,
  type RouteSuccessPayload,
  routeDeclaresDenial,
  successEnvelopeSchema,
} from "@the-seven/contracts";

/** Parses a registry-backed live-demo API success only when status and envelope match. */
export function parseDemoApiSuccess<Contract extends RouteContract>(input: {
  route: Contract;
  status: number;
  data: unknown;
}): RouteSuccessPayload<Contract> {
  if (input.status !== input.route.status) {
    throw new Error(
      `Demo API ${input.route.method} ${input.route.path} returned status ${input.status}; expected ${input.route.status}`,
    );
  }

  const envelope = successEnvelopeSchema.parse(input.data);
  if (envelope.result.resource !== input.route.resource) {
    throw new Error(
      `Demo API resource mismatch: expected ${input.route.resource}, received ${envelope.result.resource}`,
    );
  }
  return input.route.successPayloadSchema.parse(envelope.result.payload);
}

/** Calls registry-backed demo-cookie API routes and rejects undeclared denials. */
export async function demoApiRequest<Contract extends RouteContract>(input: {
  baseUrl: string;
  publicOrigin: string;
  cookieHeader: string;
  route: Contract;
  params?: RoutePathParams;
  body?: unknown;
}): Promise<RouteSuccessPayload<Contract>> {
  const response = await fetch(new URL(buildRoutePath(input.route, input.params), input.baseUrl), {
    method: input.route.method,
    headers: {
      "Content-Type": "application/json",
      "X-Seven-Ingress": "api",
      Cookie: input.cookieHeader,
      Origin: input.publicOrigin.replace(/\/+$/, ""),
    },
    body: input.body ? JSON.stringify(input.route.bodySchema.parse(input.body)) : undefined,
    redirect: "manual",
  });

  const raw = await response.text();
  const data = raw ? (JSON.parse(raw) as unknown) : null;
  if (!response.ok) {
    const parsedError = errorEnvelopeSchema.safeParse(data);
    if (
      !parsedError.success ||
      !routeDeclaresDenial({
        route: input.route,
        status: response.status,
        envelope: parsedError.data,
      })
    ) {
      throw new Error(
        `Demo API ${input.route.method} ${input.route.path} returned undeclared denial (${response.status}): ${raw}`,
      );
    }
    throw new Error(
      `Demo API ${input.route.method} ${input.route.path} failed (${response.status}): ${raw}`,
    );
  }

  return parseDemoApiSuccess({
    route: input.route,
    status: response.status,
    data,
  });
}
