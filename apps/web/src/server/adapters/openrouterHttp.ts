import {
  buildOpenRouterAppHeaders,
  PROVIDER_CHAT_REQUEST_TIMEOUT_MS,
  serverRuntime,
} from "@the-seven/config";
import { z } from "zod";
import type { OpenRouterRequest, OpenRouterResponse } from "./openrouter";
import { OpenRouterRequestFailedError } from "./openrouterErrors";
import { parseStreamingChatCompletion } from "./openrouterStreaming";

const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

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

function assertStreamingContentType(response: Response): void {
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.toLowerCase().includes("text/event-stream")) {
    return;
  }
  throw new OpenRouterRequestFailedError({
    status: 502,
    code: "invalid_content_type",
    message: `OpenRouter returned non-streaming response content-type ${contentType || "missing"}`,
  });
}

function transportFailure(input: {
  error: unknown;
  response: Response | null;
  signal?: AbortSignal;
  timedOut: boolean;
}): OpenRouterRequestFailedError {
  const message = input.error instanceof Error ? input.error.message : "transport failure";
  const code = input.signal?.aborted ? "aborted" : input.timedOut ? "timeout" : null;
  return new OpenRouterRequestFailedError({
    status: code === null && !input.response?.ok ? (input.response?.status ?? null) : null,
    code,
    message: `OpenRouter request failed before complete response: ${message}`,
  });
}

async function withOpenRouterTimeout<T>(input: {
  signal?: AbortSignal;
  execute: (signal: AbortSignal) => Promise<T>;
}): Promise<T> {
  let timedOut = false;
  const controller = new AbortController();
  const abort = () => {
    controller.abort(input.signal?.reason);
  };
  if (input.signal?.aborted) {
    abort();
  } else {
    input.signal?.addEventListener("abort", abort, { once: true });
  }
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort(new Error("OpenRouter request timed out"));
  }, PROVIDER_CHAT_REQUEST_TIMEOUT_MS);

  try {
    return await input.execute(controller.signal);
  } catch (error) {
    if (error instanceof OpenRouterRequestFailedError) {
      throw error;
    }
    throw transportFailure({
      error,
      response: null,
      signal: input.signal,
      timedOut,
    });
  } finally {
    input.signal?.removeEventListener("abort", abort);
    clearTimeout(timeout);
  }
}

/** Performs a non-chat OpenRouter JSON request under the shared timeout budget. */
export async function requestJson(input: {
  path: string;
  apiKey?: string;
  method?: "GET" | "POST";
  body?: unknown;
  signal?: AbortSignal;
}): Promise<unknown> {
  let response: Response | null = null;
  return withOpenRouterTimeout({
    signal: input.signal,
    execute: async (signal) => {
      response = await fetch(`${OPENROUTER_BASE_URL}${input.path}`, {
        method: input.method ?? "GET",
        headers: buildHeaders(input.apiKey),
        body: input.body ? JSON.stringify(input.body) : undefined,
        signal,
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
        code: parsed.success ? parsed.data.error?.code : null,
        message: `OpenRouter request failed (status ${response.status}): ${message}`,
      });
    },
  });
}

/** Sends one streaming chat completion and assembles it into a complete response. */
export async function requestChatCompletion(input: {
  apiKey: string;
  body: OpenRouterRequest;
  signal?: AbortSignal;
}): Promise<OpenRouterResponse> {
  let response: Response | null = null;
  return withOpenRouterTimeout({
    signal: input.signal,
    execute: async (signal) => {
      response = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
        method: "POST",
        headers: buildHeaders(input.apiKey),
        body: JSON.stringify({ ...normalizeRequest(input.body), stream: true }),
        signal,
      });

      if (!response.ok) {
        const data = await parseJson(response);
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

      assertStreamingContentType(response);
      return await parseStreamingChatCompletion({
        response,
        fallbackModel: input.body.model,
      });
    },
  });
}
