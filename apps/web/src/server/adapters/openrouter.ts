import "server-only";

import { buildOpenRouterAppHeaders, loadServerEnv } from "@the-seven/config";
import type { CouncilMemberTuningInput } from "@the-seven/contracts";
import { z } from "zod";

const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";
const IS_TEST = process.env.NODE_ENV === "test";

export type OpenRouterMessage = Readonly<{
  role: "system" | "user" | "assistant" | "tool";
  content: string;
}>;

export type OpenRouterRequest = Readonly<{
  model: string;
  messages: ReadonlyArray<OpenRouterMessage>;
  temperature?: number;
  top_p?: number;
  seed?: number;
  verbosity?: string;
  include_reasoning?: boolean;
  reasoning?: Readonly<{ effort?: string }>;
}>;

export type OpenRouterTuningOptions = Readonly<{
  temperature?: number;
  top_p?: number;
  seed?: number;
  verbosity?: string;
  include_reasoning?: boolean;
  reasoning?: Readonly<{ effort?: string }>;
}>;

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
      }),
      finish_reason: z.string().nullable().optional(),
      native_finish_reason: z.string().nullable().optional(),
      error: openRouterChoiceErrorSchema.optional(),
    }),
  ),
  usage: openRouterUsageSchema.optional(),
});

const openRouterGenerationResponseSchema = z
  .object({
    data: z.object({
      id: z.string(),
      model: z.string().nullish(),
      total_cost: z.union([z.number(), z.string()]).nullish(),
      tokens_prompt: z.number().int().nonnegative().nullish(),
      tokens_completion: z.number().int().nonnegative().nullish(),
      native_tokens_prompt: z.number().int().nonnegative().nullish(),
      native_tokens_completion: z.number().int().nonnegative().nullish(),
      native_tokens_reasoning: z.number().int().nonnegative().nullish(),
      num_media_prompt: z.number().int().nonnegative().nullish(),
      num_media_completion: z.number().int().nonnegative().nullish(),
      num_search_results: z.number().int().nonnegative().nullish(),
      cache_discount: z.union([z.number(), z.string()]).nullish(),
      upstream_inference_cost: z.union([z.number(), z.string()]).nullish(),
    }),
  })
  .passthrough();

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
      pricing: z.record(z.string(), z.string().nullish()).nullish(),
    }),
  ),
});

export type OpenRouterResponse = z.infer<typeof openRouterChatCompletionSchema>;
export type OpenRouterGeneration = z.infer<typeof openRouterGenerationResponseSchema>["data"];
export type OpenRouterModel = z.infer<typeof openRouterModelsResponseSchema>["data"][number];

export class OpenRouterRequestFailedError extends Error {
  readonly status: number | null;

  constructor(input: { status: number | null; message: string }) {
    super(input.message);
    this.name = "OpenRouterRequestFailedError";
    this.status = input.status;
  }
}

export class OpenRouterRateLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OpenRouterRateLimitError";
  }
}

function normalizeRequest(input: OpenRouterRequest): Record<string, unknown> {
  return {
    ...input,
    transforms: [],
    plugins: [],
  };
}

function buildHeaders(apiKey?: string): HeadersInit {
  const headers: Record<string, string> = {
    ...buildOpenRouterAppHeaders(loadServerEnv()),
    "Content-Type": "application/json",
  };
  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
  }
  return headers;
}

async function parseJson(response: Response): Promise<unknown> {
  const text = await response.text();
  return text ? (JSON.parse(text) as unknown) : null;
}

async function requestJson(input: {
  path: string;
  apiKey?: string;
  method?: "GET" | "POST";
  body?: unknown;
}): Promise<unknown> {
  const response = await fetch(`${OPENROUTER_BASE_URL}${input.path}`, {
    method: input.method ?? "GET",
    headers: buildHeaders(input.apiKey),
    body: input.body ? JSON.stringify(input.body) : undefined,
  });

  const data = await parseJson(response);
  if (response.ok) {
    return data;
  }

  const parsed = openRouterErrorBodySchema.safeParse(data);
  const message = parsed.success
    ? (parsed.data.error?.message ?? response.statusText)
    : response.statusText;
  throw new OpenRouterRequestFailedError({
    status: response.status,
    message: `OpenRouter request failed (status ${response.status}): ${message}`,
  });
}

