import { z } from "zod";

export const REVIEWER_MEMBER_POSITIONS = [1, 2, 3, 4, 5, 6] as const;
export const SYNTHESIZER_MEMBER_POSITION = 7 as const;
export const MEMBER_POSITIONS = [
  ...REVIEWER_MEMBER_POSITIONS,
  SYNTHESIZER_MEMBER_POSITION,
] as const;

export type MemberPosition = (typeof MEMBER_POSITIONS)[number];
export type ReviewerMemberPosition = (typeof REVIEWER_MEMBER_POSITIONS)[number];
export type MemberRole = "reviewer" | "synthesizer";

export const memberPositionSchema = z.union([
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
  z.literal(5),
  z.literal(6),
  z.literal(7),
]);

export type SevenMember = Readonly<{
  position: MemberPosition;
  role: MemberRole;
  alias: string;
  label: string;
}>;

export function isMemberPosition(value: number): value is MemberPosition {
  return MEMBER_POSITIONS.includes(value as MemberPosition);
}

export function isReviewerMemberPosition(value: number): value is ReviewerMemberPosition {
  return REVIEWER_MEMBER_POSITIONS.includes(value as ReviewerMemberPosition);
}

export function memberForPosition(position: MemberPosition): SevenMember {
  const alias = String.fromCharCode(64 + position);
  if (isReviewerMemberPosition(position)) {
    return { position, role: "reviewer", alias, label: `Member ${alias}` };
  }
  return { position, role: "synthesizer", alias, label: `Member ${alias}` };
}
