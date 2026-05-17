import { z } from "zod";
import { attachmentTextSchema } from "./attachments";
import { councilMembersSchema } from "./councilDefinition";
import { councilMemberTuningSchema } from "./councilMemberTuning";
import { councilRefSchema } from "./councilRef";
import { outputFormatsSchema, phasePromptsSchema } from "./phasePrompts";
import { providerModelRefSchema } from "./providerModels";
import { memberPositionSchema } from "./sevenMembers";

export const sessionMemberSnapshotSchema = z
  .object({
    memberPosition: memberPositionSchema,
    model: providerModelRefSchema,
    tuning: councilMemberTuningSchema.nullable(),
  })
  .strict();

export const sessionCouncilSnapshotSchema = z
  .object({
    nameAtRun: z.string().min(1).max(120),
    refAtRun: councilRefSchema.optional(),
    phasePrompts: phasePromptsSchema,
    members: councilMembersSchema,
  })
  .strict();

export const sessionSnapshotSchema = z
  .object({
    version: z.literal(1),
    createdAt: z.string().datetime(),
    query: z.string().min(1),
    userMessage: z.string().min(1),
    attachments: z.array(attachmentTextSchema),
    outputFormats: outputFormatsSchema,
    council: sessionCouncilSnapshotSchema,
  })
  .strict();

export type SessionSnapshot = z.infer<typeof sessionSnapshotSchema>;
