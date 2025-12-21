import { describe, expect, it } from "vitest";

import { formatRunSpecUserMessage } from "./sessionRunSpec";

describe("formatRunSpecUserMessage", () => {
  it("appends attachments as a Markdown block", () => {
    const out = formatRunSpecUserMessage("Question?", [
      { name: "a.txt", text: "hello" },
      { name: "b.md", text: "```js\nconsole.log('x')\n```" },
    ]);

    expect(out).toContain("Question?");
    expect(out).toContain("## Attachments");
    expect(out).toContain("### a.txt");
    expect(out).toContain("### b.md");
    // Ensure we emit a fenced code block even when content contains backticks.
    expect(out).toMatch(/`{3,}markdown/);
  });
});
