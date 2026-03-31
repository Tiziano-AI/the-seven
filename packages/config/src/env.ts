import { existsSync } from "node:fs";
import path from "node:path";
import { z } from "zod";

const nodeEnvSchema = z.enum(["development", "production", "test"]);
const databaseUrlSchema = z
  .string()
  .url()
  .refine((value) => {
    return value.startsWith("postgres://") || value.startsWith("postgresql://");
  }, "DATABASE_URL must use postgres:// or postgresql://");

const baseServerSchema = z.object({
  NODE_ENV: nodeEnvSchema.default("development"),
  PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
  DATABASE_URL: databaseUrlSchema,
  SEVEN_JOB_CREDENTIAL_SECRET: z.string().trim().min(16),
  SEVEN_PUBLIC_ORIGIN: z.string().url().default("http://localhost:3000"),
  SEVEN_APP_NAME: z.string().trim().min(1).default("The Seven"),
  SEVEN_DEMO_ENABLED: z.enum(["0", "1"]).default("0"),
  SEVEN_DEMO_OPENROUTER_KEY: z.string().optional(),
  SEVEN_DEMO_RESEND_API_KEY: z.string().optional(),
  SEVEN_DEMO_EMAIL_FROM: z.string().optional(),
});

const liveTestSchema = z.object({
  SEVEN_BASE_URL: z.string().url().default("http://127.0.0.1:3000"),
  SEVEN_BYOK_KEY: z.string().trim().min(1),
  SEVEN_DEMO_TEST_EMAIL: z.string().trim().email(),
});

export type ServerEnv = Readonly<{
  nodeEnv: "development" | "production" | "test";
  port: number;
  databaseUrl: string;
  jobCredentialSecret: string;
  publicOrigin: string;
  appName: string;
  demo: Readonly<{
    enabled: boolean;
    openRouterApiKey: string | null;
    resendApiKey: string | null;
    emailFrom: string | null;
  }>;
}>;

export type CliEnv = Readonly<{
  baseUrl: string;
  byokKey: string | null;
}>;

export type LiveTestEnv = Readonly<{
  baseUrl: string;
  byokKey: string;
  demoTestEmail: string;
}>;

export type OpenRouterAppHeaders = Readonly<{
  "HTTP-Referer": string;
  "X-Title": string;
}>;

declare global {
  var __sevenCanonicalEnvLoaded: boolean | undefined;
}

function resolveWorkspaceRoot(startDirectory = process.cwd()): string {
  let currentDirectory = path.resolve(startDirectory);

  while (true) {
    if (existsSync(path.join(currentDirectory, "pnpm-workspace.yaml"))) {
      return currentDirectory;
    }

    const parentDirectory = path.dirname(currentDirectory);
    if (parentDirectory === currentDirectory) {
      throw new Error("Unable to locate workspace root from current working directory");
    }
    currentDirectory = parentDirectory;
  }
}

function loadCanonicalEnvFile() {
  if (globalThis.__sevenCanonicalEnvLoaded) {
    return;
  }

  const envPath = path.join(resolveWorkspaceRoot(), ".env.local");
  if (existsSync(envPath)) {
    process.loadEnvFile(envPath);
  }

  globalThis.__sevenCanonicalEnvLoaded = true;
}

export function loadServerEnv(input: NodeJS.ProcessEnv = process.env): ServerEnv {
  loadCanonicalEnvFile();
  const parsed = baseServerSchema.parse(input);
  const demoEnabled = parsed.SEVEN_DEMO_ENABLED === "1";

  if (demoEnabled) {
    z.object({
      SEVEN_DEMO_OPENROUTER_KEY: z.string().trim().min(1),
      SEVEN_DEMO_RESEND_API_KEY: z.string().trim().min(1),
      SEVEN_DEMO_EMAIL_FROM: z.string().trim().min(1),
    }).parse(parsed);
  }

  return {
    nodeEnv: parsed.NODE_ENV,
    port: parsed.PORT,
    databaseUrl: parsed.DATABASE_URL,
    jobCredentialSecret: parsed.SEVEN_JOB_CREDENTIAL_SECRET,
    publicOrigin: parsed.SEVEN_PUBLIC_ORIGIN,
    appName: parsed.SEVEN_APP_NAME,
    demo: {
      enabled: demoEnabled,
      openRouterApiKey: demoEnabled ? (parsed.SEVEN_DEMO_OPENROUTER_KEY ?? null) : null,
      resendApiKey: demoEnabled ? (parsed.SEVEN_DEMO_RESEND_API_KEY ?? null) : null,
      emailFrom: demoEnabled ? (parsed.SEVEN_DEMO_EMAIL_FROM ?? null) : null,
    },
  };
}

export function loadCliEnv(input: NodeJS.ProcessEnv = process.env): CliEnv {
  loadCanonicalEnvFile();
  const parsed = z
    .object({
      SEVEN_BASE_URL: z.string().url().default("http://127.0.0.1:3000"),
      SEVEN_BYOK_KEY: z.string().trim().optional(),
    })
    .parse(input);

  return {
    baseUrl: parsed.SEVEN_BASE_URL,
    byokKey: parsed.SEVEN_BYOK_KEY ?? null,
  };
}

export function loadLiveTestEnv(input: NodeJS.ProcessEnv = process.env): LiveTestEnv {
  loadCanonicalEnvFile();
  const parsed = liveTestSchema.parse(input);
  return {
    baseUrl: parsed.SEVEN_BASE_URL,
    byokKey: parsed.SEVEN_BYOK_KEY,
    demoTestEmail: parsed.SEVEN_DEMO_TEST_EMAIL,
  };
}

export function buildOpenRouterAppHeaders(env: ServerEnv): OpenRouterAppHeaders {
  return {
    "HTTP-Referer": env.publicOrigin,
    "X-Title": env.appName,
  };
}
