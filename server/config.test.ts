import { describe, expect, it } from "vitest";
import { buildSystemPrompt, getOutputFormat, getPhasePrompt, loadPromptsConfig } from "./config";

describe("prompts config", () => {
  it("loads prompts.json with the expected shape", () => {
    const config = loadPromptsConfig();
    expect(config.version).toBeDefined();
    expect(config.phasePrompts.phase1.prompt.length).toBeGreaterThan(20);
    expect(config.outputFormats.phase2.format.length).toBeGreaterThan(20);
  });

  it("provides default phase prompts for phases 1-3", () => {
    const phase1 = getPhasePrompt(1);
    const phase2 = getPhasePrompt(2);
    const phase3 = getPhasePrompt(3);

    expect(phase1).toContain("Role and Purpose");
    expect(phase1).toContain("task‑specific quality rubric");
    expect(phase2).toContain("<model_A>");
    expect(phase3).toContain("structured JSON payload");
  });

  it("provides output format specs for phases 1-3", () => {
    const phase1 = getOutputFormat(1);
    const phase2 = getOutputFormat(2);
    const phase3 = getOutputFormat(3);

    expect(phase1).toContain("## OUTPUT FORMAT");
    expect(phase1).toContain("GitHub-flavored Markdown");

    expect(phase2).toContain("## OUTPUT FORMAT");
    expect(phase2).toContain("Return exactly ONE fenced JSON code block and nothing else.");
    expect(phase2).not.toContain("exclude your own model");

    expect(phase3).toContain("## OUTPUT FORMAT");
    expect(phase3).toContain("GitHub-flavored Markdown");
    expect(phase3).not.toContain("Do not include JSON.");
  });

  it("buildSystemPrompt concatenates base prompt + format", () => {
    const base = "BASE\n";
    expect(buildSystemPrompt(base, 1)).toBe(`${base}${getOutputFormat(1)}`);
    expect(buildSystemPrompt(base, 2)).toBe(`${base}${getOutputFormat(2)}`);
    expect(buildSystemPrompt(base, 3)).toBe(`${base}${getOutputFormat(3)}`);
  });
});
