export type RateLimitSpec = Readonly<{
  limit: number;
  windowSeconds: number;
}>;

export type DemoRateLimitSpec = Readonly<{
  perEmail: RateLimitSpec;
  perIp: RateLimitSpec;
  global: RateLimitSpec;
}>;

export const DEMO_AUTH_LINK_TTL_HOURS = 24;
export const DEMO_SESSION_TTL_HOURS = 24;

const DAY_SECONDS = 24 * 60 * 60;

export const DEMO_EMAIL_REQUEST_LIMITS: DemoRateLimitSpec = {
  perEmail: { limit: 2, windowSeconds: DAY_SECONDS },
  perIp: { limit: 10, windowSeconds: DAY_SECONDS },
  global: { limit: 1000, windowSeconds: DAY_SECONDS },
};

export const DEMO_RUN_LIMITS: DemoRateLimitSpec = {
  perEmail: { limit: 7, windowSeconds: DAY_SECONDS },
  perIp: { limit: 20, windowSeconds: DAY_SECONDS },
  global: { limit: 2000, windowSeconds: DAY_SECONDS },
};
