import { desc, eq, inArray, like, or, sql } from "drizzle-orm";
import { modelsCache, pricingCache } from "../../drizzle/schema";
import { getDb } from "./dbClient";

/**
 * Autocomplete suggestion payload for the model picker.
 */
export type ModelAutocompleteSuggestion = Readonly<{
  modelId: string;
  modelName: string;
  description: string;
  contextLength: number | null;
  maxCompletionTokens: number | null;
}>;

/**
 * Cached model metadata row for OpenRouter validation.
 */
export type ModelCacheRow = Readonly<{
  modelId: string;
  modelName: string;
  description: string | null;
  contextLength: number | null;
  maxCompletionTokens: number | null;
  supportedParametersJson: string | null;
  inputModalitiesJson: string | null;
  outputModalitiesJson: string | null;
}>;

/**
 * Upsert payload for the models cache.
 */
export type ModelCacheUpsert = Readonly<{
  modelId: string;
  modelName: string;
  description: string | null;
  contextLength: number | null;
  maxCompletionTokens: number | null;
  supportedParametersJson: string | null;
  inputModalitiesJson: string | null;
  outputModalitiesJson: string | null;
}>;

/**
 * Upsert payload for the pricing cache.
 */
export type PricingCacheUpsert = Readonly<{
  modelId: string;
  promptPrice: string;
  completionPrice: string;
  requestPrice: string;
  imagePrice: string;
}>;

/**
 * Returns the latest models cache refresh time.
 */
export async function getModelsCacheLastUpdated(): Promise<Date | null> {
  const db = await getDb();
  const rows = await db
    .select({
      lastUpdate: sql<number | null>`max(${modelsCache.lastUpdated})`,
    })
    .from(modelsCache);
  const value = rows[0]?.lastUpdate;
  return value === null || value === undefined ? null : new Date(value);
}

/**
 * Returns the latest pricing cache refresh time.
 */
export async function getPricingCacheLastUpdated(): Promise<Date | null> {
  const db = await getDb();
  const rows = await db
    .select({
      lastUpdate: sql<number | null>`max(${pricingCache.lastUpdated})`,
    })
    .from(pricingCache);
  const value = rows[0]?.lastUpdate;
  return value === null || value === undefined ? null : new Date(value);
}

/**
 * Upserts model metadata rows and returns the count written.
 */
export async function upsertModelsCache(entries: ModelCacheUpsert[]): Promise<number> {
  if (entries.length === 0) return 0;
  const db = await getDb();
  const now = new Date();

  return db.transaction(async (tx) => {
    let upserted = 0;
    for (const entry of entries) {
      await tx
        .insert(modelsCache)
        .values({
          modelId: entry.modelId,
          modelName: entry.modelName,
          description: entry.description,
          contextLength: entry.contextLength,
          maxCompletionTokens: entry.maxCompletionTokens,
          supportedParametersJson: entry.supportedParametersJson,
          inputModalitiesJson: entry.inputModalitiesJson,
          outputModalitiesJson: entry.outputModalitiesJson,
          lastUpdated: now,
          createdAt: now,
        })
        .onConflictDoUpdate({
          target: modelsCache.modelId,
          set: {
            modelName: entry.modelName,
            description: entry.description,
            contextLength: entry.contextLength,
            maxCompletionTokens: entry.maxCompletionTokens,
            supportedParametersJson: entry.supportedParametersJson,
            inputModalitiesJson: entry.inputModalitiesJson,
            outputModalitiesJson: entry.outputModalitiesJson,
            lastUpdated: now,
          },
        });
      upserted++;
    }
    return upserted;
  });
}

/**
 * Upserts pricing rows and returns the count written.
 */
