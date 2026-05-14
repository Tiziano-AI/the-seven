import { describe, expect, test } from "vitest";
import {
  buildGateCommandArgs,
  buildLocalGateCommand,
  GATE_COMMAND_ARGS,
  GATE_UNSET_ENV_KEYS,
} from "./gate-command";

describe("local gate command", () => {
  test("uses the documented Python 3.12 uv selector", () => {
    expect(GATE_COMMAND_ARGS).toEqual(["run", "--python", "3.12", "devtools/gate.py"]);
  });

  test("forwards gate flags through the local operator surface", () => {
    expect(buildGateCommandArgs(["--full"])).toEqual([
      "run",
      "--python",
      "3.12",
      "devtools/gate.py",
      "--full",
    ]);
  });

  test("unsets reserved runtime and projection keys before invoking build and test phases", () => {
    const command = buildLocalGateCommand(["--full"]);
    expect(command.command).toBe("env");
    for (const key of GATE_UNSET_ENV_KEYS) {
      expect(command.args).toContain(key);
    }
    expect(command.args).toEqual([
      ...GATE_UNSET_ENV_KEYS.flatMap((key) => ["-u", key]),
      "uv",
      "run",
      "--python",
      "3.12",
      "devtools/gate.py",
      "--full",
    ]);
  });
});
