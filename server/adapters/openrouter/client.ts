import axios from "axios";
import { z } from "zod";
import type { JsonObject } from "../../_core/log";
import { loadNodeEnv, loadOpenRouterAppHeaders } from "../../_core/runtimeConfig";

const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";
const OPENROUTER_APP_HEADERS = loadOpenRouterAppHeaders();
const IS_TEST = loadNodeEnv() === "test";

export type OpenRouterMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  name?: string;
  tool_call_id?: string;
};

export type OpenRouterTool = Readonly<{
  type: "function";
  function: Readonly<{
    name: string;
    description?: string;
    parameters: JsonObject;
  }>;
}>;

export type OpenRouterToolChoice =
  | "auto"
  | "none"
  | Readonly<{
      type: "function";
      function: Readonly<{
        name: string;
      }>;
    }>;

export type OpenRouterResponseFormat =
  | Readonly<{ type: "text" }>
  | Readonly<{ type: "json_object" }>
  | Readonly<{
      type: "json_schema";
      json_schema: Readonly<{
        name: string;
        strict?: boolean;
        schema: JsonObject;
      }>;
    }>;

export type OpenRouterReasoningOptions = Readonly<{
  effort?: string;
}>;

export type OpenRouterProviderPreferences = Readonly<{
  order?: ReadonlyArray<string>;
  allow_fallbacks?: boolean;
  require_parameters?: boolean;
  data_collection?: "allow" | "deny";
}>;

export type OpenRouterPlugin = Readonly<{
  id: string;
  config?: JsonObject;
}>;

export type OpenRouterRequest = {
  model: string;
  models?: string[];
  messages: OpenRouterMessage[];
  transforms?: string[];
  plugins?: OpenRouterPlugin[];
  max_tokens?: number;
  temperature?: number;
  top_p?: number;
  frequency_penalty?: number;
  presence_penalty?: number;
  stop?: string | string[];
  seed?: number;
  verbosity?: string;
  tools?: OpenRouterTool[];
  tool_choice?: OpenRouterToolChoice;
  response_format?: OpenRouterResponseFormat;
  reasoning?: OpenRouterReasoningOptions;
  include_reasoning?: boolean;
  provider?: OpenRouterProviderPreferences;
};

function normalizeOpenRouterRequest(request: OpenRouterRequest): OpenRouterRequest {
  // OpenRouter can apply prompt transforms (including middle-out compression). This system
  // forbids silent prompt mutation; we always disable transforms to ensure oversized prompts
  // fail loudly instead of being truncated.
  //
  // Evidence: vendor:openrouter:2025-12-19:https://openrouter.ai/docs/guides/features/message-transforms
  const transforms: string[] = [];

  // Plugins can be configured as account defaults in OpenRouter. For deterministic behavior,
  // explicitly send an empty list unless the caller intentionally enables plugins.
  //
  // Evidence: vendor:openrouter:2025-12-19:https://openrouter.ai/docs/guides/features/plugins
  const plugins = request.plugins ?? [];

  return {
    ...request,
    transforms,
    plugins,
  };
}

const openRouterUsageSchema = z.object({
  prompt_tokens: z.number().int().nonnegative(),
  completion_tokens: z.number().int().nonnegative(),
  total_tokens: z.number().int().nonnegative(),
});

const openRouterChoiceErrorSchema = z.object({
  code: z.number().int(),
  message: z.string(),
});

const openRouterChatCompletionSchema = z.object({
  id: z.string(),
  model: z.string(),
  choices: z.array(
    z.object({
      message: z.object({
        role: z.string(),
        content: z.string().nullable(),
      }).passthrough(),
      finish_reason: z.string().nullable().optional(),
      native_finish_reason: z.string().nullable().optional(),
      error: openRouterChoiceErrorSchema.optional(),
    })
  ),
  usage: openRouterUsageSchema.optional(),
});

export type OpenRouterResponse = z.infer<typeof openRouterChatCompletionSchema>;

const openRouterGenerationDataSchema = z
  .object({
    id: z.string(),
    model: z.string().nullish(),
    total_cost: z.union([z.number(), z.string()]).nullish(),
    cache_discount: z.union([z.number(), z.string()]).nullish(),
    upstream_inference_cost: z.union([z.number(), z.string()]).nullish(),
    tokens_prompt: z.number().int().nonnegative().nullish(),
    tokens_completion: z.number().int().nonnegative().nullish(),
    native_tokens_prompt: z.number().int().nonnegative().nullish(),
    native_tokens_completion: z.number().int().nonnegative().nullish(),
    native_tokens_reasoning: z.number().int().nonnegative().nullish(),
    num_media_prompt: z.number().int().nonnegative().nullish(),
    num_media_completion: z.number().int().nonnegative().nullish(),
    num_search_results: z.number().int().nonnegative().nullish(),
  })
  .passthrough();

const openRouterGenerationResponseSchema = z
  .object({
    data: openRouterGenerationDataSchema,
  })
  .passthrough();

export type OpenRouterGeneration = z.infer<typeof openRouterGenerationDataSchema>;

export class OpenRouterRequestFailedError extends Error {
  readonly status: number | null;

  constructor(params: { status: number | null; message: string }) {
    super(params.message);
    this.name = "OpenRouterRequestFailedError";
    this.status = params.status;
  }
}

const openRouterErrorBodySchema = z
  .object({
    error: z
      .object({
        message: z.string().optional(),
      })
      .optional(),
  })
  .passthrough();

