import { NextRequest } from "next/server";
import { describe, expect, test, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { createRequestMetadataContext } from "./context";

function buildRequest(headers?: Record<string, string>) {
  return new NextRequest(new Request("http://localhost/api/v1/sessions", { headers }));
}

describe("request metadata context", () => {
  test("ignores spoofable proxy client-ip headers", () => {
    const context = createRequestMetadataContext(
      buildRequest({
        "cf-connecting-ip": "198.51.100.9",
        "x-forwarded-for": "198.51.100.10, 203.0.113.1",
      }),
    );

    expect(context.ip).toBeNull();
  });

  test("uses only the direct request ip when the runtime provides one", () => {
    const request = buildRequest({ "x-forwarded-for": "198.51.100.10" });
    Object.defineProperty(request, "ip", { value: "203.0.113.42" });

    const context = createRequestMetadataContext(request);

    expect(context.ip).toBe("203.0.113.42");
  });

  test("drops malformed direct request ip values", () => {
    const request = buildRequest();
    Object.defineProperty(request, "ip", { value: "not-an-ip-address" });

    const context = createRequestMetadataContext(request);

    expect(context.ip).toBeNull();
  });
});
