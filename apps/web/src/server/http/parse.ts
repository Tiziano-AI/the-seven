import "server-only";

import { MAX_REQUEST_BODY_BYTES } from "@the-seven/config";
import { invalidInputDetails } from "@the-seven/contracts";
import type { ZodType } from "zod";
import { ZodError } from "zod";
import { EdgeError } from "./errors";

function rejectOversized(): never {
  throw new EdgeError({
    kind: "invalid_input",
    message: "Request body too large",
    details: invalidInputDetails([
      { path: "", message: `Body exceeds ${MAX_REQUEST_BODY_BYTES} byte limit` },
    ]),
    status: 413,
  });
}

function requireJsonContentType(request: Request) {
  const contentType = request.headers.get("content-type");
  if (!contentType?.toLowerCase().includes("application/json")) {
    throw new EdgeError({
      kind: "invalid_input",
      message: "Invalid content type",
      details: invalidInputDetails([
        { path: "headers.content-type", message: "Content-Type must be application/json" },
      ]),
      status: 415,
    });
  }
}

async function readBoundedBodyText(request: Request): Promise<string> {
  const contentLength = request.headers.get("content-length");
  if (contentLength !== null) {
    const size = Number.parseInt(contentLength, 10);
    if (!Number.isNaN(size) && size > MAX_REQUEST_BODY_BYTES) {
      rejectOversized();
    }
  }

  if (!request.body) {
    return "";
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  while (true) {
    const result = await reader.read();
    if (result.done) {
      break;
    }

    totalBytes += result.value.byteLength;
    if (totalBytes > MAX_REQUEST_BODY_BYTES) {
      rejectOversized();
    }
    chunks.push(result.value);
  }

  const body = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(body);
  } catch {
    throw new EdgeError({
      kind: "invalid_input",
      message: "Request body must be valid UTF-8",
      details: invalidInputDetails([{ path: "", message: "Request body must be valid UTF-8" }]),
      status: 400,
    });
  }
}

export async function parseJsonBody<T>(request: Request, schema: ZodType<T>): Promise<T> {
  requireJsonContentType(request);

  try {
    const text = await readBoundedBodyText(request);
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
        details: invalidInputDetails([{ path: "", message: "Request body must be valid JSON" }]),
        status: 400,
      });
    }
    if (error instanceof ZodError) {
      throw new EdgeError({
        kind: "invalid_input",
        message: "Invalid request body",
        details: invalidInputDetails(
          error.issues.map((issue) => ({
            path: issue.path.join("."),
            message: issue.message,
          })),
        ),
        status: 400,
      });
    }
    throw error;
  }
}

export async function parseNoBody(request: Request): Promise<void> {
  const text = await readBoundedBodyText(request);
  if (text.trim().length === 0) {
    return;
  }

  requireJsonContentType(request);
  try {
    const parsed = JSON.parse(text) as unknown;
    if (
      parsed &&
      typeof parsed === "object" &&
      !Array.isArray(parsed) &&
      Object.keys(parsed).length === 0
    ) {
      return;
    }
  } catch {
    throw new EdgeError({
      kind: "invalid_input",
      message: "Invalid JSON body",
      details: invalidInputDetails([{ path: "", message: "Request body must be valid JSON" }]),
      status: 400,
    });
  }

  throw new EdgeError({
    kind: "invalid_input",
    message: "Request body must be empty",
    details: invalidInputDetails([{ path: "", message: "Request body must be empty" }]),
    status: 400,
  });
}
