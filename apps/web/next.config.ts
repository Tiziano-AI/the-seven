import type { NextConfig } from "next";
import { PHASE_DEVELOPMENT_SERVER } from "next/constants";

function resolveLaunchOwnedDistDir(input: {
  env: NodeJS.ProcessEnv;
  phase: string;
}): string | undefined {
  const distDir = input.env.SEVEN_NEXT_DIST_DIR?.trim();
  if (!distDir) {
    return undefined;
  }
  if (input.phase !== PHASE_DEVELOPMENT_SERVER) {
    throw new Error("SEVEN_NEXT_DIST_DIR is only valid for launch-owned next dev.");
  }
  if (!/^\.next-local\/[1-9]\d*$/.test(distDir)) {
    throw new Error("SEVEN_NEXT_DIST_DIR must be a launch-owned .next-local/<port> path.");
  }
  return distDir;
}

/** Builds Next config from the current phase so local distDir isolation cannot leak into builds. */
export function buildNextConfig(phase: string, env: NodeJS.ProcessEnv = process.env): NextConfig {
  return {
    allowedDevOrigins: ["127.0.0.1"],
    devIndicators: false,
    distDir: resolveLaunchOwnedDistDir({ env, phase }),
    reactStrictMode: true,
    typedRoutes: true,
    transpilePackages: ["@the-seven/contracts", "@the-seven/config", "@the-seven/db"],
  };
}

function nextConfig(phase: string): NextConfig {
  return buildNextConfig(phase);
}

export default nextConfig;
