import { z } from "zod";
import { parseJsonBody } from "./parse";
import type { RequestContext } from "./context";
import { requireByokAuth } from "./requireAuth";
import { getModelAutocomplete, getModelDetails } from "../../services/openrouterCatalog";

const validateSchema = z.object({
  modelId: z.string().min(1),
});

const autocompleteSchema = z.object({
  query: z.string().min(1),
  limit: z.number().int().min(1).max(50).optional(),
});

export async function handleModelValidate(ctx: RequestContext, body: unknown): Promise<Readonly<{ valid: boolean; model: Awaited<ReturnType<typeof getModelDetails>> }>> {
  requireByokAuth(ctx.auth);
  const input = parseJsonBody(validateSchema, body);
  const model = await getModelDetails(input.modelId);
  return { valid: model !== null, model };
}

export async function handleModelAutocomplete(ctx: RequestContext, body: unknown): Promise<Readonly<{ suggestions: Awaited<ReturnType<typeof getModelAutocomplete>> }>> {
  requireByokAuth(ctx.auth);
  const input = parseJsonBody(autocompleteSchema, body);
  const suggestions = await getModelAutocomplete(input.query, input.limit ?? 10);
  return { suggestions };
}
