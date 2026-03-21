import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1"],
  reactStrictMode: true,
  typedRoutes: true,
  transpilePackages: ["@the-seven/contracts", "@the-seven/config", "@the-seven/db"],
};

export default nextConfig;
