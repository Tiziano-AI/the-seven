import { z } from "zod";
import { councilMemberTuningSchema } from "./councilMemberTuning";
import { phasePromptsSchema } from "./phasePrompts";
import { providerModelRefSchema } from "./providerModels";
import { MEMBER_POSITIONS, memberPositionSchema } from "./sevenMembers";

export const councilMemberAssignmentSchema = z
  .object({
    memberPosition: memberPositionSchema,
    model: providerModelRefSchema,
    tuning: councilMemberTuningSchema.nullable(),
  })
  .strict();

function compareCouncilMembers(
  left: z.infer<typeof councilMemberAssignmentSchema>,
  right: z.infer<typeof councilMemberAssignmentSchema>,
) {
  return left.memberPosition - right.memberPosition;
}

export const councilMembersSchema = z
  .array(councilMemberAssignmentSchema)
  .length(MEMBER_POSITIONS.length)
  .superRefine((members, ctx) => {
    const counts = new Map<number, number>();

    for (const [index, member] of members.entries()) {
      counts.set(member.memberPosition, (counts.get(member.memberPosition) ?? 0) + 1);

      if ((counts.get(member.memberPosition) ?? 0) > 1) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Council member positions must be unique",
          path: [index, "memberPosition"],
        });
      }
    }

    for (const memberPosition of MEMBER_POSITIONS) {
      if ((counts.get(memberPosition) ?? 0) === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Council must include memberPosition ${memberPosition}`,
          path: ["members"],
        });
      }
    }
  })
  .transform((members) => [...members].sort(compareCouncilMembers));

export const councilPersistedDefinitionSchema = z
  .object({
    phasePrompts: phasePromptsSchema,
    members: councilMembersSchema,
  })
  .strict();

export const councilDefinitionSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    ...councilPersistedDefinitionSchema.shape,
  })
  .strict();

export function parseCouncilMembers(input: unknown) {
  return councilMembersSchema.parse(input);
}

export function parseCouncilPersistedDefinition(input: unknown) {
  return councilPersistedDefinitionSchema.parse(input);
}

export function parseCouncilDefinition(input: unknown) {
  return councilDefinitionSchema.parse(input);
}

export type CouncilMemberAssignment = z.infer<typeof councilMemberAssignmentSchema>;
export type CouncilMembers = z.infer<typeof councilMembersSchema>;
export type CouncilPersistedDefinition = z.infer<typeof councilPersistedDefinitionSchema>;
export type CouncilDefinition = z.infer<typeof councilDefinitionSchema>;