const openRouterModelsResponseSchema = z.object({
  data: z.array(
    z.object({
      id: z.string(),
      name: z.string().nullish(),
      description: z.string().nullish(),
      context_length: z.number().int().nonnegative().nullish(),
      supported_parameters: z.array(z.string()).nullish(),
      architecture: z
        .object({
          input_modalities: z.array(z.string()).nullish(),
          output_modalities: z.array(z.string()).nullish(),
        })
        .passthrough()
        .nullish(),
      top_provider: z
        .object({
          max_completion_tokens: z.number().int().nonnegative().nullish(),
        })
        .passthrough()
        .nullish(),
      pricing: z
        .object({
          prompt: z.string().nullish(),
          completion: z.string().nullish(),
          request: z.string().nullish(),
          image: z.string().nullish(),
        })
        .passthrough()
        .nullish(),
    })
  ),
});

export type OpenRouterModel = z.infer<typeof openRouterModelsResponseSchema>["data"][number];

export async function callOpenRouter(
  apiKey: string,
  request: OpenRouterRequest
): Promise<OpenRouterResponse> {
  const maxAttempts = 2;
  const normalizedRequest = normalizeOpenRouterRequest(request);
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const response = await axios.post<unknown>(
        `${OPENROUTER_BASE_URL}/chat/completions`,
        normalizedRequest,
        {
          headers: {
            ...OPENROUTER_APP_HEADERS,
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
        }
      );

      return openRouterChatCompletionSchema.parse(response.data);
    } catch (error) {
      if (attempt < maxAttempts && isRetryableOpenRouterAxiosError(error)) {
        await sleepMs(backoffDelayMs(attempt));
        continue;
      }
      const details = extractOpenRouterAxiosErrorDetails(error);
      throw new OpenRouterRequestFailedError(details);
    }
  }

  throw new Error("OpenRouter request failed: unreachable");
}

export async function fetchOpenRouterModels(): Promise<OpenRouterModel[]> {
  try {
    const response = await axios.get<unknown>(`${OPENROUTER_BASE_URL}/models`, {
      headers: OPENROUTER_APP_HEADERS,
    });
    const parsed = openRouterModelsResponseSchema.parse(response.data);
    return parsed.data;
  } catch (error) {
    const details = extractOpenRouterAxiosErrorDetails(error);
    throw new OpenRouterRequestFailedError(details);
  }
}

export async function validateOpenRouterApiKey(apiKey: string): Promise<boolean> {
  try {
    await axios.get(`${OPENROUTER_BASE_URL}/auth/key`, {
      headers: {
        ...OPENROUTER_APP_HEADERS,
        Authorization: `Bearer ${apiKey}`,
      },
    });
    return true;
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.status === 401) return false;
    const details = extractOpenRouterAxiosErrorDetails(error);
    throw new OpenRouterRequestFailedError(details);
  }
}

export async function fetchOpenRouterGeneration(
  apiKey: string,
  generationId: string
): Promise<OpenRouterGeneration> {
  const maxAttempts = 3;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const response = await axios.get<unknown>(`${OPENROUTER_BASE_URL}/generation`, {
        headers: {
          ...OPENROUTER_APP_HEADERS,
          Authorization: `Bearer ${apiKey}`,
        },
        params: { id: generationId },
      });
      const wrapped = openRouterGenerationResponseSchema.safeParse(response.data);
      if (wrapped.success) return wrapped.data.data;

      const direct = openRouterGenerationDataSchema.safeParse(response.data);
      if (direct.success) return direct.data;

      const issues = [
        ...wrapped.error.issues,
        ...direct.error.issues,
      ];
      throw new Error(JSON.stringify(issues, null, 2));
    } catch (error) {
      const status = axios.isAxiosError(error) ? error.response?.status : undefined;
      const retryable =
        isRetryableOpenRouterAxiosError(error) || status === 404 || status === 409;
      if (attempt < maxAttempts && retryable) {
        await sleepMs(backoffDelayMs(attempt));
        continue;
      }
      const details = extractOpenRouterAxiosErrorDetails(error);
      throw new OpenRouterRequestFailedError(details);
    }
  }

  throw new Error("OpenRouter generation request failed: unreachable");
}

function extractOpenRouterAxiosErrorDetails(error: unknown): Readonly<{ status: number | null; message: string }> {
  if (!axios.isAxiosError(error)) {
    const message = error instanceof Error ? error.message : "OpenRouter request failed";
    return { status: null, message };
  }

  const status = error.response?.status;

  const parsedBody = openRouterErrorBodySchema.safeParse(error.response?.data);
  const providerMessage = parsedBody.success ? parsedBody.data.error?.message : undefined;

  const message = providerMessage ?? error.message;
  const statusLabel = typeof status === "number" ? ` (status ${status})` : "";
  return {
    status: typeof status === "number" ? status : null,
    message: `OpenRouter request failed${statusLabel}: ${message}`,
  };
}

function sleepMs(ms: number): Promise<void> {
  if (ms <= 0 || IS_TEST) return Promise.resolve();
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function backoffDelayMs(attempt: number): number {
  // attempt is 1-based here (attempt 1 already failed, we are waiting before attempt 2).
  const baseMs = 250;
  const maxMs = 1200;
  const exponential = baseMs * 2 ** Math.max(0, attempt - 1);
  const capped = Math.min(maxMs, exponential);
  const jitter = Math.floor(Math.random() * Math.max(1, Math.floor(capped * 0.25)));
  return capped + jitter;
}

function isRetryableOpenRouterAxiosError(error: unknown): boolean {
  if (!axios.isAxiosError(error)) return false;

  const status = error.response?.status;
  if (typeof status !== "number") {
    return true;
  }

  if (status === 408 || status === 429) return true;
  if (status >= 500 && status <= 599) return true;
  return false;
}
