import { describe, expect, test } from "vitest";
import { isLocalWorkerCommand, parseLsofCwdOutput, parseProcessTable } from "./local-processes";

describe("local process inspection", () => {
  test("parses ps rows without depending on command token count", () => {
    expect(
      parseProcessTable(`
       101   1 node /opt/homebrew/bin/pnpm local:dev
       102 101 node ./node_modules/.bin/../next/dist/bin/next dev --hostname 127.0.0.1 --port 3000
      `),
    ).toEqual([
      { pid: 101, ppid: 1, command: "node /opt/homebrew/bin/pnpm local:dev" },
      {
        pid: 102,
        ppid: 101,
        command:
          "node ./node_modules/.bin/../next/dist/bin/next dev --hostname 127.0.0.1 --port 3000",
      },
    ]);
  });

  test("matches only local dev worker commands", () => {
    expect(isLocalWorkerCommand("node /opt/homebrew/bin/pnpm local:dev")).toBe(true);
    expect(isLocalWorkerCommand("node --import tsx tools/local-dev.ts dev")).toBe(true);
    expect(isLocalWorkerCommand("node ./node_modules/.bin/../next/dist/bin/next dev")).toBe(true);
    expect(isLocalWorkerCommand("next-server (v16.2.1)")).toBe(true);
    expect(isLocalWorkerCommand("node --import tsx tools/local-dev.ts live")).toBe(false);
    expect(isLocalWorkerCommand("node /opt/homebrew/bin/pnpm test:live")).toBe(false);
  });

  test("extracts cwd from lsof field output", () => {
    expect(parseLsofCwdOutput("p123\nn/Users/tiziano/Code/the-seven/apps/web\n")).toBe(
      "/Users/tiziano/Code/the-seven/apps/web",
    );
    expect(parseLsofCwdOutput("p123\n")).toBeNull();
  });
});
