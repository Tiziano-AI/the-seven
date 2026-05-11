import "server-only";

import type {
  AttachmentText,
  CouncilMemberAssignment,
  OutputFormats,
  PhasePrompts,
  SessionSnapshot,
} from "@the-seven/contracts";
import { SYNTHESIZER_MEMBER_POSITION } from "@the-seven/contracts";
import { canonicalizeCouncilMembers } from "./councilDefinition";

export function formatSnapshotUserMessage(
  query: string,
  attachments: ReadonlyArray<AttachmentText>,
) {
  if (attachments.length === 0) {
    return query;
  }

  const fence = (content: string) => {
    const ticks = content.match(/`+/g);
    const maxTicks = ticks ? Math.max(...ticks.map((value) => value.length)) : 0;
    const marker = "`".repeat(Math.max(3, maxTicks + 1));
    return `${marker}text\n${content}\n${marker}\n`;
  };

  let message = query.trimEnd();
  message += "\n\nAdditional context from attachments:\n";
  for (const attachment of attachments) {
    message += `\nAttachment: ${attachment.name}\n\n`;
    message += fence(attachment.text.trimEnd());
  }
  return message;
}

export function buildSessionSnapshot(input: {
  now: Date;
  query: string;
  attachments: ReadonlyArray<AttachmentText>;
  outputFormats: OutputFormats;
  council: Readonly<{
    nameAtRun: string;
    phasePrompts: PhasePrompts;
    members: ReadonlyArray<CouncilMemberAssignment>;
  }>;
}): SessionSnapshot {
  const members = canonicalizeCouncilMembers(input.council.members);

  return {
    version: 1,
    createdAt: input.now.toISOString(),
    query: input.query,
    userMessage: formatSnapshotUserMessage(input.query, input.attachments),
    attachments: [...input.attachments],
    outputFormats: input.outputFormats,
    council: {
      nameAtRun: input.council.nameAtRun,
      phasePrompts: input.council.phasePrompts,
      members: [...members],
    },
  };
}

export function getSnapshotMember(snapshot: SessionSnapshot, memberPosition: number) {
  const found = snapshot.council.members.find((member) => member.memberPosition === memberPosition);
  if (!found) {
    throw new Error(`Missing memberPosition ${memberPosition} in session snapshot`);
  }
  return found;
}

export function buildSystemPromptForPhase(
  snapshot: SessionSnapshot,
  memberPosition: number,
  phase: 1 | 2 | 3,
): string {
  if ((phase === 1 || phase === 2) && (memberPosition < 1 || memberPosition > 6)) {
    throw new Error(`Invalid memberPosition ${memberPosition} for phase ${phase}`);
  }
  if (phase === 3 && memberPosition !== SYNTHESIZER_MEMBER_POSITION) {
    throw new Error(`Invalid memberPosition ${memberPosition} for phase 3`);
  }

  const basePrompt =
    phase === 1
      ? snapshot.council.phasePrompts.phase1
      : phase === 2
        ? snapshot.council.phasePrompts.phase2
        : snapshot.council.phasePrompts.phase3;

  const outputFormat =
    phase === 1
      ? snapshot.outputFormats.phase1
      : phase === 2
        ? snapshot.outputFormats.phase2
        : snapshot.outputFormats.phase3;

  return `${basePrompt}${outputFormat}`;
}
