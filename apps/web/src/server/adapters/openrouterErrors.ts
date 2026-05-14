import type { OpenRouterResponse } from "./openrouter";

/** Error raised for failed OpenRouter transport, HTTP, or provider-choice calls. */
export class OpenRouterRequestFailedError extends Error {
  readonly status: number | null;
  readonly code: string | null;
  readonly response: OpenRouterResponse | null;

  constructor(input: {
    status: number | null;
    code?: string | number | null;
    message: string;
    response?: OpenRouterResponse | null;
  }) {
    super(input.message);
    this.name = "OpenRouterRequestFailedError";
    this.status = input.status;
    this.code = input.code === undefined || input.code === null ? null : String(input.code);
    this.response = input.response ?? null;
  }
}
