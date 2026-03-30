import "server-only";

import type { CouncilMemberAssignment } from "@the-seven/contracts";
import { listUserCouncils } from "@the-seven/db";
import { canonicalizeCouncilMembers } from "../domain/councilDefinition";
import { EdgeError } from "../http/errors";
import { validateModelId } from "./models";

export async function assertCouncilNameAvailable(input: {
  userId: number;
  name: string;
  excludeCouncilId?: number;
}) {
  const existing = await listUserCouncils(input.userId);
  const conflict = existing.find((council) => {
    if (input.excludeCouncilId && council.id === input.excludeCouncilId) {
      return false;
    }
    return council.definition.name === input.name;
  });

  if (conflict) {
    throw new EdgeError({
      kind: "invalid_input",
      message: "Council name already exists",
      details: { issues: [{ path: "name", message: "Council name already exists" }] },
      status: 400,
    });
  }
}

export async function validateCouncilMembers(
  members: ReadonlyArray<CouncilMemberAssignment>,
): Promise<ReadonlyArray<CouncilMemberAssignment>> {
  const canonicalMembers = canonicalizeCouncilMembers(members);
  const seen = new Set<string>();

  for (const member of canonicalMembers) {
    if (seen.has(member.model.modelId)) {
      continue;
    }
    seen.add(member.model.modelId);

    const validation = await validateModelId(member.model.modelId);
    if (!validation.valid || !validation.model) {
      throw new EdgeError({
        kind: "invalid_input",
        message: `Unknown model ${member.model.modelId}`,
        details: {
          issues: [{ path: "members", message: `Unknown model ${member.model.modelId}` }],
        },
        status: 400,
      });
    }
  }

  return canonicalMembers;
}
