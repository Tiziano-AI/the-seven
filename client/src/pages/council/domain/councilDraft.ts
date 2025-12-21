import { MEMBER_POSITIONS } from "@shared/domain/sevenMembers";
import type { CouncilMemberTuning } from "@shared/domain/councilMemberTuning";
import type { PhasePrompts } from "@shared/domain/phasePrompts";

export function buildEmptyCouncilMemberTuning(): CouncilMemberTuning {
  return {
    temperature: null,
    seed: null,
    verbosity: null,
    reasoningEffort: null,
    includeReasoning: null,
  };
}

export type CouncilDraftMember = Readonly<{
  memberPosition: number;
  modelId: string;
  tuning: CouncilMemberTuning;
}>;

export type CouncilDraft = Readonly<{
  name: string;
  phasePrompts: PhasePrompts;
  members: ReadonlyArray<CouncilDraftMember>;
}>;

export type ValidatedCouncilDraft = Readonly<{
  name: string;
  phasePrompts: PhasePrompts;
  members: ReadonlyArray<Readonly<{ memberPosition: number; modelId: string; tuning: CouncilMemberTuning }>>;
}>;

export type CouncilDraftValidation =
  | Readonly<{ ok: true; value: ValidatedCouncilDraft }>
  | Readonly<{ ok: false; message: string }>;

export function buildEmptyCouncilDraft(): CouncilDraft {
  return {
    name: "",
    phasePrompts: { phase1: "", phase2: "", phase3: "" },
    members: MEMBER_POSITIONS.map((memberPosition) => ({
      memberPosition,
      modelId: "",
      tuning: buildEmptyCouncilMemberTuning(),
    })),
  };
}

export function validateCouncilDraftForSave(draft: CouncilDraft): CouncilDraftValidation {
  const name = draft.name.trim();
  if (!name) {
    return { ok: false, message: "Name must not be blank" };
  }

  const phase1 = draft.phasePrompts.phase1.trim();
  const phase2 = draft.phasePrompts.phase2.trim();
  const phase3 = draft.phasePrompts.phase3.trim();

  if (!phase1 || !phase2 || !phase3) {
    return { ok: false, message: "All phase prompts are required" };
  }

  const members = draft.members.map((member) => ({
    memberPosition: member.memberPosition,
    modelId: member.modelId.trim(),
    tuning: member.tuning,
  }));

  if (members.length !== MEMBER_POSITIONS.length) {
    return { ok: false, message: "Council must have exactly 7 members" };
  }

  if (members.some((member) => member.modelId.length === 0)) {
    return { ok: false, message: "All 7 member model ids are required" };
  }

  return {
    ok: true,
    value: {
      name,
      phasePrompts: { phase1, phase2, phase3 },
      members,
    },
  };
}
