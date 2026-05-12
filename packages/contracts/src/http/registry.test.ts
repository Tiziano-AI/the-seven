import { describe, expect, test } from "vitest";
import { ROUTE_CONTRACTS } from "./registry";

const commonDenialRows = [
  { kind: "invalid_input", status: 400, reason: "invalid_request" },
  { kind: "invalid_input", status: 400, reason: "invalid_json" },
  { kind: "invalid_input", status: 400, reason: "invalid_ingress" },
  { kind: "invalid_input", status: 413, reason: "body_too_large" },
  { kind: "invalid_input", status: 415, reason: "invalid_content_type" },
  { kind: "rate_limited", status: 429, reason: "rate_limited" },
  { kind: "internal_error", status: 500, reason: "internal_error" },
] as const;

describe("route registry denials", () => {
  test("every route declares adapter-level parse and ingress denials", () => {
    for (const route of ROUTE_CONTRACTS) {
      for (const row of commonDenialRows) {
        expect(route.denials, route.id).toContainEqual(row);
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

  test("non-public mutating routes declare cookie same-origin denials", () => {
    for (const route of ROUTE_CONTRACTS) {
      if (route.auth === "public" || route.method === "GET") {
        continue;
      }

      expect(route.denials, route.id).toContainEqual({
        kind: "forbidden",
        status: 403,
        reason: "same_origin_required",
      });
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
});