export async function upsertPricingCache(entries: PricingCacheUpsert[]): Promise<number> {
  if (entries.length === 0) return 0;
  const db = await getDb();
  const now = new Date();

  return db.transaction(async (tx) => {
    let upserted = 0;
    for (const entry of entries) {
      await tx
        .insert(pricingCache)
        .values({
          modelId: entry.modelId,
          promptPrice: entry.promptPrice,
          completionPrice: entry.completionPrice,
          requestPrice: entry.requestPrice,
          imagePrice: entry.imagePrice,
          lastUpdated: now,
          createdAt: now,
        })
        .onConflictDoUpdate({
          target: pricingCache.modelId,
          set: {
            promptPrice: entry.promptPrice,
            completionPrice: entry.completionPrice,
            requestPrice: entry.requestPrice,
            imagePrice: entry.imagePrice,
            lastUpdated: now,
          },
        });
      upserted++;
    }
    return upserted;
  });
}

/**
 * Returns whether a model id exists in the cache.
 */
export async function hasModelId(modelId: string): Promise<boolean> {
  const db = await getDb();
  const rows = await db
    .select({ modelId: modelsCache.modelId })
    .from(modelsCache)
    .where(eq(modelsCache.modelId, modelId))
    .limit(1);
  return rows.length > 0;
}

/**
 * Returns a map of model ids to model names for a list of ids.
 */
export async function getModelNamesByIds(modelIds: ReadonlyArray<string>): Promise<Map<string, string>> {
  if (modelIds.length === 0) return new Map();
  const db = await getDb();
  const rows = await db
    .select({
      modelId: modelsCache.modelId,
      modelName: modelsCache.modelName,
    })
    .from(modelsCache)
    .where(inArray(modelsCache.modelId, modelIds));

  const map = new Map<string, string>();
  for (const row of rows) {
    map.set(row.modelId, row.modelName);
  }
  return map;
}

/**
 * Loads a cached model metadata row by id.
 */
export async function getModelCacheRowById(modelId: string): Promise<ModelCacheRow | null> {
  const db = await getDb();
  const rows = await db
    .select({
      modelId: modelsCache.modelId,
      modelName: modelsCache.modelName,
      description: modelsCache.description,
      contextLength: modelsCache.contextLength,
      maxCompletionTokens: modelsCache.maxCompletionTokens,
      supportedParametersJson: modelsCache.supportedParametersJson,
      inputModalitiesJson: modelsCache.inputModalitiesJson,
      outputModalitiesJson: modelsCache.outputModalitiesJson,
    })
    .from(modelsCache)
    .where(eq(modelsCache.modelId, modelId))
    .limit(1);

  return rows[0] ?? null;
}

/**
 * Searches models by id or name and returns ordered suggestions.
 */
export async function searchModels(
  query: string,
  limit: number
): Promise<ModelAutocompleteSuggestion[]> {
  const db = await getDb();
  const pattern = `%${query}%`;

  const rank = sql<number>`
    case
      when ${modelsCache.modelId} = ${query} then 0
      when ${modelsCache.modelId} like ${query + "%"} then 1
      when ${modelsCache.modelName} like ${query + "%"} then 2
      else 3
    end
  `;

  const rows = await db
    .select({
      modelId: modelsCache.modelId,
      modelName: modelsCache.modelName,
      description: modelsCache.description,
      contextLength: modelsCache.contextLength,
      maxCompletionTokens: modelsCache.maxCompletionTokens,
    })
    .from(modelsCache)
    .where(or(like(modelsCache.modelId, pattern), like(modelsCache.modelName, pattern)))
    .orderBy(rank, modelsCache.modelId)
    .limit(limit);

  return rows.map((row) => ({
    modelId: row.modelId,
    modelName: row.modelName,
    description: row.description ?? "",
    contextLength: row.contextLength,
    maxCompletionTokens: row.maxCompletionTokens,
  }));
}

/**
 * Loads pricing metadata for a model id.
 */
export async function getPricingForModel(modelId: string): Promise<{
  promptPrice: string;
  completionPrice: string;
} | null> {
  const db = await getDb();
  const rows = await db
    .select({
      promptPrice: pricingCache.promptPrice,
      completionPrice: pricingCache.completionPrice,
    })
    .from(pricingCache)
    .where(eq(pricingCache.modelId, modelId))
    .orderBy(desc(pricingCache.lastUpdated))
    .limit(1);

  const row = rows[0];
  if (!row) return null;
  return row;
}
