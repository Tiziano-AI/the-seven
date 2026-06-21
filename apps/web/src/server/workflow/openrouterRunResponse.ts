import type { MemberPosition } from "@the-seven/contracts";

import type { OpenRouterResponse } from "../adapters/openrouter";

export class OpenRouterPhaseRateLimitError extends Error {
  readonly status: number | null;

  constructor(input: { message: string; status: number | null }) {
    super(input.message);
    this.name = "OpenRouterPhaseRateLimitError";
    this.status = input.status;
  }
}

export class OpenRouterUnsupportedParameterError extends Error {
  readonly deniedParameters: ReadonlyArray<string>;

  constructor(input: { modelId: string; deniedParameters: ReadonlyArray<string> }) {
    super(
      `Unsupported OpenRouter parameter(s) for ${input.modelId}: ${input.deniedParameters.join(", ")}`,
    );
    this.name = "OpenRouterUnsupportedParameterError";
    this.deniedParameters = input.deniedParameters;
  }
}

export function extractAssistantContent(input: {
  phase: 1 | 2 | 3;
  memberPosition: MemberPosition;
  modelId: string;
  response: OpenRouterResponse;
}) {
  const firstChoice = input.response.choices[0];
  if (!firstChoice) {
    throw new Error(
      `OpenRouter returned 0 choices for phase ${input.phase}, member ${input.memberPosition}, model ${input.modelId}`,
    );
  }

  if (firstChoice.error?.code === 429) {
    throw new OpenRouterPhaseRateLimitError({
      message: "OpenRouter rate limit exceeded",
      status: firstChoice.error.code,
    });
  }

  if (firstChoice.error) {
    throw new Error(
      `OpenRouter choice error ${firstChoice.error.code}: ${firstChoice.error.message}`,
    );
  }

  const content = firstChoice.message.content;
  if (content === null || content.trim().length === 0) {
    throw new Error(
      `OpenRouter returned empty content for phase ${input.phase}, member ${input.memberPosition}, model ${input.modelId}`,
    );
  }

  return content;
}
