export type RateLimitSpec = Readonly<{
  limit: number;
  windowSeconds: number;
}>;

export const DAY_SECONDS = 24 * 60 * 60;
export const MINUTE_SECONDS = 60;

export const MAX_REQUEST_BODY_BYTES = 512 * 1024;

export const DEMO_AUTH_LINK_TTL_HOURS = 24;
export const DEMO_SESSION_TTL_HOURS = 24;
export const MODEL_CATALOG_TTL_HOURS = 24;

export const DEMO_EMAIL_REQUEST_LIMITS = {
  perEmail: { limit: 2, windowSeconds: DAY_SECONDS },
  perIp: { limit: 10, windowSeconds: DAY_SECONDS },
  global: { limit: 1000, windowSeconds: DAY_SECONDS },
} as const satisfies Readonly<Record<string, RateLimitSpec>>;

export const DEMO_RUN_LIMITS = {
  perEmail: { limit: 7, windowSeconds: DAY_SECONDS },
  perIp: { limit: 20, windowSeconds: DAY_SECONDS },
  global: { limit: 2000, windowSeconds: DAY_SECONDS },
} as const satisfies Readonly<Record<string, RateLimitSpec>>;

export const DEMO_CONSUME_LIMITS = {
  perIp: { limit: 20, windowSeconds: DAY_SECONDS },
  global: { limit: 2000, windowSeconds: DAY_SECONDS },
} as const satisfies Readonly<Record<string, RateLimitSpec>>;

export const INGRESS_FLOOD_LIMITS = {
  perIp: { limit: 600, windowSeconds: MINUTE_SECONDS },
  global: { limit: 5000, windowSeconds: MINUTE_SECONDS },
} as const satisfies Readonly<Record<string, RateLimitSpec>>;

export const JOB_SUPERVISOR_POLL_INTERVAL_MS = 1_000;
export const JOB_LEASE_SECONDS = 60;
export const JOB_LEASE_RENEW_INTERVAL_MS = 10_000;
export const JOB_MAX_CONCURRENCY = 2;
export const JOB_MAX_ATTEMPTS = 3;

export const PROVIDER_OUTPUT_TOKEN_LIMITS = {
  phase1: 8192,
  phase2: 16_384,
  phase3: 16_384,
} as const;

export const PROVIDER_CHAT_REQUEST_TIMEOUT_MS = 900_000;
