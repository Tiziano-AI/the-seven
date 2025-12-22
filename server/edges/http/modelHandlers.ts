import { parseJsonBody } from "./parse";
import type { RequestContext } from "./context";
import { requireByokAuth } from "./requireAuth";
import { getModelAutocomplete, getModelDetails } from "../../services/openrouterCatalog";
import { modelAutocompleteBodySchema, modelValidateBodySchema } from "../../../shared/domain/apiSchemas";

export async function handleModelValidate(ctx: RequestContext, body: unknown): Promise<Readonly<{ valid: boolean; model: Awaited<ReturnType<typeof getModelDetails>> }>> {
  requireByokAuth(ctx.auth);
  const input = parseJsonBody(modelValidateBodySchema, body);
  const model = await getModelDetails(input.modelId);
  return { valid: model !== null, model };
}

export async function handleModelAutocomplete(ctx: RequestContext, body: unknown): Promise<Readonly<{ suggestions: Awaited<ReturnType<typeof getModelAutocomplete>> }>> {
  requireByokAuth(ctx.auth);
  const input = parseJsonBody(modelAutocompleteBodySchema, body);
  const suggestions = await getModelAutocomplete(input.query, input.limit ?? 10);
  return { suggestions };
}
