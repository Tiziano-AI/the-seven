import { z } from "zod";

/**
 * Provider model reference schema for OpenRouter-backed models.
 */
export const providerModelRefSchema = z.object({
  provider: z.literal("openrouter"),
  modelId: z.string().trim().min(1).max(255),
});

/**
 * Inferred input type for provider model references.
 */
export type ProviderModelRefInput = z.infer<typeof providerModelRefSchema>;
