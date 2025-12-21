import { z } from "zod";
import { byokProcedure, router } from "../../_core/trpc";
import { getModelAutocomplete, getModelDetails } from "../../services/openrouterCatalog";

export const modelsRouter = router({
  validate: byokProcedure
    .input(z.object({ modelId: z.string().min(1) }))
    .query(async ({ input }) => {
      const model = await getModelDetails(input.modelId);
      return { valid: model !== null, model };
    }),

  autocomplete: byokProcedure
    .input(
      z.object({
        query: z.string().min(1),
        limit: z.number().int().min(1).max(50).optional(),
      })
    )
    .query(async ({ input }) => {
      const suggestions = await getModelAutocomplete(input.query, input.limit ?? 10);
      return { suggestions };
    }),
});
