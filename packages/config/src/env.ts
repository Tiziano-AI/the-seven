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

const PUBLIC_ORIGIN_LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

function publicOriginSchema(options: { default?: string } = {}) {
  const transformed = z
    .string()
    .url()
    .transform((value, ctx) => {
      const stripped = value.replace(/\/+$/, "");
      let parsed: URL;
      try {
        parsed = new URL(stripped);
      } catch {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "SEVEN_PUBLIC_ORIGIN must be a valid URL",
        });
        return z.NEVER;
      }
      if (parsed.pathname !== "/" || parsed.search !== "" || parsed.hash !== "") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "SEVEN_PUBLIC_ORIGIN must be a bare origin",
        });
        return z.NEVER;
      }
      return parsed.origin;
    });
  return options.default !== undefined ? transformed.default(options.default) : transformed;
}

function assertProductionPublicOrigin(origin: string) {
  const parsed = new URL(origin);
  const host = parsed.hostname.replace(/^\[/, "").replace(/\]$/, "");
  if (parsed.protocol !== "https:" || PUBLIC_ORIGIN_LOOPBACK_HOSTS.has(host)) {
    throw new Error("Production SEVEN_PUBLIC_ORIGIN must be HTTPS and non-loopback");
  }
}

const baseServerSchema = z.object({
  NODE_ENV: nodeEnvSchema.default("development"),
  PORT: z.coerce.number().int().min(0).max(65_535).default(0),
  DATABASE_URL: databaseUrlSchema,
  SEVEN_JOB_CREDENTIAL_SECRET: z.string().trim().min(16),
  SEVEN_PUBLIC_ORIGIN: publicOriginSchema({ default: "http://localhost" }),
  SEVEN_APP_NAME: z.string().trim().min(1).default("The Seven"),
  SEVEN_DEMO_ENABLED: z.enum(["0", "1"]).default("0"),
  SEVEN_DEMO_OPENROUTER_KEY: z.string().optional(),
  SEVEN_DEMO_RESEND_API_KEY: z.string().optional(),
  SEVEN_DEMO_EMAIL_FROM: z.string().optional(),
});

const operatorDoctorSchema = z.object({
  DATABASE_URL: databaseUrlSchema,
  SEVEN_JOB_CREDENTIAL_SECRET: z.string().trim().min(16),
  SEVEN_PUBLIC_ORIGIN: publicOriginSchema(),
  SEVEN_APP_NAME: z.string().trim().min(1),
  SEVEN_DEMO_ENABLED: z.enum(["0", "1"]).default("0"),
});

const liveProofSchema = z.object({
  SEVEN_BASE_URL: z.string().url(),
  SEVEN_PUBLIC_ORIGIN: publicOriginSchema(),
  SEVEN_BYOK_KEY: z.string().trim().min(1),
  SEVEN_DEMO_ENABLED: z.literal("1"),
  SEVEN_DEMO_OPENROUTER_KEY: z.string().trim().min(1),
  SEVEN_DEMO_RESEND_API_KEY: z.string().trim().min(1),
  SEVEN_DEMO_EMAIL_FROM: z.string().trim().min(1),
  SEVEN_DEMO_TEST_EMAIL: z.string().trim().email(),
});

const cliRuntimeSchema = z.object({
  SEVEN_BASE_URL: z.string().url(),
  SEVEN_BYOK_KEY: z.string().trim().optional(),
});

const playwrightProjectionSchema = z.object({
  SEVEN_PLAYWRIGHT_EXTERNAL_SERVER: z.enum(["0", "1"]).default("0"),
  SEVEN_PLAYWRIGHT_DEMO_COOKIE: z.string().trim().optional(),
  SEVEN_PLAYWRIGHT_DEMO_EMAIL: z.string().trim().email().optional(),
  SEVEN_PLAYWRIGHT_DEMO_EXPIRES_AT: z.coerce.number().int().positive().optional(),
  SEVEN_PLAYWRIGHT_SESSION_ID: z.coerce.number().int().positive().optional(),
  SEVEN_PLAYWRIGHT_SESSION_QUERY: z.string().trim().optional(),
});

export const OPERATOR_DOCTOR_REQUIRED_KEYS = [
  "DATABASE_URL",
  "SEVEN_JOB_CREDENTIAL_SECRET",
  "SEVEN_PUBLIC_ORIGIN",
  "SEVEN_APP_NAME",
] as const;

