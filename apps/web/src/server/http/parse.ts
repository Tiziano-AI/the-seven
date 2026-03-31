import "server-only";

import { MAX_REQUEST_BODY_BYTES } from "@the-seven/config";
import type { ZodType } from "zod";
import { ZodError } from "zod";
import { EdgeError } from "./errors";

function rejectOversized(): never {
  throw new EdgeError({
    kind: "invalid_input",
    message: "Request body too large",
    details: {
      issues: [{ path: "", message: `Body exceeds ${MAX_REQUEST_BODY_BYTES} byte limit` }],
    },
    status: 413,
  });
}

export async function parseJsonBody<T>(request: Request, schema: ZodType<T>): Promise<T> {
  const contentLength = request.headers.get("content-length");
  if (contentLength !== null) {
    const size = Number.parseInt(contentLength, 10);
    if (!Number.isNaN(size) && size > MAX_REQUEST_BODY_BYTES) {
      rejectOversized();
    }
  }

  try {
    const text = await request.text();
    if (text.length > MAX_REQUEST_BODY_BYTES) {
      rejectOversized();
    }
    const json = text.length === 0 ? null : (JSON.parse(text) as unknown);
    return schema.parse(json);
  } catch (error) {
    if (error instanceof EdgeError) {
      throw error;
    }
    if (error instanceof SyntaxError) {
      throw new EdgeError({
        kind: "invalid_input",
        message: "Invalid JSON body",
        details: {
          issues: [{ path: "", message: "Request body must be valid JSON" }],
        },
        status: 400,
      });
    }
    if (error instanceof ZodError) {
      throw new EdgeError({
        kind: "invalid_input",
        message: "Invalid request body",
        details: {
          issues: error.issues.map((issue) => ({
            path: issue.path.join("."),
            message: issue.message,
          })),
        },
        status: 400,
      });
    }
    throw error;
  }
}
