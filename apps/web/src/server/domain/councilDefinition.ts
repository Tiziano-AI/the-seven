import "server-only";

import {
  type CouncilDefinition,
  type CouncilMemberAssignment,
  parseCouncilDefinition,
  parseCouncilMembers,
} from "@the-seven/contracts";
import { ZodError } from "zod";
import { EdgeError } from "../http/errors";

function issuePath(path: ReadonlyArray<PropertyKey>, fallback: string) {
  if (path.length === 0) {
    return fallback;
  }
  return path.map((part) => (typeof part === "number" ? String(part) : part)).join(".");
}

function invalidCouncilInput(message: string, error: ZodError): never {
  throw new EdgeError({
    kind: "invalid_input",
    message,
    details: {
      issues: error.issues.map((issue) => ({
        path: issuePath(issue.path, "members"),
        message: issue.message,
      })),
    },
    status: 400,
  });
}

export function canonicalizeCouncilMembers(input: unknown): ReadonlyArray<CouncilMemberAssignment> {
  try {
    return parseCouncilMembers(input);
  } catch (error) {
    if (error instanceof ZodError) {
      invalidCouncilInput(
        "Council members must contain exactly one entry for each position 1-7",
        error,
      );
    }
    throw error;
  }
}

export function canonicalizeCouncilDefinition(input: unknown): CouncilDefinition {
  try {
    return parseCouncilDefinition(input);
  } catch (error) {
    if (error instanceof ZodError) {
      invalidCouncilInput("Council definition is invalid", error);
    }
    throw error;
  }
}
