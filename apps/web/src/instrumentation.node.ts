import "server-only";

import { runMigrations } from "@the-seven/db/migrate";
import { startJobSupervisor } from "./server/workflow/jobSupervisor";

declare global {
  var __sevenNodeBootstrapPromise: Promise<void> | undefined;
}

async function bootstrapNodeRuntime() {
  await runMigrations();
  startJobSupervisor();
}

export async function registerNodeInstrumentation() {
  if (!globalThis.__sevenNodeBootstrapPromise) {
    globalThis.__sevenNodeBootstrapPromise = bootstrapNodeRuntime();
  }

  await globalThis.__sevenNodeBootstrapPromise;
}
