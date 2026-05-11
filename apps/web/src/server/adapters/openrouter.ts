import "server-only";

import { buildOpenRouterAppHeaders, serverRuntime } from "@the-seven/config";
import type { CouncilMemberTuningInput } from "@the-seven/contracts";
import { z } from "zod";

const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";
const OPENROUTER_REQUEST_TIMEOUT_MS = 120_000;
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
  response_format?: OpenRouterResponseFormat;
  provider?: Readonly<{ require_parameters?: boolean }>;
}>;

export type OpenRouterTuningOptions = Readonly<{
  temperature?: number;
  top_p?: number;
  seed?: number;
  verbosity?: string;
  include_reasoning?: boolean;
  reasoning?: Readonly<{ effort?: string }>;
}>;

export type OpenRouterResponseFormat = Readonly<{
  type: string;
  json_schema?: unknown;
}>;

export type MaterializedOpenRouterTuning = Readonly<{
  options: OpenRouterTuningOptions;
  sentParameters: string[];
  deniedParameters: string[];
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
        code: z.union([z.string(), z.number()]).optional(),
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
  readonly code: string | null;

  constructor(input: { status: number | null; code?: string | number | null; message: string }) {
    super(input.message);
    this.name = "OpenRouterRequestFailedError";
    this.status = input.status;
    this.code = input.code === undefined || input.code === null ? null : String(input.code);
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
    ...buildOpenRouterAppHeaders(serverRuntime()),
    "Content-Type": "application/json",
  };
  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
  }
  return headers;
}

async function parseJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new OpenRouterRequestFailedError({
      status: response.status,
      message: `OpenRouter returned non-JSON response (status ${response.status})`,
    });
  }
}

async function requestJson(input: {
  path: string;
  apiKey?: string;
  method?: "GET" | "POST";
  body?: unknown;
}): Promise<unknown> {
  let response: Response;
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort();
  }, OPENROUTER_REQUEST_TIMEOUT_MS);

  try {
    response = await fetch(`${OPENROUTER_BASE_URL}${input.path}`, {
      method: input.method ?? "GET",
      headers: buildHeaders(input.apiKey),
      body: input.body ? JSON.stringify(input.body) : undefined,
      signal: controller.signal,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "transport failure";
    throw new OpenRouterRequestFailedError({
      status: null,
      message: `OpenRouter request failed before response: ${message}`,
    });
  } finally {
    clearTimeout(timeout);
  }

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
    code: parsed.success ? parsed.data.error?.code : null,
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

function retryableChoiceError(response: OpenRouterResponse): OpenRouterRequestFailedError | null {
  const choiceError = response.choices[0]?.error;
  if (!choiceError || !isRetryableStatus(choiceError.code)) {
    return null;
  }

  return new OpenRouterRequestFailedError({
    status: choiceError.code,
    code: choiceError.code,
    message: `OpenRouter choice error ${choiceError.code}: ${choiceError.message}`,
  });
}

function materializeParam(input: {
  parameter: string;
  supported: ReadonlySet<string>;
  present: boolean;
  apply: () => OpenRouterTuningOptions;
}): MaterializedOpenRouterTuning {
  if (!input.present) {
    return { options: {}, sentParameters: [], deniedParameters: [] };
  }
  if (!input.supported.has(input.parameter)) {
    return {
      options: {},
      sentParameters: [],
      deniedParameters: [input.parameter],
    };
  }
  return {
    options: input.apply(),
    sentParameters: [input.parameter],
    deniedParameters: [],
  };
}

export function materializeCouncilMemberTuningInput(
  tuning: CouncilMemberTuningInput | null | undefined,
  supportedParameters: ReadonlyArray<string>,
): MaterializedOpenRouterTuning {
  const supported = new Set(supportedParameters);
  const rows = [
    materializeParam({
      parameter: "temperature",
      supported,
      present: typeof tuning?.temperature === "number",
      apply: () => ({ temperature: tuning?.temperature ?? undefined }),
    }),
    materializeParam({
      parameter: "top_p",
      supported,
      present: typeof tuning?.topP === "number",
      apply: () => ({ top_p: tuning?.topP ?? undefined }),
    }),
    materializeParam({
      parameter: "seed",
      supported,
      present: typeof tuning?.seed === "number",
      apply: () => ({ seed: tuning?.seed ?? undefined }),
    }),
    materializeParam({
      parameter: "verbosity",
      supported,
      present: Boolean(tuning?.verbosity),
      apply: () => ({ verbosity: tuning?.verbosity ?? undefined }),
    }),
    materializeParam({
      parameter: "include_reasoning",
      supported,
      present: typeof tuning?.includeReasoning === "boolean",
      apply: () => ({ include_reasoning: tuning?.includeReasoning ?? undefined }),
    }),
    materializeParam({
      parameter: "reasoning",
      supported,
      present: Boolean(tuning?.reasoningEffort),
      apply: () => ({ reasoning: { effort: tuning?.reasoningEffort ?? undefined } }),
    }),
  ];

  return {
    options: Object.assign({}, ...rows.map((row) => row.options)),
    sentParameters: rows.flatMap((row) => row.sentParameters),
    deniedParameters: rows.flatMap((row) => row.deniedParameters),
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
      const response = openRouterChatCompletionSchema.parse(data);
      const choiceRetryError = retryableChoiceError(response);
      if (choiceRetryError) {
        throw choiceRetryError;
      }
      return response;
    } catch (error) {
      lastError = error;
      const retryable =
        !(error instanceof OpenRouterRequestFailedError) || isRetryableStatus(error.status);
      if (attempt < 2 && retryable) {
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
    await requestJson({ path: "/key", apiKey });
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
      const retryable =
        !(error instanceof OpenRouterRequestFailedError) || isRetryableStatus(error.status);
      if (attempt < 3 && retryable) {
        await sleepMs(backoffDelayMs(attempt));
        continue;
      }
      throw error;
    }
  }

  throw lastError instanceof Error ? lastError : new Error("OpenRouter generation lookup failed");
}
