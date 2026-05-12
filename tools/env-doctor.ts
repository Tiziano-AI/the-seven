import { existsSync, readFileSync, statSync } from "node:fs";
import {
  LIVE_PROOF_REQUIRED_KEYS,
  liveProof,
  OPERATOR_DOCTOR_REQUIRED_KEYS,
  operatorDoctor,
  RUNTIME_ENV_KEYS,
} from "@the-seven/config";
import type { OperatorCheckResult } from "./local-postgres";

const PLACEHOLDER_PATTERN = /replace-with|change-me|changeme|example\.com|your-|<.*>/i;
const SECRET_FILE_MAX_MODE = 0o600;

export function readEnvAssignments(filePath: string) {
  if (!existsSync(filePath)) {
    return new Map<string, string>();
  }
  return new Map(
    readFileSync(filePath, "utf8")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.startsWith("#") && line.includes("="))
      .map((line) => {
        const separatorIndex = line.indexOf("=");
        return [line.slice(0, separatorIndex), line.slice(separatorIndex + 1)];
      }),
  );
}

function assignmentsToEnv(assignments: ReadonlyMap<string, string>): NodeJS.ProcessEnv {
  return {
    NODE_ENV: process.env.NODE_ENV ?? "development",
    ...Object.fromEntries(assignments.entries()),
  };
}

function assignmentsToLiveProfileEnv(assignments: ReadonlyMap<string, string>): NodeJS.ProcessEnv {
  const env = assignmentsToEnv(assignments);
  if (!env.SEVEN_BASE_URL) {
    env.SEVEN_BASE_URL = "http://127.0.0.1:1";
  }
  return env;
}

function formatZodFailure(error: unknown) {
  if (error && typeof error === "object" && "issues" in error && Array.isArray(error.issues)) {
    return error.issues
      .map((issue) => {
        if (issue && typeof issue === "object" && "path" in issue && "message" in issue) {
          const path = Array.isArray(issue.path) ? issue.path.join(".") : String(issue.path);
          return `${path || "env"}: ${String(issue.message)}`;
        }
        return "invalid env value";
      })
      .join(", ");
  }
  return error instanceof Error ? error.message : "invalid env profile";
}

function missingKeys(
  assignments: ReadonlyMap<string, string>,
  keys: ReadonlyArray<string>,
): string[] {
  return keys.filter((key) => {
    const value = assignments.get(key);
    return typeof value !== "string" || value.trim().length === 0;
  });
}

function placeholderKeys(assignments: ReadonlyMap<string, string>, keys: ReadonlyArray<string>) {
  return keys.filter((key) => {
    const value = assignments.get(key);
    return typeof value === "string" && PLACEHOLDER_PATTERN.test(value);
  });
}

export function checkEnvFilePresence(input: {
  envLocalPath: string;
  envLegacyPath: string;
}): OperatorCheckResult {
  if (existsSync(input.envLocalPath)) {
    return {
      label: ".env.local",
      ok: true,
      detail: ".env.local is present",
      fix: null,
    };
  }

  const detail = existsSync(input.envLegacyPath)
    ? ".env.local is missing; legacy .env is present"
    : ".env.local is missing";
  return {
    label: ".env.local",
    ok: false,
    detail,
    fix: "Create `.env.local` from `.env.local.example` before running local commands.",
  };
}

export function checkEnvFileMode(filePath: string): OperatorCheckResult {
  if (!existsSync(filePath)) {
    return {
      label: ".env.local mode",
      ok: false,
      detail: ".env.local is missing",
      fix: "Create `.env.local` with mode 0600.",
    };
  }

  const mode = statSync(filePath).mode & 0o777;
  const ok = (mode & ~SECRET_FILE_MAX_MODE) === 0;
  return {
    label: ".env.local mode",
    ok,
    detail: `mode ${mode.toString(8).padStart(4, "0")}`,
    fix: ok ? null : "Run `chmod 600 .env.local`.",
  };
}

export function checkLegacyEnvRuntimeKeys(envLegacyPath: string): OperatorCheckResult {
  if (!existsSync(envLegacyPath)) {
    return {
      label: ".env runtime keys",
      ok: true,
      detail: "legacy .env is absent",
      fix: null,
    };
  }

  const assignments = readEnvAssignments(envLegacyPath);
  const present = RUNTIME_ENV_KEYS.filter((key) => assignments.has(key));
  return {
    label: ".env runtime keys",
    ok: present.length === 0,
    detail: present.length === 0 ? "legacy .env has no runtime keys" : present.join(", "),
    fix: present.length === 0 ? null : "Delete `.env` or move runtime keys into `.env.local`.",
  };
}

export function checkEnvProfile(input: {
  envLocalPath: string;
  live: boolean;
}): OperatorCheckResult {
  const assignments = readEnvAssignments(input.envLocalPath);
  const requiredKeys = input.live ? LIVE_PROOF_REQUIRED_KEYS : OPERATOR_DOCTOR_REQUIRED_KEYS;
  const missing = missingKeys(assignments, requiredKeys);
  if (missing.length > 0) {
    return {
      label: input.live ? ".env.local live keys" : ".env.local local keys",
      ok: false,
      detail: missing.join(", "),
      fix: input.live
        ? "Fill live-proof keys from `.env.live.example`."
        : "Fill local development keys from `.env.local.example`.",
    };
  }

  const placeholders = placeholderKeys(assignments, requiredKeys);
  if (placeholders.length > 0) {
    return {
      label: input.live ? ".env.local live keys" : ".env.local local keys",
      ok: false,
      detail: `placeholder values: ${placeholders.join(", ")}`,
      fix: "Replace placeholder credential values before running operator commands.",
    };
  }

  try {
    if (input.live) {
      liveProof(assignmentsToLiveProfileEnv(assignments));
    } else {
      operatorDoctor(assignmentsToEnv(assignments));
    }
  } catch (error) {
    return {
      label: input.live ? ".env.local live keys" : ".env.local local keys",
      ok: false,
      detail: formatZodFailure(error),
      fix: input.live
        ? "Fill live-proof keys from `.env.live.example`."
        : "Fill local development keys from `.env.local.example`.",
    };
  }

  return {
    label: input.live ? ".env.local live keys" : ".env.local local keys",
    ok: true,
    detail: input.live ? "live proof keys are present" : "local development keys are present",
    fix: null,
  };
}
