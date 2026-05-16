import { describe, expect, test, vi } from "vitest";
import { z } from "zod";

vi.mock("server-only", () => ({}));

import { parseJsonBody, parseNoBody } from "./parse";

const payloadSchema = z.object({
  name: z.string().min(1),
});

describe("parseJsonBody", () => {
  test("maps malformed JSON to invalid_input", async () => {
    await expect(
      parseJsonBody(
        new Request("https://example.com", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: '{"name":',
        }),
        payloadSchema,
      ),
    ).rejects.toMatchObject({
      kind: "invalid_input",
      status: 400,
      details: {
        reason: "invalid_json",
        issues: [{ path: "", message: "Request body must be valid JSON" }],
      },
    });
  });

  test("maps whitespace-only JSON bodies to invalid_json", async () => {
    await expect(
      parseJsonBody(
        new Request("https://example.com", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: "   ",
        }),
        payloadSchema,
      ),
    ).rejects.toMatchObject({
      kind: "invalid_input",
      status: 400,
      details: {
        reason: "invalid_json",
        issues: [{ path: "", message: "Request body must be valid JSON" }],
      },
    });
  });

  test("maps empty bodies through schema validation", async () => {
    await expect(
      parseJsonBody(
        new Request("https://example.com", {
          method: "POST",
          headers: { "content-type": "application/json" },
        }),
        payloadSchema,
      ),
    ).rejects.toMatchObject({
      kind: "invalid_input",
      status: 400,
    });
  });

  test("rejects oversized body via content-length header", async () => {
    await expect(
      parseJsonBody(
        new Request("https://example.com", {
          method: "POST",
          headers: {
            "content-length": String(1024 * 1024),
            "content-type": "application/json",
          },
          body: '{"name":"ok"}',
        }),
        payloadSchema,
      ),
    ).rejects.toMatchObject({
      kind: "invalid_input",
      status: 413,
      details: {
        reason: "body_too_large",
      },
    });
  });

  test("rejects oversized body after reading", async () => {
    const largeBody = `{"name":"${"x".repeat(600_000)}"}`;
    await expect(
      parseJsonBody(
        new Request("https://example.com", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: largeBody,
        }),
        payloadSchema,
      ),
    ).rejects.toMatchObject({
      kind: "invalid_input",
      status: 413,
      details: {
        reason: "body_too_large",
      },
    });
  });

  test("rejects non-JSON content type before parsing", async () => {
    await expect(
      parseJsonBody(
        new Request("https://example.com", {
          method: "POST",
          headers: { "content-type": "text/plain" },
          body: '{"name":"ok"}',
        }),
        payloadSchema,
      ),
    ).rejects.toMatchObject({
      kind: "invalid_input",
      status: 415,
      details: {
        reason: "invalid_content_type",
        issues: [
          {
            path: "headers.content-type",
            message: "Content-Type must be application/json",
          },
        ],
      },
    });
  });

  test("rejects content types that only mention JSON as a parameter", async () => {
    await expect(
      parseJsonBody(
        new Request("https://example.com", {
          method: "POST",
          headers: { "content-type": "text/plain; foo=application/json" },
          body: '{"name":"ok"}',
        }),
        payloadSchema,
      ),
    ).rejects.toMatchObject({
      kind: "invalid_input",
      status: 415,
      details: {
        reason: "invalid_content_type",
      },
    });
  });

  test("no-body routes reject non-empty JSON bodies", async () => {
    await expect(
      parseNoBody(
        new Request("https://example.com", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: '{"unexpected":true}',
        }),
      ),
    ).rejects.toMatchObject({
      kind: "invalid_input",
      status: 400,
      details: {
        reason: "invalid_request",
        issues: [{ path: "", message: "Request body must be empty" }],
      },
    });
  });

  test("no-body routes reject explicit empty JSON objects", async () => {
    await expect(
      parseNoBody(
        new Request("https://example.com", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: "{}",
        }),
      ),
    ).rejects.toMatchObject({
      kind: "invalid_input",
      status: 400,
      details: {
        reason: "invalid_request",
        issues: [{ path: "", message: "Request body must be empty" }],
      },
    });
  });

  test("no-body routes reject whitespace-only bodies", async () => {
    await expect(
      parseNoBody(
        new Request("https://example.com", {
          method: "POST",
          body: "   ",
        }),
      ),
    ).rejects.toMatchObject({
      kind: "invalid_input",
      status: 400,
      details: {
        reason: "invalid_request",
        issues: [{ path: "", message: "Request body must be empty" }],
      },
    });
  });
});
