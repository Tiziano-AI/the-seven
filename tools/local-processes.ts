import path from "node:path";
import { runCommand } from "./process-utils";

export type LocalProcessRow = Readonly<{
  pid: number;
  ppid: number;
  command: string;
}>;

export type LocalWorkerProcess = Readonly<
  LocalProcessRow & {
    cwd: string | null;
  }
>;

function isPositiveInteger(value: string): boolean {
  return /^\d+$/.test(value) && Number.parseInt(value, 10) > 0;
}

export function parseProcessTable(stdout: string): LocalProcessRow[] {
  return stdout
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .flatMap((line) => {
      const match = line.match(/^(\d+)\s+(\d+)\s+(.+)$/);
      if (!match) return [];
      const [, pid, ppid, command] = match;
      if (!isPositiveInteger(pid) || !isPositiveInteger(ppid) || command.trim().length === 0) {
        return [];
      }
      return [
        {
          pid: Number.parseInt(pid, 10),
          ppid: Number.parseInt(ppid, 10),
          command: command.trim(),
        },
      ];
    });
}

export function isLocalWorkerCommand(command: string): boolean {
  const normalized = command.trim();
  return (
    /\bpnpm(?:\.cjs)?\s+local:dev\b/.test(normalized) ||
    /\btools\/local-dev\.ts\s+dev\b/.test(normalized) ||
    /\bnext(?:\.js)?\s+dev\b/.test(normalized) ||
    /\bnext-server\b/.test(normalized)
  );
}

export function parseLsofCwdOutput(stdout: string): string | null {
  for (const line of stdout.split("\n")) {
    if (line.startsWith("n")) {
      const cwd = line.slice(1).trim();
      return cwd.length > 0 ? cwd : null;
    }
  }
  return null;
}

function isInsideRepo(repoRoot: string, candidatePath: string): boolean {
  const relative = path.relative(path.resolve(repoRoot), path.resolve(candidatePath));
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

async function readProcessCwd(pid: number): Promise<string | null> {
  const result = await runCommand("lsof", ["-a", "-p", String(pid), "-d", "cwd", "-Fn"]);
  if (result.code !== 0) {
    return null;
  }
  return parseLsofCwdOutput(result.stdout);
}

export async function listSiblingLocalWorkers(input: {
  repoRoot: string;
  currentPid: number;
}): Promise<LocalWorkerProcess[]> {
  const ps = await runCommand("ps", ["-axo", "pid=,ppid=,command="]);
  if (ps.code !== 0) {
    throw new Error(ps.stderr || ps.stdout || "Unable to inspect local process table.");
  }

  const rows = parseProcessTable(ps.stdout).filter(
    (row) => row.pid !== input.currentPid && isLocalWorkerCommand(row.command),
  );
  const workers: LocalWorkerProcess[] = [];

  for (const row of rows) {
    const cwd = await readProcessCwd(row.pid);
    if (cwd !== null && isInsideRepo(input.repoRoot, cwd)) {
      workers.push({ ...row, cwd });
    }
  }

  return workers;
}

export function formatLocalWorkerProcess(worker: LocalWorkerProcess): string {
  const cwd = worker.cwd === null ? "cwd unknown" : worker.cwd;
  return `pid ${worker.pid} (${cwd}): ${worker.command}`;
}

export async function assertNoSiblingLocalWorkers(input: {
  repoRoot: string;
  currentPid: number;
}): Promise<void> {
  const workers = await listSiblingLocalWorkers(input);
  if (workers.length === 0) {
    return;
  }

  throw new Error(
    [
      "`pnpm local:live` requires exclusive local job-worker ownership for this repo.",
      "Stop same-repo `pnpm local:dev` / `next dev` processes before running live proof.",
      ...workers.map((worker) => `- ${formatLocalWorkerProcess(worker)}`),
    ].join("\n"),
  );
}
