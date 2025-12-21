import { fetchOpenRouterModels } from "../adapters/openrouter/client";
import type { OpenRouterModel } from "../adapters/openrouter/client";
import type {
  ModelAutocompleteSuggestion,
  ModelCacheRow,
  ModelCacheUpsert,
  PricingCacheUpsert,
} from "../stores/openrouterCacheStore";
import * as cacheStore from "../stores/openrouterCacheStore";
import { errorToLogFields, log } from "../_core/log";
import { BUILT_IN_MODEL_SEEDS } from "../domain/builtInCouncils";

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

let refreshPromise: Promise<void> | null = null;

let seedPromise: Promise<void> | null = null;

async function seedBuiltInModelsCacheBestEffort(): Promise<void> {
  if (seedPromise) return seedPromise;

  seedPromise = (async () => {
    try {
      const missing: ModelCacheUpsert[] = [];
      for (const seed of BUILT_IN_MODEL_SEEDS) {
        const exists = await cacheStore.hasModelId(seed.modelId);
        if (exists) continue;
        missing.push({
          modelId: seed.modelId,
          modelName: seed.modelName,
          description: null,
          contextLength: null,
          maxCompletionTokens: null,
          supportedParametersJson: null,
          inputModalitiesJson: null,
          outputModalitiesJson: null,
        });
      }
      if (missing.length > 0) {
        await cacheStore.upsertModelsCache(missing);
      }
    } catch (error: unknown) {
      log("warn", "openrouter_cache_seed_builtins_failed", {
        ...errorToLogFields(error),
      });
    }
  })().finally(() => {
    seedPromise = null;
  });

  return seedPromise;
}

export async function validateModelId(modelId: string): Promise<boolean> {
  try {
    await refreshCatalogCachesIfStaleBestEffort();
    return await cacheStore.hasModelId(modelId);
  } catch (error: unknown) {
    log("warn", "openrouter_cache_has_model_failed", {
      model_id: modelId,
      ...errorToLogFields(error),
    });
    return false;
  }
}

export type OpenRouterModelDetails = Readonly<{
  modelId: string;
  modelName: string;
  description: string;
  contextLength: number | null;
  maxCompletionTokens: number | null;
  supportedParameters: ReadonlyArray<string>;
  inputModalities: ReadonlyArray<string>;
  outputModalities: ReadonlyArray<string>;
}>;

function parseJsonStringArray(params: {
  modelId: string;
  label: "supportedParametersJson" | "inputModalitiesJson" | "outputModalitiesJson";
  value: string | null;
}): string[] {
  if (!params.value) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(params.value) as unknown;
  } catch (error: unknown) {
    log("warn", "openrouter_cache_invalid_json_array", {
      model_id: params.modelId,
      field: params.label,
      ...errorToLogFields(error),
    });
    return [];
  }

  if (!Array.isArray(parsed)) {
    log("warn", "openrouter_cache_invalid_json_array", {
      model_id: params.modelId,
      field: params.label,
      err_message: "Expected JSON array",
    });
    return [];
  }

  const out: string[] = [];
  for (const item of parsed) {
    if (typeof item === "string") {
      out.push(item);
    }
  }
  return out;
}

function rowToModelDetails(row: ModelCacheRow): OpenRouterModelDetails {
  return {
    modelId: row.modelId,
    modelName: row.modelName,
    description: row.description ?? "",
    contextLength: row.contextLength,
    maxCompletionTokens: row.maxCompletionTokens,
    supportedParameters: parseJsonStringArray({
      modelId: row.modelId,
      label: "supportedParametersJson",
      value: row.supportedParametersJson,
    }),
    inputModalities: parseJsonStringArray({
      modelId: row.modelId,
      label: "inputModalitiesJson",
      value: row.inputModalitiesJson,
    }),
    outputModalities: parseJsonStringArray({
      modelId: row.modelId,
      label: "outputModalitiesJson",
      value: row.outputModalitiesJson,
    }),
  };
}

