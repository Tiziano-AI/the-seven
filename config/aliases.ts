import path from "path";

/**
 * Builds shared path aliases for tooling configuration.
 */
export function buildPathAliases(rootDir: string): Readonly<Record<string, string>> {
  return {
    "@": path.resolve(rootDir, "client", "src"),
    "@shared": path.resolve(rootDir, "shared"),
  };
}
