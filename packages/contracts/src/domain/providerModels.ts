import { z } from "zod";

export const PROVIDERS = ["openrouter"] as const;

export type ProviderId = (typeof PROVIDERS)[number];

export type ProviderModelRef = Readonly<{
  provider: ProviderId;
  modelId: string;
}>;

export const providerModelRefSchema = z.object({
  provider: z.enum(PROVIDERS),
  modelId: z.string().trim().min(1).max(255),
});
