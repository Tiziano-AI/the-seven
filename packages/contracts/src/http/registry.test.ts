import { describe, expect, test } from "vitest";
import { ROUTE_CONTRACTS, routeContract, routeDeclaresDenial } from "./registry";

const commonDenialRows = [
  { kind: "invalid_input", status: 400, reason: "invalid_request" },
  { kind: "invalid_input", status: 400, reason: "invalid_ingress" },
  { kind: "invalid_input", status: 413, reason: "body_too_large" },
  { kind: "rate_limited", status: 429, reason: "rate_limited" },
  { kind: "internal_error", status: 500, reason: "internal_error" },
] as const;
const jsonBodyDenialRows = [
  { kind: "invalid_input", status: 400, reason: "invalid_json" },
  { kind: "invalid_input", status: 415, reason: "invalid_content_type" },
] as const;

function usesJsonBody(route: (typeof ROUTE_CONTRACTS)[number]) {
  return !route.bodySchema.safeParse({}).success;
}

describe("route registry denials", () => {
  test("every route declares adapter-level parse and ingress denials", () => {
    for (const route of ROUTE_CONTRACTS) {
      for (const row of commonDenialRows) {
        expect(route.denials, route.id).toContainEqual(row);
      }
    }
  });

  test("JSON body denials are declared only for routes that require JSON parsing", () => {
    for (const route of ROUTE_CONTRACTS) {
      for (const row of jsonBodyDenialRows) {
        if (usesJsonBody(route)) {
          expect(route.denials, route.id).toContainEqual(row);
        } else {
          expect(route.denials, route.id).not.toContainEqual(row);
        }
      }
    }
  });

  test("demo consume declares the public-origin host admission denial", () => {
    const consume = ROUTE_CONTRACTS.find((route) => route.id === "demo.consume");

    expect(consume?.denials).toContainEqual({
      kind: "forbidden",
      status: 403,
      reason: "public_origin_required",
    });
  });

  test("routes that can mutate with demo-cookie authority declare same-origin denials", () => {
    for (const route of ROUTE_CONTRACTS) {
      if (route.auth === "public" || route.auth === "byok" || route.method === "GET") {
        continue;
      }

      expect(route.denials, route.id).toContainEqual({
        kind: "forbidden",
        status: 403,
        reason: "same_origin_required",
      });
    }
  });

  test("BYOK-only routes do not advertise cookie same-origin denials", () => {
    for (const route of ROUTE_CONTRACTS) {
      if (route.auth !== "byok") {
        continue;
      }

      expect(route.denials, route.id).not.toContainEqual({
        kind: "forbidden",
        status: 403,
        reason: "same_origin_required",
      });
    }
  });

  test("BYOK-only routes declare demo-cookie denial", () => {
    for (const route of ROUTE_CONTRACTS) {
      if (route.auth !== "byok") {
        continue;
      }

      expect(route.denials, route.id).toContainEqual({
        kind: "forbidden",
        status: 403,
        reason: "demo_not_allowed",
      });
    }
  });

  test("public request body schemas reject extra keys instead of stripping them", () => {
    const bodyFixtures = new Map<string, unknown>([
      ["demo.request", { email: "demo@example.com", extra: true }],
      [
        "councils.duplicate",
        { source: { kind: "built_in", slug: "commons" }, name: "Copy", extra: true },
      ],
      [
        "councils.update",
        {
          name: "Council",
          phasePrompts: { phase1: "one", phase2: "two", phase3: "three" },
          members: [1, 2, 3, 4, 5, 6, 7].map((memberPosition) => ({
            memberPosition,
            model: { provider: "openrouter", modelId: `provider/model-${memberPosition}` },
            tuning: null,
          })),
          extra: true,
        },
      ],
      ["models.validate", { modelId: "provider/model", extra: true }],
      ["models.autocomplete", { query: "provider", limit: 3, extra: true }],
      [
        "sessions.create",
        { query: "Question", councilRef: { kind: "built_in", slug: "commons" }, extra: true },
      ],
      ["sessions.rerun", { councilRef: { kind: "built_in", slug: "commons" }, extra: true }],
      ["sessions.export", { sessionIds: [1], extra: true }],
    ]);

    for (const [id, body] of bodyFixtures) {
      const route = ROUTE_CONTRACTS.find((candidate) => candidate.id === id);
      expect(route?.bodySchema.safeParse(body).success, id).toBe(false);
    }
  });

  test("registry rows describe route-owned denials without stale read-only denials", () => {
    const route = (id: string) => ROUTE_CONTRACTS.find((candidate) => candidate.id === id);

    expect(route("councils.get")?.denials).toEqual(
      expect.arrayContaining([
        { kind: "forbidden", status: 403, reason: "demo_council_only" },
        { kind: "not_found", status: 404, reason: "council" },
      ]),
    );
    expect(route("councils.list")?.denials).not.toContainEqual({
      kind: "not_found",
      status: 404,
      reason: "council",
    });
    expect(route("councils.outputFormats")?.denials).not.toContainEqual({
      kind: "forbidden",
      status: 403,
      reason: "demo_council_only",
    });
    for (const id of ["sessions.rerun", "sessions.diagnostics", "sessions.export"]) {
      expect(route(id)?.denials, id).toContainEqual({
        kind: "not_found",
        status: 404,
        reason: "session",
      });
    }
    expect(route("sessions.rerun")?.denials).toContainEqual({
      kind: "not_found",
      status: 404,
      reason: "council",
    });
    expect(route("demo.request")?.denials).toContainEqual({
      kind: "upstream_error",
      status: 502,
      reason: "resend",
    });
    expect(route("models.validate")?.denials).toContainEqual({
      kind: "upstream_error",
      status: 502,
      reason: "openrouter",
    });
  });

  test("route denial matcher rejects undeclared upstream denials", () => {
    expect(
      routeDeclaresDenial({
        route: routeContract("models.validate"),
        status: 502,
        envelope: {
          schema_version: 1,
          trace_id: "trace",
          ts: "2026-05-12T10:00:00.000Z",
          kind: "upstream_error",
          message: "OpenRouter request failed",
          details: { service: "openrouter" },
        },
      }),
    ).toBe(true);

    expect(
      routeDeclaresDenial({
        route: routeContract("demo.logout"),
        status: 502,
        envelope: {
          schema_version: 1,
          trace_id: "trace",
          ts: "2026-05-12T10:00:00.000Z",
          kind: "upstream_error",
          message: "OpenRouter request failed",
          details: { service: "openrouter" },
        },
      }),
    ).toBe(false);
  });

  test("route denial matcher accepts declared internal errors", () => {
    expect(
      routeDeclaresDenial({
        route: routeContract("demo.logout"),
        status: 500,
        envelope: {
          schema_version: 1,
          trace_id: "trace",
          ts: "2026-05-12T10:00:00.000Z",
          kind: "internal_error",
          message: "Internal server error",
          details: { errorId: "opaque-error-id" },
        },
      }),
    ).toBe(true);
  });

  test("route denial matcher requires exact invalid_input reasons", () => {
    const baseEnvelope = {
      schema_version: 1 as const,
      trace_id: "trace",
      ts: "2026-05-12T10:00:00.000Z",
      kind: "invalid_input" as const,
      message: "Invalid request",
    };

    expect(
      routeDeclaresDenial({
        route: routeContract("sessions.create"),
        status: 400,
        envelope: {
          ...baseEnvelope,
          details: {
            reason: "invalid_request",
            issues: [{ path: "body.query", message: "Required" }],
          },
        },
      }),
    ).toBe(true);

    expect(
      routeDeclaresDenial({
        route: routeContract("sessions.create"),
        status: 413,
        envelope: {
          ...baseEnvelope,
          details: {
            reason: "invalid_request",
            issues: [{ path: "", message: "Body exceeds byte limit" }],
          },
        },
      }),
    ).toBe(false);

    expect(
      routeDeclaresDenial({
        route: routeContract("sessions.create"),
        status: 413,
        envelope: {
          ...baseEnvelope,
          details: {
            reason: "body_too_large",
            issues: [{ path: "", message: "Body exceeds byte limit" }],
          },
        },
      }),
    ).toBe(true);
  });
});
