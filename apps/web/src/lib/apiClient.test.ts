import { buildSuccessEnvelope, routeContract } from "@the-seven/contracts";
import { afterEach, describe, expect, test, vi } from "vitest";
import { apiRequest } from "./apiClient";

describe("apiRequest", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test("derives method, path, body validation, and resource validation from the route registry", async () => {
    const fetchMock = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      expect(String(url)).toBe("http://127.0.0.1:3000/api/v1/sessions/42/rerun");
      expect(init?.method).toBe("POST");
      expect(init?.body).toBe(
        JSON.stringify({ councilRef: { kind: "built_in", slug: "commons" } }),
      );
      return Response.json(
        buildSuccessEnvelope({
          traceId: "trace",
          now: new Date("2026-05-09T00:00:00.000Z"),
          resource: "sessions.rerun",
          payload: { sessionId: 43 },
        }),
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await apiRequest({
      route: routeContract("sessions.rerun"),
      params: { sessionId: 42 },
      body: { councilRef: { kind: "built_in", slug: "commons" } },
    });

    expect(result).toEqual({ sessionId: 43 });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  test("rejects resource mismatches in successful envelopes", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json(
          buildSuccessEnvelope({
            traceId: "trace",
            now: new Date("2026-05-09T00:00:00.000Z"),
            resource: "sessions.create",
            payload: { sessionId: 43 },
          }),
        ),
      ),
    );

    await expect(
      apiRequest({
        route: routeContract("sessions.rerun"),
        params: { sessionId: 42 },
        body: { councilRef: { kind: "built_in", slug: "commons" } },
      }),
    ).rejects.toThrow("API resource mismatch");
  });
});
