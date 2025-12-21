import { router } from "./_core/trpc";
import { authRouter } from "./edges/trpc/authRouter";
import { councilsRouter } from "./edges/trpc/councilsRouter";
import { modelsRouter } from "./edges/trpc/modelsRouter";
import { queryRouter } from "./edges/trpc/queryRouter";

export const appRouter = router({
  auth: authRouter,
  councils: councilsRouter,
  models: modelsRouter,
  query: queryRouter,
});

export type AppRouter = typeof appRouter;