export async function getModelDetails(modelId: string): Promise<OpenRouterModelDetails | null> {
  try {
    await refreshCatalogCachesIfStaleBestEffort();
    const row = await cacheStore.getModelCacheRowById(modelId);
    if (!row) return null;
    return rowToModelDetails(row);
  } catch (error: unknown) {
    log("warn", "openrouter_cache_get_model_details_failed", {
      model_id: modelId,
      ...errorToLogFields(error),
    });
    return null;
  }
}

export async function getModelAutocomplete(
  query: string,
  limit: number = 10
): Promise<ModelAutocompleteSuggestion[]> {
  try {
    await refreshCatalogCachesIfStaleBestEffort();
    return await cacheStore.searchModels(query, limit);
  } catch (error: unknown) {
    log("warn", "openrouter_cache_search_models_failed", {
      query_len: query.length,
      limit,
      ...errorToLogFields(error),
    });
    return [];
  }
}


async function refreshCatalogCachesIfStaleBestEffort(): Promise<void> {
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    try {
      await seedBuiltInModelsCacheBestEffort();

      const [modelsLastUpdated, pricingLastUpdated] = await Promise.all([
        safeGetLastUpdated("models", cacheStore.getModelsCacheLastUpdated),
        safeGetLastUpdated("pricing", cacheStore.getPricingCacheLastUpdated),
      ]);

      if (isFresh(modelsLastUpdated) && isFresh(pricingLastUpdated)) return;

      const models = await fetchOpenRouterModels();
      const modelsUpserts = buildModelsUpserts(models);
      const pricingUpserts = buildPricingUpserts(models);

      await upsertCacheBestEffort("models", modelsUpserts, cacheStore.upsertModelsCache);
      await upsertCacheBestEffort("pricing", pricingUpserts, cacheStore.upsertPricingCache);
    } catch (error: unknown) {
      log("warn", "openrouter_cache_refresh_failed", {
        ...errorToLogFields(error),
      });
    }
  })().finally(() => {
    refreshPromise = null;
  });

  return refreshPromise;
}

async function safeGetLastUpdated(
  label: "models" | "pricing",
  fn: () => Promise<Date | null>
): Promise<Date | null> {
  try {
    return await fn();
  } catch (error: unknown) {
    log("warn", "openrouter_cache_last_updated_failed", {
      cache: label,
      ...errorToLogFields(error),
    });
    return null;
  }
}

function isFresh(lastUpdated: Date | null): boolean {
  if (!lastUpdated) return false;
  return Date.now() - lastUpdated.getTime() < CACHE_TTL_MS;
}

async function upsertCacheBestEffort<T, TReturn>(
  label: "models" | "pricing",
  rows: T[],
  fn: (rows: T[]) => Promise<TReturn>
): Promise<void> {
  try {
    await fn(rows);
  } catch (error: unknown) {
    log("warn", "openrouter_cache_upsert_failed", {
      cache: label,
      rows: rows.length,
      ...errorToLogFields(error),
    });
  }
}

function buildModelsUpserts(models: OpenRouterModel[]): ModelCacheUpsert[] {
  return models.map((model) => ({
    modelId: model.id,
    modelName: model.name ?? model.id,
    description: model.description ?? null,
    contextLength: model.context_length ?? null,
    maxCompletionTokens: model.top_provider?.max_completion_tokens ?? null,
    supportedParametersJson: model.supported_parameters
      ? JSON.stringify(model.supported_parameters)
      : null,
    inputModalitiesJson: model.architecture?.input_modalities
      ? JSON.stringify(model.architecture.input_modalities)
      : null,
    outputModalitiesJson: model.architecture?.output_modalities
      ? JSON.stringify(model.architecture.output_modalities)
      : null,
  }));
}

function buildPricingUpserts(models: OpenRouterModel[]): PricingCacheUpsert[] {
  return models.flatMap((model) => {
    const pricing = model.pricing;
    if (!pricing) return [];
    return [
      {
        modelId: model.id,
        promptPrice: pricing.prompt ?? "0",
        completionPrice: pricing.completion ?? "0",
        requestPrice: pricing.request ?? "0",
        imagePrice: pricing.image ?? "0",
      },
    ];
  });
}
