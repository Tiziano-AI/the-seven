import type { NextConfig } from "next";

function resolveLaunchOwnedDistDir(): string | undefined {
  const distDir = process.env.SEVEN_NEXT_DIST_DIR?.trim();
  if (!distDir) {
    return undefined;
  }
  if (!/^\.next-local\/[1-9]\d*$/.test(distDir)) {
    throw new Error("SEVEN_NEXT_DIST_DIR must be a launch-owned .next-local/<port> path.");
  }
  return distDir;
}

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1"],
  distDir: resolveLaunchOwnedDistDir(),
  reactStrictMode: true,
  typedRoutes: true,
  transpilePackages: ["@the-seven/contracts", "@the-seven/config", "@the-seven/db"],
};

export default nextConfig;
