import http from "node:http";
import { buildSuccessEnvelope, routeContract } from "@the-seven/contracts";
import { describe, expect, it } from "vitest";
import { parseDemoApiSuccess } from "./live-demo-api";
import {
  assertDemoConsumeRedirect,
  assertDemoConsumeUrlOrigin,
  buildDemoConsumeTransport,
  extractDemoConsumeUrlFromEmail,
  requestDemoConsume,
} from "./live-demo-cookie";
import { resolveProofOrigin } from "./live-demo-origin";

describe("live demo cookie proof", () => {
  it("extracts the absolute consume URL from the received text email", () => {
    const consumeUrl = extractDemoConsumeUrlFromEmail({
      text: "Open the demo: https://theseven.ai/api/v1/demo/consume?token=abc_123-Z",
    });

    expect(consumeUrl).toBe("https://theseven.ai/api/v1/demo/consume?token=abc_123-Z");
  });

  it("extracts the absolute consume URL from an HTML email body", () => {
    const consumeUrl = extractDemoConsumeUrlFromEmail({
      text: '<a href="https://theseven.ai/docs">docs</a><a href="https://theseven.ai/api/v1/demo/consume?token=abc_123-Z">Open</a>',
    });

    expect(consumeUrl).toBe("https://theseven.ai/api/v1/demo/consume?token=abc_123-Z");
  });

  it("refuses token-only bodies so live proof cannot synthesize the origin", () => {
    expect(() =>
      extractDemoConsumeUrlFromEmail({
        text: "Open the demo: /api/v1/demo/consume?token=abc_123-Z",
      }),
    ).toThrow("Could not extract an absolute demo consume link");
  });

  it("accepts the configured public origin", () => {
    expect(() =>
      assertDemoConsumeUrlOrigin({
        consumeUrl: "https://theseven.ai/api/v1/demo/consume?token=abc_123-Z",
        publicOrigin: "https://theseven.ai",
      }),
    ).not.toThrow();
  });

  it("rejects stale localhost origins before consuming the demo link", () => {
    expect(() =>
      assertDemoConsumeUrlOrigin({
        consumeUrl: "http://localhost:8080/api/v1/demo/consume?token=abc_123-Z",
        publicOrigin: "https://theseven.ai",
      }),
    ).toThrow("Demo email consume link origin mismatch");
  });

  it("accepts consume redirects to the configured public root", () => {
    const response = new Response(null, {
      status: 303,
      headers: { location: "https://theseven.ai/" },
    });

    expect(() =>
      assertDemoConsumeRedirect({ response, publicOrigin: "https://theseven.ai" }),
    ).not.toThrow();
  });

  it("rejects consume redirects to stale localhost roots", () => {
    const response = new Response(null, {
      status: 303,
      headers: { location: "http://localhost:8080/" },
    });

    expect(() =>
      assertDemoConsumeRedirect({ response, publicOrigin: "https://theseven.ai" }),
    ).toThrow("Demo consume redirect mismatch");
  });

  it("rejects relative consume redirects instead of resolving them against the public origin", () => {
    const response = new Response(null, {
      status: 303,
      headers: { location: "/" },
    });

    expect(() =>
      assertDemoConsumeRedirect({ response, publicOrigin: "https://theseven.ai" }),
    ).toThrow("Demo consume redirect mismatch");
  });

  it("targets the configured local server while preserving the public Host authority", () => {
    const transport = buildDemoConsumeTransport({
      baseUrl: "http://127.0.0.1:3000",
      consumeUrl: "https://theseven.ai/api/v1/demo/consume?token=abc_123-Z",
      publicOrigin: "https://theseven.ai",
    });

    expect(transport.targetUrl.toString()).toBe(
      "http://127.0.0.1:3000/api/v1/demo/consume?token=abc_123-Z",
    );
    expect(transport.hostHeader).toBe("theseven.ai");
  });

  it("keeps SEVEN_PUBLIC_ORIGIN as authority for loopback and matching public transport", () => {
    expect(
      resolveProofOrigin({
        baseUrl: "http://127.0.0.1:3000",
        publicOrigin: "https://theseven.ai",
      }),
    ).toBe("https://theseven.ai");
    expect(
      resolveProofOrigin({
        baseUrl: "https://theseven.ai",
        publicOrigin: "https://theseven.ai",
      }),
    ).toBe("https://theseven.ai");
  });

  it("rejects non-loopback live transport that disagrees with the public origin", () => {
    expect(() =>
      resolveProofOrigin({
        baseUrl: "https://staging.theseven.ai",
        publicOrigin: "https://theseven.ai",
      }),
    ).toThrow("Live demo proof transport origin must match SEVEN_PUBLIC_ORIGIN");
  });

  it("sends browser ingress with the public Host header over loopback HTTP transport", async () => {
    let observedHost = "";
    let observedIngress: string | undefined;
    const server = http.createServer((request, response) => {
      observedHost = request.headers.host ?? "";
      observedIngress = request.headers["x-seven-ingress"]?.toString();
      response.statusCode = 303;
      response.setHeader("location", "https://theseven.ai/");
      response.setHeader("set-cookie", "seven_demo_session=session-token; Path=/; HttpOnly");
      response.end();
    });

    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("Test server did not expose a TCP address.");
    }

    try {
      const response = await requestDemoConsume({
        targetUrl: new URL(`http://127.0.0.1:${address.port}/api/v1/demo/consume?token=abc_123-Z`),
        hostHeader: "theseven.ai",
      });

      expect(response.status).toBe(303);
      expect(response.location).toBe("https://theseven.ai/");
      expect(response.setCookies).toEqual(["seven_demo_session=session-token; Path=/; HttpOnly"]);
      expect(observedHost).toBe("theseven.ai");
      expect(observedIngress).toBeUndefined();
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      });
    }
  });

  it("rejects HTTPS consume proof when Host override would be required", async () => {
    await expect(
      requestDemoConsume({
        targetUrl: new URL("https://127.0.0.1/api/v1/demo/consume?token=abc_123-Z"),
        hostHeader: "theseven.ai",
      }),
    ).rejects.toThrow("HTTPS demo consume proof cannot override Host");
  });

  it("rejects unsupported consume transport protocols", async () => {
    await expect(
      requestDemoConsume({
        targetUrl: new URL("ftp://127.0.0.1/api/v1/demo/consume?token=abc_123-Z"),
        hostHeader: "theseven.ai",
      }),
    ).rejects.toThrow("Unsupported demo consume transport protocol ftp:");
  });

  it("rejects live demo API success envelopes with the wrong HTTP status", () => {
    const route = routeContract("sessions.create");
    const envelope = buildSuccessEnvelope({
      traceId: "trace",
      now: new Date("2026-05-12T10:00:00.000Z"),
      resource: "sessions.create",
      payload: { sessionId: 33 },
    });

    expect(() =>
      parseDemoApiSuccess({
        route,
        status: 200,
        data: envelope,
      }),
    ).toThrow("Demo API POST /api/v1/sessions returned status 200; expected 201");
  });
});