export const LIVE_PROOF_REQUIRED_KEYS = [
  "SEVEN_PUBLIC_ORIGIN",
  "SEVEN_BYOK_KEY",
  "SEVEN_DEMO_ENABLED",
  "SEVEN_DEMO_OPENROUTER_KEY",
  "SEVEN_DEMO_RESEND_API_KEY",
  "SEVEN_DEMO_EMAIL_FROM",
  "SEVEN_DEMO_TEST_EMAIL",
] as const;

export const RUNTIME_ENV_KEYS = [
  "DATABASE_URL",
  "SEVEN_JOB_CREDENTIAL_SECRET",
  "SEVEN_DEMO_OPENROUTER_KEY",
  "SEVEN_DEMO_RESEND_API_KEY",
  "SEVEN_BYOK_KEY",
] as const;

export type ServerRuntime = Readonly<{
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

export type CliRuntime = Readonly<{
  baseUrl: string;
  byokKey: string | null;
}>;

export type OperatorDoctorRuntime = Readonly<{
  databaseUrl: string;
  publicOrigin: string;
  appName: string;
  demoEnabled: boolean;
}>;

export type LiveProofRuntime = Readonly<{
  baseUrl: string;
  publicOrigin: string;
  byokKey: string;
  demoOpenRouterKey: string;
  demoResendApiKey: string;
  demoEmailFrom: string;
  demoTestEmail: string;
}>;

export type PlaywrightProjectionRuntime = Readonly<{
  externalServer: boolean;
  demoCookie: string | null;
  demoEmail: string | null;
  demoExpiresAt: number | null;
  sessionId: number | null;
  sessionQuery: string | null;
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

export function serverRuntime(input: NodeJS.ProcessEnv = process.env): ServerRuntime {
  loadCanonicalEnvFile();
  const parsed = baseServerSchema.parse(input);
  if (parsed.NODE_ENV === "production") {
    assertProductionPublicOrigin(parsed.SEVEN_PUBLIC_ORIGIN);
  }
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

export function cliRuntime(input: NodeJS.ProcessEnv = process.env): CliRuntime {
  loadCanonicalEnvFile();
  const parsed = cliRuntimeSchema.parse(input);
  return {
    baseUrl: parsed.SEVEN_BASE_URL,
    byokKey: parsed.SEVEN_BYOK_KEY ?? null,
  };
}

export function operatorDoctor(input: NodeJS.ProcessEnv = process.env): OperatorDoctorRuntime {
  const parsed = operatorDoctorSchema.parse(input);
  return {
    databaseUrl: parsed.DATABASE_URL,
    publicOrigin: parsed.SEVEN_PUBLIC_ORIGIN,
    appName: parsed.SEVEN_APP_NAME,
    demoEnabled: parsed.SEVEN_DEMO_ENABLED === "1",
  };
}

export function liveProof(input: NodeJS.ProcessEnv = process.env): LiveProofRuntime {
  loadCanonicalEnvFile();
  const parsed = liveProofSchema.parse(input);
  return {
    baseUrl: parsed.SEVEN_BASE_URL,
    publicOrigin: parsed.SEVEN_PUBLIC_ORIGIN,
    byokKey: parsed.SEVEN_BYOK_KEY,
    demoOpenRouterKey: parsed.SEVEN_DEMO_OPENROUTER_KEY,
    demoResendApiKey: parsed.SEVEN_DEMO_RESEND_API_KEY,
    demoEmailFrom: parsed.SEVEN_DEMO_EMAIL_FROM,
    demoTestEmail: parsed.SEVEN_DEMO_TEST_EMAIL,
  };
}

export function playwrightProjection(
  input: NodeJS.ProcessEnv = process.env,
): PlaywrightProjectionRuntime {
  const parsed = playwrightProjectionSchema.parse(input);
  return {
    externalServer: parsed.SEVEN_PLAYWRIGHT_EXTERNAL_SERVER === "1",
    demoCookie: parsed.SEVEN_PLAYWRIGHT_DEMO_COOKIE ?? null,
    demoEmail: parsed.SEVEN_PLAYWRIGHT_DEMO_EMAIL ?? null,
    demoExpiresAt: parsed.SEVEN_PLAYWRIGHT_DEMO_EXPIRES_AT ?? null,
    sessionId: parsed.SEVEN_PLAYWRIGHT_SESSION_ID ?? null,
    sessionQuery: parsed.SEVEN_PLAYWRIGHT_SESSION_QUERY ?? null,
  };
}

export function buildOpenRouterAppHeaders(env: ServerRuntime): OpenRouterAppHeaders {
  return {
    "HTTP-Referer": env.publicOrigin,
    "X-Title": env.appName,
  };
}