function backoffDelayMs(attempt: number): number {
  const baseMs = 250;
  const maxMs = 1200;
  const exponential = baseMs * 2 ** Math.max(0, attempt - 1);
  const capped = Math.min(maxMs, exponential);
  const jitter = Math.floor(Math.random() * Math.max(1, Math.floor(capped * 0.25)));
  return capped + jitter;
}

function sleepMs(ms: number): Promise<void> {
  if (ms <= 0 || IS_TEST) {
    return Promise.resolve();
  }
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableStatus(status: number | null): boolean {
  if (status === null) {
    return true;
  }
  return status === 408 || status === 409 || status === 429 || (status >= 500 && status <= 599);
}

export function normalizeCouncilMemberTuningInput(
  tuning: CouncilMemberTuningInput | null | undefined,
  supportedParameters?: ReadonlyArray<string>,
): OpenRouterTuningOptions {
  const supports = (param: string) => !supportedParameters || supportedParameters.includes(param);
  return {
    ...(typeof tuning?.temperature === "number" && supports("temperature")
      ? { temperature: tuning.temperature }
      : {}),
    ...(typeof tuning?.topP === "number" && supports("top_p") ? { top_p: tuning.topP } : {}),
    ...(typeof tuning?.seed === "number" && supports("seed") ? { seed: tuning.seed } : {}),
    ...(tuning?.verbosity && supports("verbosity") ? { verbosity: tuning.verbosity } : {}),
    ...(typeof tuning?.includeReasoning === "boolean" && supports("include_reasoning")
      ? { include_reasoning: tuning.includeReasoning }
      : {}),
    ...(tuning?.reasoningEffort && supports("reasoning")
      ? { reasoning: { effort: tuning.reasoningEffort } }
      : {}),
  };
}

export async function callOpenRouter(
  apiKey: string,
  request: OpenRouterRequest,
): Promise<OpenRouterResponse> {
  const normalized = normalizeRequest(request);
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      const data = await requestJson({
        path: "/chat/completions",
        apiKey,
        method: "POST",
        body: normalized,
      });
      return openRouterChatCompletionSchema.parse(data);
    } catch (error) {
      lastError = error;
      if (
        error instanceof OpenRouterRequestFailedError &&
        attempt < 2 &&
        isRetryableStatus(error.status)
      ) {
        await sleepMs(backoffDelayMs(attempt));
        continue;
      }
      throw error;
    }
  }

  throw lastError instanceof Error ? lastError : new Error("OpenRouter request failed");
}

export async function fetchOpenRouterModels(): Promise<OpenRouterModel[]> {
  const data = await requestJson({ path: "/models" });
  return openRouterModelsResponseSchema.parse(data).data;
}

export async function validateOpenRouterApiKey(apiKey: string): Promise<boolean> {
  try {
    await requestJson({ path: "/auth/key", apiKey });
    return true;
  } catch (error) {
    if (error instanceof OpenRouterRequestFailedError && error.status === 401) {
      return false;
    }
    throw error;
  }
}

export async function fetchOpenRouterGeneration(
  apiKey: string,
  generationId: string,
): Promise<OpenRouterGeneration> {
  let lastError: unknown = null;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const data = await requestJson({
        path: `/generation?id=${encodeURIComponent(generationId)}`,
        apiKey,
      });
      return openRouterGenerationResponseSchema.parse(data).data;
    } catch (error) {
      lastError = error;
      if (
        error instanceof OpenRouterRequestFailedError &&
        attempt < 3 &&
        isRetryableStatus(error.status)
      ) {
        await sleepMs(backoffDelayMs(attempt));
        continue;
      }
      throw error;
    }
  }

  throw lastError instanceof Error ? lastError : new Error("OpenRouter generation lookup failed");
}
