import "server-only";

import type { ZodType } from "zod";
import { ZodError } from "zod";
import { EdgeError } from "./errors";

export async function parseJsonBody<T>(request: Request, schema: ZodType<T>): Promise<T> {
  try {
    const json = (await request.json()) as unknown;
    return schema.parse(json);
  } catch (error) {
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
