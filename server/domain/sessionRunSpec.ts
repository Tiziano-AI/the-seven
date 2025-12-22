import { z } from "zod";
import type { Attachment } from "./attachments";
import { MEMBER_POSITIONS, SYNTHESIZER_MEMBER_POSITION } from "../../shared/domain/sevenMembers";
import type { ProviderModelRef } from "../../shared/domain/providerModels";
import type { PhasePrompts } from "../../shared/domain/phasePrompts";
import { councilMemberTuningSchema } from "./councilMemberTuning";
import type { CouncilMemberTuning } from "../../shared/domain/councilMemberTuning";
import { phasePromptsSchema } from "../../shared/domain/phasePrompts";
import { providerModelRefSchema } from "../../shared/domain/providerModels";
import type { OutputPhase } from "./outputPhase";

const councilMemberSnapshotSchema = z.object({
  memberPosition: z.number().int().min(1).max(7),
  model: providerModelRefSchema,
  tuning: councilMemberTuningSchema.nullable().optional(),
});

const councilSnapshotSchema = z
  .object({
    nameAtRun: z.string().min(1).max(120),
    phasePrompts: phasePromptsSchema,
    members: z.array(councilMemberSnapshotSchema).length(7),
  })
  .superRefine((council, ctx) => {
    const seen = new Set<number>();
    for (const member of council.members) {
      if (seen.has(member.memberPosition)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["members"],
          message: `Duplicate memberPosition ${member.memberPosition}`,
        });
      }
      seen.add(member.memberPosition);
    }
    for (const required of MEMBER_POSITIONS) {
      if (!seen.has(required)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["members"],
          message: `Missing memberPosition ${required}`,
        });
      }
    }
  });

const sessionRunSpecV2Schema = z
  .object({
    version: z.literal(2),
    createdAt: z.string().min(1),
    userMessage: z.string().min(1),
    outputFormats: z.object({
      phase1: z.string().min(1),
      phase2: z.string().min(1),
      phase3: z.string().min(1),
    }),
    council: councilSnapshotSchema,
  });

export type SessionRunSpec = z.infer<typeof sessionRunSpecV2Schema>;

export function parseSessionRunSpecJson(value: string): SessionRunSpec {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value) as unknown;
  } catch {
    throw new Error("Invalid runSpec JSON");
  }
  return sessionRunSpecV2Schema.parse(parsed);
}

export function stringifySessionRunSpec(spec: SessionRunSpec): string {
  return JSON.stringify(spec);
}

export function formatRunSpecUserMessage(
  query: string,
  attachments: Attachment[]
): string {
  if (attachments.length === 0) {
    return query;
  }

  const fenceBlock = (params: { language: string; content: string }): string => {
    const matches = params.content.match(/`+/g);
    const maxTicks = matches ? Math.max(...matches.map((m) => m.length)) : 0;
    const fence = "`".repeat(Math.max(3, maxTicks + 1));
    return `${fence}${params.language}\n${params.content}\n${fence}\n`;
  };

  let fullQuery = query.trimEnd();
  fullQuery += "\n\n## Attachments\n";
  for (const attachment of attachments) {
    fullQuery += `\n### ${attachment.name}\n\n`;
    fullQuery += fenceBlock({ language: "markdown", content: attachment.text.trimEnd() });
  }
  return fullQuery;
}

export function buildSessionRunSpec(params: {
  now: Date;
  query: string;
  attachments: Attachment[];
  outputFormats: Readonly<{ phase1: string; phase2: string; phase3: string }>;
  council: Readonly<{
    nameAtRun: string;
    phasePrompts: PhasePrompts;
    members: ReadonlyArray<
      Readonly<{ memberPosition: number; model: ProviderModelRef; tuning: CouncilMemberTuning | null }>
    >;
  }>;
}): SessionRunSpec {
  const { now, query, attachments, outputFormats, council } = params;

  return {
    version: 2,
    createdAt: now.toISOString(),
    userMessage: formatRunSpecUserMessage(query, attachments),
    outputFormats,
    council: {
      nameAtRun: council.nameAtRun,
      phasePrompts: council.phasePrompts,
      members: council.members.map((member) => ({
        memberPosition: member.memberPosition,
        model: member.model,
        tuning: member.tuning,
      })),
    },
  };
}

export function getRunSpecMember(spec: SessionRunSpec, memberPosition: number) {
  const found = spec.council.members.find((member) => member.memberPosition === memberPosition);
  if (!found) {
    throw new Error(`Missing memberPosition ${memberPosition} in runSpec`);
  }
  return found;
}

export function buildSystemPromptForPhase(
  spec: SessionRunSpec,
  memberPosition: number,
  phase: OutputPhase
): string {
  if (phase === 1 || phase === 2) {
    if (memberPosition < 1 || memberPosition > 6) {
      throw new Error(`Invalid memberPosition ${memberPosition} for phase ${phase}`);
    }
  } else if (memberPosition !== SYNTHESIZER_MEMBER_POSITION) {
    throw new Error(`Invalid memberPosition ${memberPosition} for phase 3`);
  }

  const basePrompt =
    phase === 1
      ? spec.council.phasePrompts.phase1
      : phase === 2
        ? spec.council.phasePrompts.phase2
        : spec.council.phasePrompts.phase3;

  const format = phase === 1 ? spec.outputFormats.phase1 : phase === 2 ? spec.outputFormats.phase2 : spec.outputFormats.phase3;

  return `${basePrompt}${format}`;
}
