import { RUNTIME_ENV_KEYS } from "@the-seven/config";

const RESERVED_RUNTIME_KEYS = new Set<string>(RUNTIME_ENV_KEYS);

/** Builds the parent-process environment for local operator preflight. */
export function buildLocalOperatorEnv(input: {
  assignments: ReadonlyMap<string, string>;
  env: NodeJS.ProcessEnv;
}): NodeJS.ProcessEnv {
  const env = { ...input.env };
  for (const key of RESERVED_RUNTIME_KEYS) {
    delete env[key];
  }

  return {
    ...env,
    ...Object.fromEntries(input.assignments.entries()),
    NODE_ENV: "development",
  };
}
