import "dotenv/config";

import { resolveIngressVersion, runBatch } from "./batchCore";
import { parseArgs, usage } from "./batchParse";

function writeStderr(message: string): void {
  process.stderr.write(`${message}\n`);
}

async function main(): Promise<void> {
  const parsedArgs = parseArgs(process.argv.slice(2));
  if (!parsedArgs.ok) {
    writeStderr(parsedArgs.error);
    writeStderr(usage());
    process.exitCode = 1;
    return;
  }

  const apiKey = process.env.SEVEN_BYOK_KEY;
  if (!apiKey || apiKey.trim().length === 0) {
    writeStderr("Missing SEVEN_BYOK_KEY.");
    writeStderr(usage());
    process.exitCode = 1;
    return;
  }

  const output = await runBatch({
    options: parsedArgs.options,
    apiKey,
    ingressVersion: resolveIngressVersion(),
    onProgress: writeStderr,
  });

  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
  process.exitCode = output.ok ? 0 : 1;
}

void main();
