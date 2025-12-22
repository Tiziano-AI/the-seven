import { z } from "zod";

export type ProviderId = "openrouter";

export type ProviderModelRef = Readonly<{
  provider: ProviderId;
  modelId: string;
}>;

export const providerModelRefSchema = z.object({
  provider: z.literal("openrouter"),
  modelId: z.string().trim().min(1).max(255),
});
