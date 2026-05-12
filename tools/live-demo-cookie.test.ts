import http from "node:http";
import { describe, expect, it } from "vitest";
import {
  assertDemoConsumeRedirect,
  assertDemoConsumeUrlOrigin,
  buildDemoConsumeTransport,
  extractDemoConsumeUrlFromEmail,
  requestDemoConsume,
} from "./live-demo-cookie";

describe("live demo cookie proof", () => {
  it("extracts the absolute consume URL from the received text email", () => {
    const consumeUrl = extractDemoConsumeUrlFromEmail({
      text: "Open the demo: https://theseven.ai/api/v1/demo/consume?token=abc_123-Z",
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

  it("sends the public Host header over loopback HTTP transport", async () => {
    let observedHost = "";
    const server = http.createServer((request, response) => {
      observedHost = request.headers.host ?? "";
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
});
