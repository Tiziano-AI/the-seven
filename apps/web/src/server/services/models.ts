import "server-only";

import { BUILT_IN_MODEL_SEEDS } from "@the-seven/config";
import { getCatalogModelById, replaceCatalogEntries, searchCatalogModels } from "@the-seven/db";
import { fetchOpenRouterModels } from "../adapters/openrouter";

export async function refreshModelCatalog() {
  const models = await fetchOpenRouterModels();
  await replaceCatalogEntries(
    models.map((model) => ({
      modelId: model.id,
      modelName: model.name ?? model.id,
      description: model.description ?? "",
      contextLength: model.context_length ?? null,
      maxCompletionTokens: model.top_provider?.max_completion_tokens ?? null,
      supportedParametersJson: model.supported_parameters ?? [],
      inputModalitiesJson: model.architecture?.input_modalities ?? [],
      outputModalitiesJson: model.architecture?.output_modalities ?? [],
      pricingJson: Object.fromEntries(
        Object.entries(model.pricing ?? {}).map(([key, value]) => [key, value ?? null]),
      ),
      refreshedAt: new Date(),
    })),
  );
}

async function ensureModel(modelId: string) {
  let model = await getCatalogModelById(modelId);
  if (!model) {
    await refreshModelCatalog();
    model = await getCatalogModelById(modelId);
  }
  return model;
}

export async function validateModelId(modelId: string) {
  const found = await ensureModel(modelId);
  return found
    ? {
        valid: true,
        model: {
          modelId: found.modelId,
          modelName: found.modelName,
          description: found.description,
          contextLength: found.contextLength,
          maxCompletionTokens: found.maxCompletionTokens,
          supportedParameters: found.supportedParametersJson as string[],
          inputModalities: found.inputModalitiesJson as string[],
          outputModalities: found.outputModalitiesJson as string[],
        },
      }
    : {
        valid: false,
        model: null,
      };
}

export async function autocompleteModels(query: string, limit: number) {
  const rows = await searchCatalogModels(query, limit);
  if (rows.length === 0) {
    await refreshModelCatalog();
  }
  const refreshed = rows.length > 0 ? rows : await searchCatalogModels(query, limit);

  const builtInSuggestions = BUILT_IN_MODEL_SEEDS.filter((seed) => {
    const term = query.toLowerCase();
    return seed.modelId.toLowerCase().includes(term) || seed.modelName.toLowerCase().includes(term);
  }).map((seed) => ({
    modelId: seed.modelId,
    modelName: seed.modelName,
    description: "",
    contextLength: null,
    maxCompletionTokens: null,
  }));

  const dynamicSuggestions = refreshed.map((model) => ({
    modelId: model.modelId,
    modelName: model.modelName,
    description: model.description,
    contextLength: model.contextLength,
    maxCompletionTokens: model.maxCompletionTokens,
  }));

  const deduped = new Map<string, (typeof dynamicSuggestions)[number]>();
  for (const suggestion of [...builtInSuggestions, ...dynamicSuggestions]) {
    if (!deduped.has(suggestion.modelId)) {
      deduped.set(suggestion.modelId, suggestion);
    }
  }

  return Array.from(deduped.values()).slice(0, limit);
}
