import { describe, expect, test } from "vitest";
import { councilMembersSchema, parseCouncilMembers } from "./councilDefinition";

function buildMember(memberPosition: number) {
  return {
    memberPosition,
    model: {
      provider: "openrouter" as const,
      modelId: `model-${memberPosition}`,
    },
    tuning: null,
  };
}

describe("councilMembersSchema", () => {
  test("sorts valid members into canonical slot order", () => {
    const members = parseCouncilMembers([7, 5, 3, 1, 6, 4, 2].map(buildMember));
    expect(members.map((member) => member.memberPosition)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  test("rejects duplicate positions", () => {
    const result = councilMembersSchema.safeParse([
      buildMember(1),
      buildMember(1),
      buildMember(2),
      buildMember(3),
      buildMember(4),
      buildMember(5),
      buildMember(6),
    ]);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.message.includes("unique"))).toBe(true);
      expect(result.error.issues.some((issue) => issue.message.includes("memberPosition 7"))).toBe(
        true,
      );
    }
  });
});
