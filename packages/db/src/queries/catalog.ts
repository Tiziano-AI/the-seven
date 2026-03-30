import { asc, desc, eq, ilike, inArray, max, or } from "drizzle-orm";
import { getDb } from "../client";
import { catalogCache } from "../schema";

export async function replaceCatalogEntries(
  entries: ReadonlyArray<{
    modelId: string;
    modelName: string;
    description: string;
    contextLength: number | null;
    maxCompletionTokens: number | null;
    supportedParametersJson: string[];
    inputModalitiesJson: string[];
    outputModalitiesJson: string[];
    pricingJson: Record<string, string | null>;
    refreshedAt: Date;
  }>,
) {
  const db = await getDb();
  const normalizedEntries = Array.from(entries);
  await db.transaction(async (tx) => {
    await tx.delete(catalogCache);
    if (normalizedEntries.length > 0) {
      await tx.insert(catalogCache).values(normalizedEntries);
    }
  });
}

export async function getCatalogLastRefreshAt() {
  const db = await getDb();
  const rows = await db.select({ refreshedAt: max(catalogCache.refreshedAt) }).from(catalogCache);
  return rows[0]?.refreshedAt ?? null;
}

export async function getCatalogModelById(modelId: string) {
  const db = await getDb();
  const rows = await db
    .select()
    .from(catalogCache)
    .where(eq(catalogCache.modelId, modelId))
    .limit(1);
  return rows[0] ?? null;
}

export async function listCatalogModelsByIds(modelIds: ReadonlyArray<string>) {
  const uniqueModelIds = Array.from(new Set(modelIds));
  if (uniqueModelIds.length === 0) {
    return [];
  }

  const db = await getDb();
  return db.select().from(catalogCache).where(inArray(catalogCache.modelId, uniqueModelIds));
}

export async function searchCatalogModels(query: string, limit: number) {
  const db = await getDb();
  const term = `%${query.trim()}%`;
  return db
    .select()
    .from(catalogCache)
    .where(or(ilike(catalogCache.modelId, term), ilike(catalogCache.modelName, term)))
    .orderBy(desc(catalogCache.refreshedAt), asc(catalogCache.modelName))
    .limit(limit);
}
