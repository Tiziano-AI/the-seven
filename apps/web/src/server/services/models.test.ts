import { beforeEach, describe, expect, test, vi } from "vitest";

const modelDbMocks = vi.hoisted(() => ({
  getCatalogLastRefreshAt: vi.fn(),
  getCatalogModelById: vi.fn(),
  replaceCatalogEntries: vi.fn(),
  searchCatalogModels: vi.fn(),
}));

const openRouterMocks = vi.hoisted(() => ({
  fetchOpenRouterModels: vi.fn(),
}));

vi.mock("server-only", () => ({}));

vi.mock("@the-seven/config", () => ({
  BUILT_IN_MODEL_SEEDS: [{ modelId: "built-in/model", modelName: "Built In Model" }],
  MODEL_CATALOG_TTL_HOURS: 24,
}));

vi.mock("@the-seven/db", () => modelDbMocks);
vi.mock("../adapters/openrouter", () => openRouterMocks);

function buildCatalogRow(modelId: string) {
  return {
    id: 1,
    modelId,
    modelName: `${modelId} name`,
    description: `${modelId} description`,
    contextLength: 128_000,
    maxCompletionTokens: 8_192,
    supportedParametersJson: ["temperature"],
    inputModalitiesJson: ["text"],
    outputModalitiesJson: ["text"],
    pricingJson: {},
    refreshedAt: new Date("2026-03-21T10:00:00.000Z"),
    createdAt: new Date("2026-03-21T10:00:00.000Z"),
    updatedAt: new Date("2026-03-21T10:00:00.000Z"),
  };
}

function buildOpenRouterModel(modelId: string) {
  return {
    id: modelId,
    name: `${modelId} name`,
    description: `${modelId} description`,
    context_length: 128_000,
    supported_parameters: ["temperature"],
    architecture: {
      input_modalities: ["text"],
      output_modalities: ["text"],
    },
    top_provider: {
      max_completion_tokens: 8_192,
    },
    pricing: {},
  };
}

function createDeferred<T>() {
  let resolveValue: ((value: T) => void) | undefined;
  const promise = new Promise<T>((resolve) => {
    resolveValue = resolve;
  });

  if (!resolveValue) {
    throw new Error("Deferred promise did not capture a resolver");
  }

  return {
    promise,
    resolve: resolveValue,
  };
}

async function loadModelsService() {
  return import("./models");
}

describe("models service", () => {
  beforeEach(() => {
    vi.resetModules();
    modelDbMocks.getCatalogLastRefreshAt.mockReset();
    modelDbMocks.getCatalogModelById.mockReset();
    modelDbMocks.replaceCatalogEntries.mockReset();
    modelDbMocks.searchCatalogModels.mockReset();
    openRouterMocks.fetchOpenRouterModels.mockReset();
  });

  test("refreshes exact lookups when the cache is stale", async () => {
    modelDbMocks.getCatalogLastRefreshAt.mockResolvedValue(null);
    openRouterMocks.fetchOpenRouterModels.mockResolvedValue([buildOpenRouterModel("model-a")]);
    modelDbMocks.replaceCatalogEntries.mockResolvedValue(undefined);
    modelDbMocks.getCatalogModelById.mockResolvedValue(buildCatalogRow("model-a"));

    const { validateModelId } = await loadModelsService();
    const result = await validateModelId("model-a");

    expect(openRouterMocks.fetchOpenRouterModels).toHaveBeenCalledTimes(1);
    expect(modelDbMocks.replaceCatalogEntries).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      valid: true,
      model: {
        modelId: "model-a",
      },
    });
  });

  test("does not refresh autocomplete while the cache is fresh and has matches", async () => {
    modelDbMocks.getCatalogLastRefreshAt.mockResolvedValue(new Date());
    modelDbMocks.searchCatalogModels.mockResolvedValue([buildCatalogRow("model-b")]);

    const { autocompleteModels } = await loadModelsService();
    const suggestions = await autocompleteModels("model-b", 5);

    expect(openRouterMocks.fetchOpenRouterModels).not.toHaveBeenCalled();
    expect(suggestions.some((suggestion) => suggestion.modelId === "model-b")).toBe(true);
  });

  test("deduplicates concurrent refreshes behind one in-flight fetch", async () => {
    modelDbMocks.getCatalogLastRefreshAt.mockResolvedValue(null);
    modelDbMocks.replaceCatalogEntries.mockResolvedValue(undefined);

    const pendingFetch = createDeferred<ReturnType<typeof buildOpenRouterModel>[]>();
    openRouterMocks.fetchOpenRouterModels.mockReturnValue(pendingFetch.promise);

    const { refreshModelCatalog } = await loadModelsService();
    const first = refreshModelCatalog();
    const second = refreshModelCatalog();

    expect(openRouterMocks.fetchOpenRouterModels).toHaveBeenCalledTimes(1);
    pendingFetch.resolve([buildOpenRouterModel("model-c")]);
    await Promise.all([first, second]);
    expect(modelDbMocks.replaceCatalogEntries).toHaveBeenCalledTimes(1);
  });
});
