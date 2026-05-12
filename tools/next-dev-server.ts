import { runProjectedNextDevServer } from "./next-dev";

await runProjectedNextDevServer({
  repoRoot: process.cwd(),
  env: process.env,
}).catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
