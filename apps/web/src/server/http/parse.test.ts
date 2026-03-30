import { describe, expect, test, vi } from "vitest";
import { z } from "zod";

vi.mock("server-only", () => ({}));

import { parseJsonBody } from "./parse";

const payloadSchema = z.object({
  name: z.string().min(1),
});

describe("parseJsonBody", () => {
  test("maps malformed JSON to invalid_input", async () => {
    await expect(
      parseJsonBody(
        new Request("https://example.com", {
          method: "POST",
          body: '{"name":',
        }),
        payloadSchema,
      ),
    ).rejects.toMatchObject({
      kind: "invalid_input",
      status: 400,
      details: {
        issues: [{ path: "", message: "Request body must be valid JSON" }],
      },
    });
  });

  test("maps empty bodies through schema validation", async () => {
    await expect(
      parseJsonBody(
        new Request("https://example.com", {
          method: "POST",
        }),
        payloadSchema,
      ),
    ).rejects.toMatchObject({
      kind: "invalid_input",
      status: 400,
    });
  });
});
