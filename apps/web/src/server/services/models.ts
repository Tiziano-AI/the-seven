import "server-only";

import { BUILT_IN_MODEL_SEEDS, MODEL_CATALOG_TTL_HOURS } from "@the-seven/config";
import {
  getCatalogLastRefreshAt,
  getCatalogModelById,
  replaceCatalogEntries,
  searchCatalogModels,
} from "@the-seven/db";
import { fetchOpenRouterModels } from "../adapters/openrouter";

const MODEL_CATALOG_TTL_MS = MODEL_CATALOG_TTL_HOURS * 60 * 60 * 1000;

let refreshInFlight: Promise<void> | null = null;

function buildDynamicSuggestion(model: {
  modelId: string;
  modelName: string;
  description: string;
  contextLength: number | null;
  maxCompletionTokens: number | null;
}) {
  return {
    modelId: model.modelId,
    modelName: model.modelName,
    description: model.description,
    contextLength: model.contextLength,
    maxCompletionTokens: model.maxCompletionTokens,
  };
}

function buildBuiltInSuggestions(query: string) {
  const term = query.trim().toLowerCase();
  return BUILT_IN_MODEL_SEEDS.filter((seed) => {
    if (!term) {
      return true;
    }
    return seed.modelId.toLowerCase().includes(term) || seed.modelName.toLowerCase().includes(term);
  }).map((seed) => ({
    modelId: seed.modelId,
    modelName: seed.modelName,
    description: "",
    contextLength: null,
    maxCompletionTokens: null,
  }));
}

function dedupeSuggestions(
  suggestions: ReadonlyArray<ReturnType<typeof buildDynamicSuggestion>>,
  limit: number,
) {
  const deduped = new Map<string, (typeof suggestions)[number]>();
  for (const suggestion of suggestions) {
    if (!deduped.has(suggestion.modelId)) {
      deduped.set(suggestion.modelId, suggestion);
    }
  }
  return Array.from(deduped.values()).slice(0, limit);
}

function isCatalogFresh(lastRefreshedAt: Date | null, now: Date) {
  if (!lastRefreshedAt) {
    return false;
  }
  return now.getTime() - lastRefreshedAt.getTime() < MODEL_CATALOG_TTL_MS;
}

async function refreshModelCatalogOnce() {
  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      const refreshedAt = new Date();
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
          refreshedAt,
        })),
      );
    })().finally(() => {
      refreshInFlight = null;
    });
  }

  await refreshInFlight;
}

async function ensureCatalogFresh(now: Date) {
  const lastRefreshedAt = await getCatalogLastRefreshAt();
  if (!isCatalogFresh(lastRefreshedAt, now)) {
    await refreshModelCatalogOnce();
  }
}

export async function refreshModelCatalog() {
  await refreshModelCatalogOnce();
}

export async function validateModelId(modelId: string) {
  const now = new Date();
  await ensureCatalogFresh(now);

  let found = await getCatalogModelById(modelId);
  if (!found) {
    await refreshModelCatalogOnce();
    found = await getCatalogModelById(modelId);
  }

  return found
    ? {
        valid: true,
        model: {
          modelId: found.modelId,
          modelName: found.modelName,
          description: found.description,
          contextLength: found.contextLength,
          maxCompletionTokens: found.maxCompletionTokens,
          supportedParameters: found.supportedParametersJson,
          inputModalities: found.inputModalitiesJson,
          outputModalities: found.outputModalitiesJson,
        },
      }
    : {
        valid: false,
        model: null,
      };
}

export async function autocompleteModels(query: string, limit: number) {
  const now = new Date();
  await ensureCatalogFresh(now);

  let dynamicRows = await searchCatalogModels(query, limit);
  if (dynamicRows.length === 0) {
    await refreshModelCatalogOnce();
    dynamicRows = await searchCatalogModels(query, limit);
  }

  return dedupeSuggestions(
    [...buildBuiltInSuggestions(query), ...dynamicRows.map(buildDynamicSuggestion)],
    limit,
  );
}
