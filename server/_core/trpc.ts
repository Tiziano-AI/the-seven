import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { TrpcContext } from "./context";
import { getOrCreateByokUserContext } from "../workflows/byokUser";

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
});

export const router = t.router;
export const publicProcedure = t.procedure;

const requireByokUser = t.middleware(async ({ ctx, next }) => {
  if (!ctx.apiKey) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Missing OpenRouter API key",
    });
  }

  const { byokId, user } = await getOrCreateByokUserContext(ctx.apiKey);

  return next({
    ctx: {
      ...ctx,
      apiKey: ctx.apiKey,
      byokId,
      user,
    },
  });
});

export const byokProcedure = t.procedure.use(requireByokUser);
