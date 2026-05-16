const PROOF_MODEL_ROSTER: Readonly<Record<number, Readonly<{ id: string; name: string }>>> = {
  1: { id: "qwen/qwen3.6-35b-a3b", name: "Qwen3.6 35B A3B" },
  2: { id: "google/gemini-3.1-flash-lite", name: "Gemini 3.1 Flash Lite" },
  3: { id: "openai/gpt-5-mini", name: "GPT-5 Mini" },
  4: { id: "deepseek/deepseek-v4-flash", name: "DeepSeek V4 Flash" },
  5: { id: "openai/gpt-5-nano", name: "GPT-5 Nano" },
  6: { id: "mistralai/mistral-small-2603", name: "Mistral Small 2603" },
  7: { id: "minimax/minimax-m2.7", name: "MiniMax M2.7" },
};

const CATALOG_TOKEN_CAP = 32_000;

const NO_TUNING_MODEL_ROW = {
  modelId: "proof/no-tuning-model",
  modelName: "No Tuning Model",
  description: "Catalog model with no editable tuning controls",
  contextLength: 128_000,
  maxCompletionTokens: CATALOG_TOKEN_CAP,
  expirationDate: null,
  supportedParameters: [],
  inputModalities: ["text"],
  outputModalities: ["text"],
} as const;

export function proofModelForPosition(memberPosition: number) {
  return (
    PROOF_MODEL_ROSTER[memberPosition] ?? {
      id: `openrouter/seat-${memberPosition}`,
      name: `OpenRouter Seat ${memberPosition}`,
    }
  );
}

export function proofModelName(modelId: string) {
  return (
    Object.values(PROOF_MODEL_ROSTER).find((model) => model.id === modelId)?.name ??
    (modelId === "anthropic/claude-opus-4.7" ? "Claude Opus 4.7" : "Catalog Model")
  );
}

function catalogSuggestion(memberPosition: number) {
  const model = proofModelForPosition(memberPosition);
  return {
    modelId: model.id,
    modelName: model.name,
    description: "Current built-in roster model",
    contextLength: 200_000,
    maxCompletionTokens: CATALOG_TOKEN_CAP,
    expirationDate: null,
  };
}

/** Browser-proof catalog suggestions for the council model editor. */
export function modelAutocompletePayload() {
  return {
    suggestions: [
      {
        modelId: "anthropic/claude-opus-4.7",
        modelName: "Claude Opus 4.7",
        description: "Frontier reviewer model",
        contextLength: 200_000,
        maxCompletionTokens: CATALOG_TOKEN_CAP,
        expirationDate: null,
      },
      NO_TUNING_MODEL_ROW,
      catalogSuggestion(7),
    ],
  };
}

/** Browser-proof model validation row with supported tuning parameters. */
export function modelValidationPayload(modelId: string) {
  if (modelId === "proof/invalid-model") {
    return {
      valid: false,
      model: null,
    };
  }
  if (modelId === NO_TUNING_MODEL_ROW.modelId) {
    return {
      valid: true,
      model: NO_TUNING_MODEL_ROW,
    };
  }
  return {
    valid: true,
    model: {
      modelId,
      modelName: proofModelName(modelId),
      description: "Browser proof catalog model",
      contextLength: 200_000,
      maxCompletionTokens: CATALOG_TOKEN_CAP,
      expirationDate: null,
      supportedParameters: [
        "temperature",
        "top_p",
        "seed",
        "reasoning",
        "include_reasoning",
        "max_tokens",
        "response_format",
      ],
      inputModalities: ["text"],
      outputModalities: ["text"],
    },
  };
}
