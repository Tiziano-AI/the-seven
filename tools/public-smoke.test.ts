import { jsonApiCacheControl } from "@the-seven/contracts";
import { describe, expect, test } from "vitest";
import { publicSmokeOrigin, runPublicSmoke } from "./public-smoke";

const TRACE_ID = "00000000-0000-4000-8000-000000000000";

function errorEnvelope() {
  return {
    schema_version: 1,
    trace_id: TRACE_ID,
    ts: "2026-05-14T00:00:00.000Z",
    kind: "unauthorized",
    message: "Missing or invalid authentication",
    details: { reason: "missing_auth" },
  };
}

describe("public smoke", () => {
  test("normalizes the public origin to a root URL", () => {
    expect(publicSmokeOrigin("https://theseven.ai/path?x=1#hash").toString()).toBe(
      "https://theseven.ai/",
    );
  });

  test("proves rendered home plus unauthenticated demo-session denial", async () => {
    const requested: string[] = [];
    const receipt = await runPublicSmoke({
      origin: "https://theseven.ai",
      fetchImpl: async (input) => {
        requested.push(String(input));
        if (String(input) === "https://theseven.ai/") {
          return new Response("<main>The Seven</main>", {
            status: 200,
            headers: { "content-type": "text/html; charset=utf-8" },
          });
        }
        return Response.json(errorEnvelope(), {
          status: 401,
          headers: { "cache-control": jsonApiCacheControl, "x-trace-id": TRACE_ID },
        });
      },
    });

    expect(requested).toEqual(["https://theseven.ai/", "https://theseven.ai/api/v1/demo/session"]);
    expect(receipt).toEqual({
      origin: "https://theseven.ai",
      home: {
        status: 200,
        contentType: "text/html; charset=utf-8",
        rendered: true,
      },
      demoSession: {
        status: 401,
        cacheControl: jsonApiCacheControl,
        traceId: TRACE_ID,
        kind: "unauthorized",
        reason: "missing_auth",
      },
    });
  });

  test("rejects a trace header that does not match the denial envelope", async () => {
    await expect(
      runPublicSmoke({
        origin: "https://theseven.ai",
        fetchImpl: async (input) => {
          if (String(input) === "https://theseven.ai/") {
            return new Response("<main>The Seven</main>", {
              status: 200,
              headers: { "content-type": "text/html" },
            });
          }
          return Response.json(errorEnvelope(), {
            status: 401,
            headers: { "cache-control": jsonApiCacheControl, "x-trace-id": "wrong-trace" },
          });
        },
      }),
    ).rejects.toThrow("trace header does not match");
  });

  test("rejects an API denial without no-store", async () => {
    await expect(
      runPublicSmoke({
        origin: "https://theseven.ai",
        fetchImpl: async (input) => {
          if (String(input) === "https://theseven.ai/") {
            return new Response("<main>The Seven</main>", {
              status: 200,
              headers: { "content-type": "text/html" },
            });
          }
          return Response.json(errorEnvelope(), {
            status: 401,
            headers: { "x-trace-id": TRACE_ID },
          });
        },
      }),
    ).rejects.toThrow("did not return Cache-Control: no-store");
  });
});
