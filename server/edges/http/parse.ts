import { z } from "zod";
import { EdgeError, zodIssuesToDetails } from "./errors";

export function parseJsonBody<T>(schema: z.ZodSchema<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (parsed.success) return parsed.data;
  throw new EdgeError({
    kind: "invalid_input",
    message: "Invalid request body",
    details: zodIssuesToDetails(parsed.error.issues),
    status: 400,
  });
}

export function parseQuery<T>(schema: z.ZodSchema<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (parsed.success) return parsed.data;
  throw new EdgeError({
    kind: "invalid_input",
    message: "Invalid query parameters",
    details: zodIssuesToDetails(parsed.error.issues),
    status: 400,
  });
}
