import { z } from "zod";
import { BUILT_IN_COUNCIL_SLUGS } from "../../shared/domain/builtInCouncils";
import type { CouncilRef } from "../../shared/domain/councilRef";

export const councilRefSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("built_in"),
    slug: z.enum(BUILT_IN_COUNCIL_SLUGS),
  }),
  z.object({
    kind: z.literal("user"),
    councilId: z.number().int().positive(),
  }),
]);

export type { CouncilRef };
