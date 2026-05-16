const MODEL_TOKEN_LABELS = {
  ai: "AI",
  chatgpt: "ChatGPT",
  claude: "Claude",
  deepseek: "DeepSeek",
  flash: "Flash",
  gemini: "Gemini",
  gemma: "Gemma",
  glm: "GLM",
  gpt: "GPT",
  grok: "Grok",
  kimi: "Kimi",
  minimax: "MiniMax",
  mistral: "Mistral",
  moonshotai: "Moonshot AI",
  opus: "Opus",
  oss: "OSS",
  preview: "Preview",
  qwen: "Qwen",
  sonnet: "Sonnet",
  xai: "xAI",
  zai: "Z.AI",
} as const;

function modelTokenLabel(token: string): string {
  const lower = token.toLowerCase();
  if (/^[a-z]?\d+(?:\.\d+)?[a-z]$/u.test(lower)) {
    return lower.toUpperCase();
  }
  if (lower === "x" || lower === "z") {
    return lower.toUpperCase();
  }
  if (lower in MODEL_TOKEN_LABELS) {
    return MODEL_TOKEN_LABELS[lower as keyof typeof MODEL_TOKEN_LABELS];
  }
  return token.charAt(0).toUpperCase() + token.slice(1);
}

function readableSlugSegments(slug: string): string[] {
  const tokens = slug.split(/[-_]/g).filter((segment) => segment.length > 0);
  const segments: string[] = [];
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index] ?? "";
    const next = tokens[index + 1] ?? "";
    if (/^\d+$/.test(token) && /^\d+$/.test(next)) {
      segments.push(`${token}.${next}`);
      index += 1;
    } else if ((token === "x" || token === "z") && next === "ai") {
      segments.push(`${token}${next}`);
      index += 1;
    } else {
      segments.push(token);
    }
  }
  return segments;
}

/** Formats provider model slugs as human labels while preserving exact IDs elsewhere. */
export function readableModelLabel(modelId: string): string {
  const segments = modelId.split("/");
  const slug = segments[segments.length - 1] ?? modelId;
  return readableSlugSegments(slug).map(modelTokenLabel).join(" ");
}
