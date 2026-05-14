import net from "node:net";
import { parsePublicOrigin } from "@the-seven/config";

const LOCAL_PUBLIC_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);
const LOOPBACK_HOST = "127.0.0.1";
const NEXT_LOCAL_DIST_ROOT = ".next-local";

export type LocalHttpProjection = Readonly<{
  port: number;
  baseUrl: string;
  publicOrigin: string;
  nextDistDir: string;
  env: NodeJS.ProcessEnv;
}>;

function isLoopbackOrigin(value: string): boolean {
  const parsed = new URL(parsePublicOrigin(value));
  const host = parsed.hostname.replace(/^\[/, "").replace(/\]$/, "");
  return LOCAL_PUBLIC_HOSTS.has(host);
}

function isServerAddressInfo(value: string | net.AddressInfo | null): value is net.AddressInfo {
  return typeof value === "object" && value !== null && Number.isInteger(value.port);
}

/** Returns the launch-owned Next dev distDir for one local HTTP port. */
export function buildLocalNextDistDir(port: number): string {
  return `${NEXT_LOCAL_DIST_ROOT}/${port}`;
}

/** Finds one available loopback port for local operator-owned HTTP launches. */
export async function allocateFreeLoopbackPort(): Promise<number> {
  const server = net.createServer();
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, LOOPBACK_HOST, resolve);
  });
  const address = server.address();
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
  if (!isServerAddressInfo(address)) {
    throw new Error("Failed to allocate a loopback HTTP port.");
  }
  return address.port;
}

/** Builds the single effective local HTTP projection for child processes. */
export function buildLocalHttpProjection(input: {
  env: NodeJS.ProcessEnv;
  port: number;
}): LocalHttpProjection {
  const baseUrl = `http://${LOOPBACK_HOST}:${input.port}`;
  const nextDistDir = buildLocalNextDistDir(input.port);
  const configuredPublicOrigin = input.env.SEVEN_PUBLIC_ORIGIN?.trim();
  const publicOrigin =
    configuredPublicOrigin && !isLoopbackOrigin(configuredPublicOrigin)
      ? parsePublicOrigin(configuredPublicOrigin)
      : `http://localhost:${input.port}`;

  return {
    port: input.port,
    baseUrl,
    publicOrigin,
    nextDistDir,
    env: {
      ...input.env,
      PORT: String(input.port),
      SEVEN_BASE_URL: baseUrl,
      SEVEN_NEXT_DIST_DIR: nextDistDir,
      SEVEN_PUBLIC_ORIGIN: publicOrigin,
    },
  };
}

/** Allocates and materializes the local HTTP projection in one step. */
export async function materializeLocalHttpProjection(
  env: NodeJS.ProcessEnv,
): Promise<LocalHttpProjection> {
  return buildLocalHttpProjection({
    env,
    port: await allocateFreeLoopbackPort(),
  });
}
