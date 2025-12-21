import { getPhasePrompt } from "../config";
import { BUILT_IN_COUNCILS, type BuiltInCouncilSlug } from "../domain/builtInCouncils";
import type { CouncilRef } from "../domain/councilRef";
import { parseCouncilMemberTuningJson } from "../domain/councilMemberTuning";
import { MEMBER_POSITIONS } from "../../shared/domain/sevenMembers";
import type { CouncilMemberTuning } from "../../shared/domain/councilMemberTuning";
import type { ProviderModelRef } from "../../shared/domain/providerModels";
import type { PhasePrompts } from "../../shared/domain/phasePrompts";
import * as councilStore from "../stores/councilStore";

export type CouncilListItem = Readonly<{
  ref: CouncilRef;
  name: string;
  description: string | null;
  editable: boolean;
  deletable: boolean;
}>;

export type CouncilSnapshot = Readonly<{
  nameAtRun: string;
  phasePrompts: PhasePrompts;
  members: ReadonlyArray<
    Readonly<{ memberPosition: number; model: ProviderModelRef; tuning: CouncilMemberTuning | null }>
  >;
}>;

function requireBuiltInCouncil(slug: BuiltInCouncilSlug) {
  const found = BUILT_IN_COUNCILS[slug];
  if (!found) {
    throw new Error(`Unknown built-in council slug "${slug}"`);
  }
  return found;
}

function requireCompleteMemberSet(members: ReadonlyArray<Readonly<{ memberPosition: number }>>) {
  const have = new Set(members.map((m) => m.memberPosition));
  for (const required of MEMBER_POSITIONS) {
    if (!have.has(required)) {
      throw new Error(`Council is missing memberPosition ${required}`);
    }
  }
  if (have.size !== MEMBER_POSITIONS.length) {
    throw new Error("Council contains duplicate member positions");
  }
}

export async function listCouncils(userId: number): Promise<CouncilListItem[]> {
  const builtIns: CouncilListItem[] = Object.values(BUILT_IN_COUNCILS).map((council) => ({
    ref: { kind: "built_in", slug: council.slug },
    name: council.name,
    description: council.description,
    editable: false,
    deletable: false,
  }));

  const userCouncils = await councilStore.getCouncilsByUserId(userId);
  const userItems: CouncilListItem[] = userCouncils.map((council) => ({
    ref: { kind: "user", councilId: council.id },
    name: council.name,
    description: null,
    editable: true,
    deletable: true,
  }));

  return [...builtIns, ...userItems];
}

export async function resolveCouncilSnapshot(params: {
  userId: number;
  ref: CouncilRef;
}): Promise<CouncilSnapshot> {
  if (params.ref.kind === "built_in") {
    const template = requireBuiltInCouncil(params.ref.slug);

    return {
      nameAtRun: template.name,
      phasePrompts: {
        phase1: getPhasePrompt(1),
        phase2: getPhasePrompt(2),
        phase3: getPhasePrompt(3),
      },
      members: MEMBER_POSITIONS.map((memberPosition) => ({
        memberPosition,
        model: template.members[memberPosition],
        tuning: null,
      })),
    };
  }

  const stored = await councilStore.getCouncilWithMembers({
    userId: params.userId,
    councilId: params.ref.councilId,
  });
  if (!stored) {
    throw new Error("Council not found");
  }

  requireCompleteMemberSet(stored.members);

  const members = stored.members
    .slice()
    .sort((a, b) => a.memberPosition - b.memberPosition)
    .map((member) => ({
      memberPosition: member.memberPosition,
      model: {
        provider: member.provider,
        modelId: member.modelId,
      },
      tuning: parseCouncilMemberTuningJson(member.tuningJson),
    }));

  return {
    nameAtRun: stored.council.name,
    phasePrompts: {
      phase1: stored.council.phase1Prompt,
      phase2: stored.council.phase2Prompt,
      phase3: stored.council.phase3Prompt,
    },
    members,
  };
}
