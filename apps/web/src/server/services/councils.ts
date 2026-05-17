import "server-only";

import { BUILT_IN_COUNCILS, DEFAULT_OUTPUT_FORMATS } from "@the-seven/config";
import type {
  CouncilMemberAssignment,
  CouncilRef,
  OutputFormats,
  PhasePrompts,
} from "@the-seven/contracts";
import { notFoundDetails } from "@the-seven/contracts";
import {
  createCouncil,
  deleteCouncil,
  getUserCouncil,
  listUserCouncils,
  replaceCouncil as replaceStoredCouncil,
} from "@the-seven/db";
import { canonicalizeCouncilDefinition } from "../domain/councilDefinition";
import { EdgeError } from "../http/errors";

export type CouncilSnapshot = Readonly<{
  nameAtRun: string;
  refAtRun: CouncilRef;
  phasePrompts: PhasePrompts;
  members: ReadonlyArray<CouncilMemberAssignment>;
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
      name: council.definition.name,
      description: null,
      editable: true,
      deletable: true,
    })),
  ];
}

async function requireOwnedCouncil(input: { userId: number; councilId: number }) {
  const stored = await getUserCouncil({
    userId: input.userId,
    councilId: input.councilId,
  });
  if (!stored) {
    throw new EdgeError({
      kind: "not_found",
      message: "Council not found",
      details: notFoundDetails("council"),
      status: 404,
    });
  }
  return stored;
}

export async function resolveCouncilSnapshot(input: {
  userId: number;
  ref: CouncilRef;
}): Promise<CouncilSnapshot> {
  if (input.ref.kind === "built_in") {
    const council = BUILT_IN_COUNCILS[input.ref.slug];
    return {
      nameAtRun: council.name,
      refAtRun: input.ref,
      phasePrompts: council.phasePrompts,
      members: council.members,
    };
  }

  const stored = await requireOwnedCouncil({
    userId: input.userId,
    councilId: input.ref.councilId,
  });

  return {
    nameAtRun: stored.definition.name,
    refAtRun: input.ref,
    phasePrompts: stored.definition.phasePrompts,
    members: stored.definition.members,
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
    definition: canonicalizeCouncilDefinition({
      name: input.name,
      phasePrompts: input.snapshot.phasePrompts,
      members: input.snapshot.members,
    }),
  });
}

export async function replaceCouncil(input: {
  userId: number;
  councilId: number;
  name: string;
  phasePrompts: PhasePrompts;
  members: ReadonlyArray<CouncilMemberAssignment>;
}) {
  const definition = canonicalizeCouncilDefinition({
    name: input.name,
    phasePrompts: input.phasePrompts,
    members: input.members,
  });

  const replaced = await replaceStoredCouncil({
    userId: input.userId,
    councilId: input.councilId,
    definition,
  });

  if (!replaced) {
    throw new EdgeError({
      kind: "not_found",
      message: "Council not found",
      details: notFoundDetails("council"),
      status: 404,
    });
  }
}

export async function removeCouncil(input: { userId: number; councilId: number }) {
  const deleted = await deleteCouncil(input);
  if (!deleted) {
    throw new EdgeError({
      kind: "not_found",
      message: "Council not found",
      details: notFoundDetails("council"),
      status: 404,
    });
  }
}
