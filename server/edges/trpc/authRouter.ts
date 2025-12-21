import { TRPCError } from "@trpc/server";
import { publicProcedure, router } from "../../_core/trpc";
import { requireServerRuntimeConfig } from "../../_core/runtimeConfig";
import { validateOpenRouterApiKey } from "../../adapters/openrouter/client";

export const authRouter = router({
  validateKey: publicProcedure.query(async ({ ctx }) => {
    if (!ctx.apiKey) {
      throw new TRPCError({
        code: "UNAUTHORIZED",
        message: "Missing OpenRouter API key",
      });
    }

    const runtime = requireServerRuntimeConfig();
    if (runtime.nodeEnv === "development" && runtime.dev.disableOpenRouterKeyValidation) {
      return { valid: true };
    }

    try {
      const valid = await validateOpenRouterApiKey(ctx.apiKey);
      return { valid };
    } catch (error: unknown) {
      throw new TRPCError({
        code: "BAD_GATEWAY",
        message: error instanceof Error ? error.message : "OpenRouter request failed",
      });
    }
  }),
});
