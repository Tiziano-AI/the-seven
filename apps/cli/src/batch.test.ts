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
        exportFormat: "none",
        waitIntervalMs: 2_000,
        waitTimeoutMs: 1_800_000,
      },
    });
  });

  test("accepts --base-url without SEVEN_BASE_URL", () => {
    const result = parseArgs(["--file", "batch.jsonl", "--base-url", "http://127.0.0.1:43217/"], {
      baseUrl: null,
      byokKey: "key",
    });

    expect(result).toEqual({
      ok: true,
      options: {
        filePath: "batch.jsonl",
        baseUrl: "http://127.0.0.1:43217",
        concurrency: 3,
        wait: false,
        exportFormat: "none",
        waitIntervalMs: 2_000,
        waitTimeoutMs: 1_800_000,
      },
    });
  });

  test("lets --base-url override SEVEN_BASE_URL", () => {
    const result = parseArgs(["--file", "batch.jsonl", "--base-url", "http://127.0.0.1:43217/"], {
      baseUrl: "http://127.0.0.1:3000",
      byokKey: "key",
    });

    expect(result).toMatchObject({
      ok: true,
      options: {
        baseUrl: "http://127.0.0.1:43217",
      },
    });
  });

  test("rejects missing and invalid base URLs with CLI errors", () => {
    expect(
      parseArgs(["--file", "batch.jsonl"], {
        baseUrl: null,
        byokKey: "key",
      }),
    ).toEqual({
      ok: false,
      error: "Missing SEVEN_BASE_URL or --base-url URL",
    });

    expect(
      parseArgs(["--file", "batch.jsonl", "--base-url"], {
        baseUrl: null,
        byokKey: "key",
      }),
    ).toEqual({
      ok: false,
      error: "Missing --base-url URL",
    });

    expect(
      parseArgs(["--file", "batch.jsonl", "--base-url", "notaurl"], {
        baseUrl: null,
        byokKey: "key",
      }),
    ).toEqual({
      ok: false,
      error: "Invalid base URL",
    });
  });

  test("requires --wait before export", () => {
    expect(
      parseArgs(["--file", "batch.jsonl", "--export", "markdown"], {
        baseUrl: "http://127.0.0.1:3000",
        byokKey: "key",
      }),
    ).toEqual({
      ok: false,
      error: "--export requires --wait",
    });

    expect(
      parseArgs(["--file", "batch.jsonl", "--wait", "--export", "both"], {
        baseUrl: "http://127.0.0.1:3000",
        byokKey: "key",
      }),
    ).toMatchObject({
      ok: true,
      options: {
        wait: true,
        exportFormat: "both",
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
