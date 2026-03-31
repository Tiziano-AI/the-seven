import { describe, expect, test } from "vitest";
import { parseArgs, parseBatchLine, usage } from "./batch";

describe("parseArgs", () => {
  test("reads defaults from environment", () => {
    const result = parseArgs(["--file", "batch.jsonl"], {
      baseUrl: "http://127.0.0.1:4000/",
      byokKey: "key",
    });

    expect(result).toEqual({
      ok: true,
      options: {
        filePath: "batch.jsonl",
        baseUrl: "http://127.0.0.1:4000",
        concurrency: 3,
        wait: false,
        waitIntervalMs: 2_000,
        waitTimeoutMs: 1_800_000,
      },
    });
  });

  test("rejects unknown flags", () => {
    const result = parseArgs(["--file", "batch.jsonl", "--wat"], {
      baseUrl: "http://127.0.0.1:3000",
      byokKey: null,
    });

    expect(result).toEqual({
      ok: false,
      error: "Unknown argument: --wat",
    });
  });
});

describe("parseBatchLine", () => {
  test("accepts canonical query lines", () => {
    const result = parseBatchLine({
      query: "How should we price this launch?",
      councils: ["built_in:founding", "user:42"],
    });

    expect(result).toEqual({
      ok: true,
      value: {
        query: "How should we price this launch?",
        councils: ["built_in:founding", "user:42"],
      },
    });
  });

  test("rejects blank queries", () => {
    const result = parseBatchLine({
      query: "   ",
      councils: ["built_in:founding"],
    });

    expect(result.ok).toBe(false);
  });
});

describe("usage", () => {
  test("documents the canonical query field", () => {
    expect(usage()).toContain('{"query":"Your question","councils":["built_in:founding"]}');
  });
});
