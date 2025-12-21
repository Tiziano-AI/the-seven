import { getOutputFormat } from "../config";
import { buildSessionRunSpec, stringifySessionRunSpec } from "../domain/sessionRunSpec";
import type { CouncilRef } from "../domain/councilRef";
import type { Attachment } from "../domain/attachments";
import { resolveCouncilSnapshot } from "./councils";

export async function buildRunSpecFromCouncil(params: {
  userId: number;
  councilRef: CouncilRef;
  query: string;
  attachments: Attachment[];
}): Promise<{ councilNameAtRun: string; runSpecJson: string }> {
  const council = await resolveCouncilSnapshot({ userId: params.userId, ref: params.councilRef });

  const runSpec = buildSessionRunSpec({
    now: new Date(),
    query: params.query,
    attachments: params.attachments,
    outputFormats: {
      phase1: getOutputFormat(1),
      phase2: getOutputFormat(2),
      phase3: getOutputFormat(3),
    },
    council,
  });

  return {
    councilNameAtRun: council.nameAtRun,
    runSpecJson: stringifySessionRunSpec(runSpec),
  };
}
