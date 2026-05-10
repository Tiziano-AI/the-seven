import type { CouncilMemberTuningInput } from "@the-seven/contracts";
import { afterEach, describe, expect, test, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@the-seven/config", () => ({
  buildOpenRouterAppHeaders: () => ({
    "HTTP-Referer": "http://localhost:3000",
    "X-Title": "The Seven",
  }),
  serverRuntime: () => ({
    appName: "The Seven",
    publicOrigin: "http://localhost:3000",
  }),
}));

import {
  materializeCouncilMemberTuningInput,
  type OpenRouterRequestFailedError,
  validateOpenRouterApiKey,
} from "./openrouter";

describe("OpenRouter tuning materialization", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test("denies unsupported non-null tuning without marking it sent", () => {
    const tuning = {
      temperature: 0.7,
      topP: 0.9,
      seed: null,
      verbosity: null,
      reasoningEffort: null,
      includeReasoning: null,
    } satisfies CouncilMemberTuningInput;

    const materialized = materializeCouncilMemberTuningInput(tuning, ["temperature"]);

    expect(materialized.options).toEqual({ temperature: 0.7 });
    expect(materialized.sentParameters).toEqual(["temperature"]);
    expect(materialized.deniedParameters).toEqual(["top_p"]);
  });

  test("maps transport failures to upstream provider errors", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));

    await expect(validateOpenRouterApiKey("sk-or-test")).rejects.toMatchObject({
      name: "OpenRouterRequestFailedError",
      status: null,
    } satisfies Partial<OpenRouterRequestFailedError>);
  });
});
