import { invalidInputDetails } from "@the-seven/contracts";
import { describe, expect, test, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { jsonError } from "./envelopes";

describe("HTTP envelopes", () => {
  test("redacts public error details before writing JSON", async () => {
    const response = jsonError({
      traceId: "trace-1",
      kind: "invalid_input",
      message: "Invalid Bearer sk-or-secret-token-abcdefghijklmnopqrstuvwxyz123456",
      details: invalidInputDetails({
        reason: "invalid_request",
        issues: [
          {
            path: "body.attachments.sk-or-secret-token-abcdefghijklmnopqrstuvwxyz123456",
            message: "Invalid file sk-or-secret-token-abcdefghijklmnopqrstuvwxyz123456",
          },
        ],
      }),
      now: new Date("2026-05-12T08:00:00.000Z"),
      status: 400,
    });

    const envelope = await response.json();

    expect(envelope.message).toBe("Invalid [redacted]");
    expect(envelope.details.reason).toBe("invalid_request");
    expect(envelope.details.issues).toEqual([
      {
        path: "body.attachments.[redacted]",
        message: "Invalid file [redacted]",
      },
    ]);
  });
});
