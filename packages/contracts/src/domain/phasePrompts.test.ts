import { describe, expect, test } from "vitest";
import {
  MAX_OUTPUT_FORMAT_CHARS,
  MAX_PHASE_PROMPT_CHARS,
  outputFormatsSchema,
  phasePromptsSchema,
} from "./phasePrompts";

describe("phase prompt schemas", () => {
  test("trims prompts and output formats", () => {
    expect(
      phasePromptsSchema.parse({
        phase1: " answer ",
        phase2: " evaluate ",
        phase3: " final ",
      }),
    ).toEqual({
      phase1: "answer",
      phase2: "evaluate",
      phase3: "final",
    });

    expect(
      outputFormatsSchema.parse({
        phase1: " markdown ",
        phase2: " json ",
        phase3: " final markdown ",
      }),
    ).toEqual({
      phase1: "markdown",
      phase2: "json",
      phase3: "final markdown",
    });
  });

  test("rejects blank or oversized prompt text", () => {
    expect(
      phasePromptsSchema.safeParse({
        phase1: " ",
        phase2: "evaluate",
        phase3: "final",
      }).success,
    ).toBe(false);

    expect(
      phasePromptsSchema.safeParse({
        phase1: "a".repeat(MAX_PHASE_PROMPT_CHARS + 1),
        phase2: "evaluate",
        phase3: "final",
      }).success,
    ).toBe(false);

    expect(
      outputFormatsSchema.safeParse({
        phase1: "markdown",
        phase2: "j".repeat(MAX_OUTPUT_FORMAT_CHARS + 1),
        phase3: "final",
      }).success,
    ).toBe(false);
  });
});
