import "server-only";

import {
  BUILT_IN_COUNCILS,
  DEFAULT_OUTPUT_FORMATS,
  DEFAULT_PHASE_PROMPTS,
} from "@the-seven/config";
import type {
  CouncilMemberTuning,
  CouncilRef,
  OutputFormats,
  PhasePrompts,
  ProviderModelRef,
} from "@the-seven/contracts";
import {
  createCouncil,
  deleteCouncil,
  getUserCouncilWithMembers,
  listUserCouncils,
  updateCouncil,
} from "@the-seven/db";

export type CouncilSnapshot = Readonly<{
  nameAtRun: string;
  phasePrompts: PhasePrompts;
  members: ReadonlyArray<
    Readonly<{
      memberPosition: number;
      model: ProviderModelRef;
      tuning: CouncilMemberTuning | null;
    }>
  >;
}>;

export async function listCouncils(userId: number) {
  const builtIns = Object.values(BUILT_IN_COUNCILS).map((council) => ({
    ref: { kind: "built_in", slug: council.slug } as const,
    name: council.name,
    description: council.description,
    editable: false,
    deletable: false,
  }));

  const userCouncils = await listUserCouncils(userId);
  return [
    ...builtIns,
    ...userCouncils.map((council) => ({
      ref: { kind: "user", councilId: council.id } as const,
      name: council.name,
      description: null,
      editable: true,
      deletable: true,
    })),
  ];
}

export async function resolveCouncilSnapshot(input: {
  userId: number;
  ref: CouncilRef;
}): Promise<CouncilSnapshot> {
  if (input.ref.kind === "built_in") {
    const council = BUILT_IN_COUNCILS[input.ref.slug];
    return {
      nameAtRun: council.name,
      phasePrompts: {
        phase1: DEFAULT_PHASE_PROMPTS.phase1,
        phase2: DEFAULT_PHASE_PROMPTS.phase2,
        phase3: DEFAULT_PHASE_PROMPTS.phase3,
      },
      members: Object.entries(council.members).map(([memberPosition, model]) => ({
        memberPosition: Number(memberPosition),
        model,
        tuning: null,
      })),
    };
  }

  const stored = await getUserCouncilWithMembers({
    userId: input.userId,
    councilId: input.ref.councilId,
  });
  if (!stored) {
    throw new Error("Council not found");
  }

  return {
    nameAtRun: stored.council.name,
    phasePrompts: {
      phase1: stored.council.phase1Prompt,
      phase2: stored.council.phase2Prompt,
      phase3: stored.council.phase3Prompt,
    },
    members: stored.members.map((member) => ({
      memberPosition: member.memberPosition,
      model: {
        provider: member.provider,
        modelId: member.modelId,
      },
      tuning: (member.tuningJson as CouncilMemberTuning | null) ?? null,
    })),
  };
}

export function getOutputFormats(): OutputFormats {
  return { ...DEFAULT_OUTPUT_FORMATS };
}

export async function duplicateCouncilFromSnapshot(input: {
  userId: number;
  name: string;
  snapshot: CouncilSnapshot;
}) {
  return createCouncil({
    userId: input.userId,
    name: input.name,
    phase1Prompt: input.snapshot.phasePrompts.phase1,
    phase2Prompt: input.snapshot.phasePrompts.phase2,
    phase3Prompt: input.snapshot.phasePrompts.phase3,
    members: input.snapshot.members.map((member) => ({
      memberPosition: member.memberPosition,
      provider: member.model.provider,
      modelId: member.model.modelId,
      tuningJson: member.tuning,
    })),
  });
}

export async function saveCouncil(input: {
  userId: number;
  councilId: number;
  name: string;
  phasePrompts: PhasePrompts;
  members: ReadonlyArray<
    Readonly<{
      memberPosition: number;
      model: ProviderModelRef;
      tuning: CouncilMemberTuning | null;
    }>
  >;
}) {
  await updateCouncil({
    userId: input.userId,
    councilId: input.councilId,
    name: input.name,
    phase1Prompt: input.phasePrompts.phase1,
    phase2Prompt: input.phasePrompts.phase2,
    phase3Prompt: input.phasePrompts.phase3,
    members: input.members.map((member) => ({
      memberPosition: member.memberPosition,
      provider: member.model.provider,
      modelId: member.model.modelId,
      tuningJson: member.tuning,
    })),
  });
}

export async function removeCouncil(input: { userId: number; councilId: number }) {
  await deleteCouncil(input);
}
