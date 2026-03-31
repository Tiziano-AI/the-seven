import { runCli } from "./batch";

const exitCode = await runCli(process.argv.slice(2));
process.exitCode = exitCode;
