import "server-only";

import type { CouncilMemberAssignment, CouncilMemberTuning } from "@the-seven/contracts";
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

function assertModelSupportsTuning(input: {
  modelId: string;
  supportedParameters: ReadonlyArray<string>;
  tuning: CouncilMemberTuning | null;
}) {
  if (!input.tuning) {
    return;
  }

  const unsupported: string[] = [];
  if (input.tuning.temperature !== null && !input.supportedParameters.includes("temperature")) {
    unsupported.push("temperature");
  }
  if (input.tuning.seed !== null && !input.supportedParameters.includes("seed")) {
    unsupported.push("seed");
  }
  if (input.tuning.verbosity !== null && !input.supportedParameters.includes("verbosity")) {
    unsupported.push("verbosity");
  }
  if (input.tuning.reasoningEffort !== null && !input.supportedParameters.includes("reasoning")) {
    unsupported.push("reasoning");
  }
  if (
    input.tuning.includeReasoning !== null &&
    !input.supportedParameters.includes("include_reasoning")
  ) {
    unsupported.push("include_reasoning");
  }

  if (unsupported.length > 0) {
    throw new EdgeError({
      kind: "invalid_input",
      message: `Unsupported tuning for model ${input.modelId}`,
      details: {
        issues: [
          {
            path: "members",
            message: `Model ${input.modelId} does not advertise: ${unsupported.join(", ")}`,
          },
        ],
      },
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

    for (const candidate of canonicalMembers.filter(
      (item) => item.model.modelId === member.model.modelId,
    )) {
      assertModelSupportsTuning({
        modelId: candidate.model.modelId,
        supportedParameters: validation.model.supportedParameters,
        tuning: candidate.tuning,
      });
    }
  }

  return canonicalMembers;
}
