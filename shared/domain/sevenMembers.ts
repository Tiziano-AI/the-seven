export const REVIEWER_MEMBER_POSITIONS = [1, 2, 3, 4, 5, 6] as const;
export const SYNTHESIZER_MEMBER_POSITION = 7 as const;
export const MEMBER_POSITIONS = [
  ...REVIEWER_MEMBER_POSITIONS,
  SYNTHESIZER_MEMBER_POSITION,
] as const;

export type MemberPosition = (typeof MEMBER_POSITIONS)[number];
export type ReviewerMemberPosition = (typeof REVIEWER_MEMBER_POSITIONS)[number];

export type MemberRole = "reviewer" | "synthesizer";

export type SevenMember = Readonly<{
  position: MemberPosition;
  role: MemberRole;
  alias: string;
  label: string;
}>;

export function isMemberPosition(value: number): value is MemberPosition {
  return (
    value === 1 ||
    value === 2 ||
    value === 3 ||
    value === 4 ||
    value === 5 ||
    value === 6 ||
    value === 7
  );
}

export function parseMemberPosition(value: number): MemberPosition | null {
  return isMemberPosition(value) ? value : null;
}

export function isReviewerMemberPosition(value: number): value is ReviewerMemberPosition {
  return value === 1 || value === 2 || value === 3 || value === 4 || value === 5 || value === 6;
}

export function memberForPosition(position: MemberPosition): SevenMember {
  const alias =
    position === 1
      ? "A"
      : position === 2
        ? "B"
        : position === 3
          ? "C"
          : position === 4
            ? "D"
            : position === 5
              ? "E"
              : position === 6
                ? "F"
                : "G";
  if (position >= 1 && position <= 6) {
    return { position, role: "reviewer", alias, label: `Member ${alias}` };
  }

  return {
    position: SYNTHESIZER_MEMBER_POSITION,
    role: "synthesizer",
    alias,
    label: `Member ${alias}`,
  };
}
