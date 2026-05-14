import { z } from "zod";
import type { OpenRouterResponse } from "./openrouter";
import { OpenRouterRequestFailedError } from "./openrouterErrors";

const openRouterUsageSchema = z.object({
  prompt_tokens: z.number().int().nonnegative(),
  completion_tokens: z.number().int().nonnegative(),
  total_tokens: z.number().int().nonnegative(),
});

const openRouterChoiceErrorSchema = z.object({
  code: z.number().int(),
  message: z.string(),
});

const openRouterStreamErrorSchema = z
  .object({
    code: z.union([z.string(), z.number()]).optional(),
    message: z.string().optional(),
  })
  .passthrough();

const openRouterStreamChunkSchema = z
  .object({
    id: z.string().optional(),
    model: z.string().nullish(),
    choices: z
      .array(
        z
          .object({
            delta: z
              .object({
                content: z.string().nullable().optional(),
              })
              .passthrough()
              .optional(),
            message: z
              .object({
                role: z.string().optional(),
                content: z.string().nullable().optional(),
              })
              .passthrough()
              .optional(),
            finish_reason: z.string().nullable().optional(),
            native_finish_reason: z.string().nullable().optional(),
            error: openRouterChoiceErrorSchema.optional(),
          })
          .passthrough(),
      )
      .optional(),
    usage: openRouterUsageSchema.optional(),
    error: openRouterStreamErrorSchema.optional(),
  })
  .passthrough();

type OpenRouterUsage = z.infer<typeof openRouterUsageSchema>;
type OpenRouterChoiceError = z.infer<typeof openRouterChoiceErrorSchema>;
type OpenRouterStreamChunk = z.infer<typeof openRouterStreamChunkSchema>;

function splitFirstSseEvent(buffer: string): { event: string; rest: string } | null {
  const lfIndex = buffer.indexOf("\n\n");
  const crlfIndex = buffer.indexOf("\r\n\r\n");
  if (lfIndex === -1 && crlfIndex === -1) {
    return null;
  }

  const useCrlf = crlfIndex !== -1 && (lfIndex === -1 || crlfIndex < lfIndex);
  const index = useCrlf ? crlfIndex : lfIndex;
  const separatorLength = useCrlf ? 4 : 2;
  return {
    event: buffer.slice(0, index),
    rest: buffer.slice(index + separatorLength),
  };
}

function sseEventData(event: string): string | null {
  const dataLines = event
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice("data:".length).trimStart());
  if (dataLines.length === 0) {
    return null;
  }
  return dataLines.join("\n");
}

function parseStreamChunk(payload: string) {
  const trimmed = payload.trim();
  if (trimmed.length === 0 || trimmed === "[DONE]") {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed) as unknown;
  } catch {
    throw new OpenRouterRequestFailedError({
      status: 200,
      message: "OpenRouter stream returned non-JSON event",
    });
  }

  return openRouterStreamChunkSchema.parse(parsed);
}

function buildErrorResponse(input: {
  id: string;
  model: string;
  error?: OpenRouterChoiceError;
}): OpenRouterResponse {
  return {
    id: input.id,
    model: input.model,
    choices: [
      {
        message: { role: "assistant", content: null },
        ...(input.error ? { error: input.error } : {}),
      },
    ],
  };
}

function choiceErrorFromStreamError(
  error: OpenRouterStreamChunk["error"],
): OpenRouterChoiceError | undefined {
  if (typeof error?.code !== "number") {
    return undefined;
  }
  return {
    code: error.code,
    message: error.message ?? "stream failed",
  };
}

/** Assembles OpenRouter SSE chat chunks into the existing complete-response shape. */
export async function parseStreamingChatCompletion(input: {
  response: Response;
  fallbackModel: string;
}): Promise<OpenRouterResponse> {
  const response = input.response;
  if (!response.body) {
    throw new OpenRouterRequestFailedError({
      status: response.status,
      message: "OpenRouter streaming response was missing a body",
    });
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let responseId: string | null = response.headers.get("x-generation-id");
  let responseModel: string | null = null;
  let content = "";
  let finishReason: string | null = null;
  let nativeFinishReason: string | null = null;
  let usage: OpenRouterUsage | undefined;

  async function processEvent(event: string) {
    const payload = sseEventData(event);
    if (payload === null) {
      return;
    }

    const chunk = parseStreamChunk(payload);
    if (chunk === null) {
      return;
    }

    responseId = chunk.id ?? responseId;
    responseModel = chunk.model ?? responseModel;
    usage = chunk.usage ?? usage;

    if (chunk.error) {
      const id = responseId;
      const model = responseModel;
      const choiceError = choiceErrorFromStreamError(chunk.error);
      const errorResponse =
        id && model ? buildErrorResponse({ id, model, error: choiceError }) : null;
      throw new OpenRouterRequestFailedError({
        status: typeof chunk.error.code === "number" ? chunk.error.code : null,
        code: chunk.error.code,
        message: `OpenRouter stream error: ${chunk.error.message ?? "stream failed"}`,
        response: errorResponse,
      });
    }

    const choice = chunk.choices?.[0];
    if (!choice) {
      return;
    }

    if (choice.error) {
      const id = responseId;
      const model = responseModel;
      const errorResponse =
        id && model ? buildErrorResponse({ id, model, error: choice.error }) : null;
      throw new OpenRouterRequestFailedError({
        status: choice.error.code,
        code: choice.error.code,
        message: `OpenRouter choice error ${choice.error.code}: ${choice.error.message}`,
        response: errorResponse,
      });
    }

    content += choice.delta?.content ?? choice.message?.content ?? "";
    finishReason = choice.finish_reason ?? finishReason;
    nativeFinishReason = choice.native_finish_reason ?? nativeFinishReason;
  }

  while (true) {
    const read = await reader.read();
    if (read.done) {
      break;
    }
    buffer += decoder.decode(read.value, { stream: true });
    let event = splitFirstSseEvent(buffer);
    while (event) {
      await processEvent(event.event);
      buffer = event.rest;
      event = splitFirstSseEvent(buffer);
    }
  }

  buffer += decoder.decode();
  if (buffer.trim().length > 0) {
    await processEvent(buffer);
  }

  if (!responseId) {
    throw new OpenRouterRequestFailedError({
      status: response.status,
      message: "OpenRouter streaming response was missing a generation id",
    });
  }
  if (!responseModel) {
    responseModel = input.fallbackModel;
  }

  return {
    id: responseId,
    model: responseModel,
    choices: [
      {
        message: {
          role: "assistant",
          content,
        },
        finish_reason: finishReason,
        native_finish_reason: nativeFinishReason,
      },
    ],
    ...(usage ? { usage } : {}),
  };
}
