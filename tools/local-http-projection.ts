import path from "node:path";
import { readEnvAssignments } from "./env-doctor";
import { allocateFreeLoopbackPort, buildLocalHttpProjection } from "./local-http";
import { buildLocalOperatorEnv } from "./local-operator-env";

function envWithLocalAssignments(repoRoot: string): NodeJS.ProcessEnv {
  return buildLocalOperatorEnv({
    assignments: readEnvAssignments(path.join(repoRoot, ".env.local")),
    env: process.env,
  });
}

/**
 * Prints the non-secret local HTTP projection fields consumed by non-TS launch
 * wrappers such as the Python gate.
 */
async function main() {
  const port = await allocateFreeLoopbackPort();
  const projection = buildLocalHttpProjection({
    env: envWithLocalAssignments(process.cwd()),
    port,
  });
  process.stdout.write(
    `${JSON.stringify({
      PORT: projection.env.PORT,
      SEVEN_BASE_URL: projection.env.SEVEN_BASE_URL,
      SEVEN_NEXT_DIST_DIR: projection.env.SEVEN_NEXT_DIST_DIR,
      SEVEN_PUBLIC_ORIGIN: projection.env.SEVEN_PUBLIC_ORIGIN,
    })}\n`,
  );
}

await main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
