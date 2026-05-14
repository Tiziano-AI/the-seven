import type { CouncilMemberTuningInput } from "@the-seven/contracts";
import { afterEach, describe, expect, test, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@the-seven/config", () => ({
  buildOpenRouterAppHeaders: () => ({
    "HTTP-Referer": "http://localhost:3000",
    "X-Title": "The Seven",
  }),
  PROVIDER_CHAT_REQUEST_TIMEOUT_MS: 900_000,
  serverRuntime: () => ({
    appName: "The Seven",
    publicOrigin: "http://localhost:3000",
  }),
}));

import {
  callOpenRouter,
  materializeCouncilMemberTuningInput,
  type OpenRouterRequestFailedError,
  validateOpenRouterApiKey,
} from "./openrouter";

function streamEvent(payload: unknown) {
  return `data: ${JSON.stringify(payload)}\n\n`;
}

function streamDone() {
  return "data: [DONE]\n\n";
}

function streamCompletion(input: {
  id: string;
  model?: string;
  content: string;
  status?: number;
  error?: Readonly<{ code: number; message: string }>;
}) {
  const choice = input.error
    ? {
        message: { role: "assistant", content: null },
        error: input.error,
      }
    : {
        delta: { content: input.content },
        finish_reason: "stop",
        native_finish_reason: "stop",
      };
  return new Response(
    streamEvent({
      id: input.id,
      ...(input.model ? { model: input.model } : {}),
      choices: [choice],
    }) + streamDone(),
    {
      status: input.status ?? 200,
      headers: { "Content-Type": "text/event-stream" },
    },
  );
}

describe("OpenRouter tuning materialization", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  test("denies unsupported non-null tuning without marking it sent", () => {
    const tuning = {
      temperature: 0.7,
      topP: 0.9,
      seed: null,
      verbosity: null,
      reasoningEffort: null,
      includeReasoning: null,
    } satisfies CouncilMemberTuningInput;

    const materialized = materializeCouncilMemberTuningInput(tuning, ["temperature"]);

    expect(materialized.options).toEqual({ temperature: 0.7 });
    expect(materialized.sentParameters).toEqual(["temperature"]);
    expect(materialized.deniedParameters).toEqual(["top_p"]);
  });

  test("maps transport failures to upstream provider errors", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));

    await expect(validateOpenRouterApiKey("sk-or-test")).rejects.toMatchObject({
      name: "OpenRouterRequestFailedError",
      status: null,
    } satisfies Partial<OpenRouterRequestFailedError>);
  });

  test("keeps the request timeout active through response body reads", async () => {
    vi.useFakeTimers();
    let fetchSignal: AbortSignal | null = null;
    const fetchMock = vi.fn((_url: string, init: RequestInit) => {
      fetchSignal = init.signal instanceof AbortSignal ? init.signal : null;
      return Promise.resolve({
        ok: true,
        status: 200,
        statusText: "OK",
        text: () =>
          new Promise<string>((_resolve, reject) => {
            fetchSignal?.addEventListener(
              "abort",
              () => {
                reject(new DOMException("The operation was aborted.", "AbortError"));
              },
              { once: true },
            );
          }),
      } as Response);
    });
    vi.stubGlobal("fetch", fetchMock);

    const validation = expect(validateOpenRouterApiKey("sk-or-test")).rejects.toMatchObject({
      name: "OpenRouterRequestFailedError",
      code: "timeout",
      status: null,
    } satisfies Partial<OpenRouterRequestFailedError>);
    await vi.advanceTimersByTimeAsync(900_000);

    await validation;
  });

  test("retries retryable OpenRouter choice errors", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        streamCompletion({
          id: "gen-failed",
          model: "provider/model",
          content: "",
          error: { code: 502, message: "upstream unavailable" },
        }),
      )
      .mockResolvedValueOnce(
        streamCompletion({ id: "gen-ok", model: "provider/model", content: "done" }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const response = await callOpenRouter("sk-or-test", {
      model: "provider/model",
      messages: [{ role: "user", content: "hello" }],
    });

    expect(response.id).toBe("gen-ok");
    expect(response.choices[0]?.message.content).toBe("done");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual(
      expect.objectContaining({ stream: true }),
    );
  });

  test("uses the exact requested model when a successful stream omits chunk model", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(streamCompletion({ id: "gen-no-model", content: "done" }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await callOpenRouter("sk-or-test", {
      model: "openai/gpt-5.5-pro",
      messages: [{ role: "user", content: "hello" }],
    });

    expect(response).toMatchObject({
      id: "gen-no-model",
      model: "openai/gpt-5.5-pro",
      choices: [{ message: { content: "done" } }],
    });
  });

  test("carries the final retryable choice-error response when retries exhaust", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        streamCompletion({
          id: "gen-first-failed",
          model: "provider/model",
          content: "",
          error: { code: 429, message: "rate limited upstream" },
        }),
      )
      .mockResolvedValueOnce(
        streamCompletion({
          id: "gen-final-failed",
          model: "provider/model",
          content: "",
          error: { code: 429, message: "rate limited upstream" },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      callOpenRouter("sk-or-test", {
        model: "provider/model",
        messages: [{ role: "user", content: "hello" }],
      }),
    ).rejects.toMatchObject({
      name: "OpenRouterRequestFailedError",
      status: 429,
      response: expect.objectContaining({
        id: "gen-final-failed",
        model: "provider/model",
      }),
    } satisfies Partial<OpenRouterRequestFailedError>);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  test("carries the final retryable top-level stream-error response when retries exhaust", async () => {
    const streamError = () =>
      new Response(
        streamEvent({
          id: "gen-stream-failed",
          model: "provider/model",
          error: { code: 502, message: "upstream stream failed" },
        }) + streamDone(),
        {
          status: 200,
          headers: { "Content-Type": "text/event-stream" },
        },
      );
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(streamError())
      .mockResolvedValueOnce(streamError());
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      callOpenRouter("sk-or-test", {
        model: "provider/model",
        messages: [{ role: "user", content: "hello" }],
      }),
    ).rejects.toMatchObject({
      name: "OpenRouterRequestFailedError",
      status: 502,
      response: expect.objectContaining({
        id: "gen-stream-failed",
        model: "provider/model",
      }),
    } satisfies Partial<OpenRouterRequestFailedError>);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  test("retries a successful-status stream body termination", async () => {
    const terminatedBody = new ReadableStream({
      pull(controller) {
        controller.error(new Error("terminated"));
      },
    });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(terminatedBody, {
          status: 200,
          headers: { "Content-Type": "text/event-stream" },
        }),
      )
      .mockResolvedValueOnce(
        streamCompletion({ id: "gen-retry-ok", model: "provider/model", content: "done" }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const response = await callOpenRouter("sk-or-test", {
      model: "provider/model",
      messages: [{ role: "user", content: "hello" }],
    });

    expect(response.id).toBe("gen-retry-ok");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  test("retries a successful-status non-streaming provider response", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({ id: "gen-json", model: "provider/model", choices: [] }, { status: 200 }),
      )
      .mockResolvedValueOnce(
        streamCompletion({ id: "gen-stream-ok", model: "provider/model", content: "done" }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const response = await callOpenRouter("sk-or-test", {
      model: "provider/model",
      messages: [{ role: "user", content: "hello" }],
    });

    expect(response.id).toBe("gen-stream-ok");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
