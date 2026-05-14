import { RUNTIME_ENV_KEYS } from "@the-seven/config";

export const GATE_COMMAND_ARGS = ["run", "--python", "3.12", "devtools/gate.py"] as const;
export const GATE_UNSET_ENV_KEYS = RUNTIME_ENV_KEYS;

function buildUnsetArgs() {
  return GATE_UNSET_ENV_KEYS.flatMap((key) => ["-u", key]);
}

/** Builds the canonical local gate invocation while preserving caller-supplied gate flags. */
export function buildGateCommandArgs(args: readonly string[]): string[] {
  return [...GATE_COMMAND_ARGS, ...args];
}

/**
 * Builds the local operator gate command without leaking ambient runtime or
 * projection keys into build/test phases.
 */
export function buildLocalGateCommand(args: readonly string[]) {
  return {
    command: "env",
    args: [...buildUnsetArgs(), "uv", ...buildGateCommandArgs(args)],
  };
}
