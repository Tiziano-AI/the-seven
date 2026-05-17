import { describe, expect, test } from "vitest";
import { selectOriginalCouncilRef } from "./session-rerun-default";

const commons = { kind: "built_in", slug: "commons" } as const;
const user901 = { kind: "user", councilId: 901 } as const;
const user902 = { kind: "user", councilId: 902 } as const;

describe("selectOriginalCouncilRef", () => {
  test("prefers the stored council identity over a colliding display name", () => {
    expect(
      selectOriginalCouncilRef({
        refAtRun: user901,
        councilNameAtRun: "The Commons Council",
        availableCouncils: [
          { ref: commons, name: "The Commons Council" },
          { ref: user901, name: "The Commons Council" },
        ],
      }),
    ).toBe("user:901");
  });

  test("does not guess when legacy snapshots only have an ambiguous name", () => {
    expect(
      selectOriginalCouncilRef({
        councilNameAtRun: "The Commons Council",
        availableCouncils: [
          { ref: commons, name: "The Commons Council" },
          { ref: user902, name: "The Commons Council" },
        ],
      }),
    ).toBe("");
  });
});
