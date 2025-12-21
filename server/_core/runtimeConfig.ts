export type EnvSource = Readonly<Record<string, string | undefined>>;

export type NodeEnv = "development" | "production" | "test";

export type SqliteConfig = Readonly<{
  path: string;
}>;

export type OpenRouterAppHeaders = Readonly<{
  "HTTP-Referer": string;
  "X-Title": string;
}>;

export type OpenRouterIdentityConfig = Readonly<{
  publicOrigin: string;
  appName: string;
}>;

export type DevRuntimeConfig = Readonly<{
  disableOpenRouterKeyValidation: boolean;
}>;

export type ServerRuntimeConfig = Readonly<{
  nodeEnv: NodeEnv;
  preferredPort: number;
  sqlite: SqliteConfig;
  openRouter: OpenRouterIdentityConfig;
  dev: DevRuntimeConfig;
}>;

function normalizeEnvValue(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

/**
 * Returns the normalized node environment for this process.
 *
 * - Default: `development`
 * - Accepted: `development` | `production` | `test`
 */
export function loadNodeEnv(env: EnvSource = process.env): NodeEnv {
  const raw = normalizeEnvValue(env.NODE_ENV);
  if (!raw) return "development";

  if (raw === "development" || raw === "production" || raw === "test") {
    return raw;
  }

  throw new Error(
    `NODE_ENV must be one of development|production|test (got "${raw}")`
  );
}

/**
 * Returns the preferred port for the server to bind to. The server may fall back
 * to a nearby available port if the preferred one is occupied.
 *
 * - Default: `3000`
 */
export function loadPreferredPort(env: EnvSource = process.env): number {
  const raw = normalizeEnvValue(env.PORT);
  if (!raw) return 3000;

  if (!/^\d+$/.test(raw)) {
    throw new Error(`PORT must be an integer (got "${raw}")`);
  }

  const port = Number.parseInt(raw, 10);
  if (port < 1 || port > 65535) {
    throw new Error(`PORT must be between 1 and 65535 (got ${port})`);
  }

  return port;
}

/**
 * Returns the SQLite database file path.
 *
 * - Default: `data/the-seven.db`
 */
export function loadSqlitePath(env: EnvSource = process.env): string {
  return normalizeEnvValue(env.SEVEN_DB_PATH) ?? "data/the-seven.db";
}

/**
 * Returns the OpenRouter identity values used for provider request attribution.
 *
 * These are not secrets; they are outgoing metadata headers.
 */
export function loadOpenRouterIdentityConfig(
  env: EnvSource = process.env
): OpenRouterIdentityConfig {
  const publicOrigin =
    normalizeEnvValue(env.SEVEN_PUBLIC_ORIGIN) ?? "http://localhost";
  const appName = normalizeEnvValue(env.SEVEN_APP_NAME) ?? "The Seven";

  return {
    publicOrigin,
    appName,
  };
}

export function loadOpenRouterAppHeaders(
  env: EnvSource = process.env
): OpenRouterAppHeaders {
  const identity = loadOpenRouterIdentityConfig(env);
  return {
    "HTTP-Referer": identity.publicOrigin,
    "X-Title": identity.appName,
  };
}

export function loadDevDisableOpenRouterKeyValidation(env: EnvSource = process.env): boolean {
  const raw = normalizeEnvValue(env.SEVEN_DEV_DISABLE_OPENROUTER_KEY_VALIDATION);
  if (!raw) return false;
  if (raw === "1") return true;
  if (raw === "0") return false;

  throw new Error(
    'SEVEN_DEV_DISABLE_OPENROUTER_KEY_VALIDATION must be "0" or "1" (got "' + raw + '")'
  );
}

/**
 * Validates and normalizes the environment contract for running the server.
 *
 * This is intentionally fail-fast for required dependencies (e.g. invalid env values).
 */
export function loadServerRuntimeConfig(
  env: EnvSource = process.env
): ServerRuntimeConfig {
  const nodeEnv = loadNodeEnv(env);
  const disableOpenRouterKeyValidation = loadDevDisableOpenRouterKeyValidation(env);
  if (disableOpenRouterKeyValidation && nodeEnv !== "development") {
    throw new Error(
      "SEVEN_DEV_DISABLE_OPENROUTER_KEY_VALIDATION is only allowed when NODE_ENV=development"
    );
  }

  return {
    nodeEnv,
    preferredPort: loadPreferredPort(env),
    sqlite: {
      path: loadSqlitePath(env),
    },
    openRouter: loadOpenRouterIdentityConfig(env),
    dev: {
      disableOpenRouterKeyValidation,
    },
  };
}

let cachedServerRuntimeConfig: ServerRuntimeConfig | null = null;

/**
 * Cached process-level runtime configuration. Call this at server start to
 * ensure required environment variables are present before serving.
 */
export function requireServerRuntimeConfig(): ServerRuntimeConfig {
  if (cachedServerRuntimeConfig) return cachedServerRuntimeConfig;
  cachedServerRuntimeConfig = loadServerRuntimeConfig();
  return cachedServerRuntimeConfig;
}

/**
 * Resets the cached runtime config (test-only).
 */
export function resetServerRuntimeConfigForTests(): void {
  cachedServerRuntimeConfig = null;
}
