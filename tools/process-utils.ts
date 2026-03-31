import { type ChildProcess, spawn } from "node:child_process";

export type CommandResult = Readonly<{
  code: number;
  stdout: string;
  stderr: string;
}>;

export function sleep(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

export async function runCommand(
  command: string,
  args: ReadonlyArray<string>,
  input: Readonly<{ cwd?: string; env?: NodeJS.ProcessEnv; stdio?: "pipe" | "inherit" }> = {},
): Promise<CommandResult> {
  if (input.stdio === "inherit") {
    return await new Promise<CommandResult>((resolve, reject) => {
      const child = spawn(command, args, {
        cwd: input.cwd ?? process.cwd(),
        env: input.env ?? process.env,
        stdio: "inherit",
      });

      child.on("error", reject);
      child.on("close", (code) => {
        resolve({
          code: code ?? 1,
          stdout: "",
          stderr: "",
        });
      });
    });
  }

  return await new Promise<CommandResult>((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: input.cwd ?? process.cwd(),
      env: input.env ?? process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer | string) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk: Buffer | string) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      resolve({
        code: code ?? 1,
        stdout: stdout.trim(),
        stderr: stderr.trim(),
      });
    });
  });
}

export async function runCommandOrThrow(
  command: string,
  args: ReadonlyArray<string>,
  input: Readonly<{ cwd?: string; env?: NodeJS.ProcessEnv; stdio?: "pipe" | "inherit" }> = {},
) {
  const result = await runCommand(command, args, input);
  if (result.code !== 0) {
    throw new Error(result.stderr || result.stdout || `${command} ${args.join(" ")} failed`);
  }
  return result;
}

export async function stopChild(child: ChildProcess) {
  if (child.exitCode !== null) {
    return;
  }

  child.kill("SIGTERM");
  const deadline = Date.now() + 10_000;
  while (child.exitCode === null && Date.now() < deadline) {
    await sleep(250);
  }
  if (child.exitCode === null) {
    child.kill("SIGKILL");
  }
}
