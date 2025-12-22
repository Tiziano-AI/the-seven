import {
  DEMO_CONSUME_LIMITS,
  DEMO_EMAIL_REQUEST_LIMITS,
  DEMO_RUN_LIMITS,
  type DemoRateLimitSpec,
} from "../domain/demoLimits";
import { applyRateLimit, type RateLimitDecision } from "./rateLimits";

type DemoRateLimitKind = "email_request" | "run" | "consume";

type RateLimitScopeSpec = Readonly<{
  label: string;
  limit: number;
  windowSeconds: number;
}>;

function scopeFor(kind: DemoRateLimitKind, suffix: string): string {
  return `demo:${kind}:${suffix}`;
}

async function applyScopes(scopes: ReadonlyArray<RateLimitScopeSpec>, now: Date): Promise<RateLimitDecision | null> {
  for (const scope of scopes) {
    const decision = await applyRateLimit({
      scope: scope.label,
      limit: scope.limit,
      windowSeconds: scope.windowSeconds,
      now,
    });
    if (!decision.allowed) {
      return decision;
    }
  }

  return null;
}

async function applySpec(params: {
  kind: DemoRateLimitKind;
  spec: DemoRateLimitSpec;
  email: string;
  ip: string | null;
  now: Date;
}): Promise<RateLimitDecision | null> {
  const scopes: RateLimitScopeSpec[] = [
    { label: scopeFor(params.kind, "global"), ...params.spec.global },
    { label: scopeFor(params.kind, `email:${params.email}`), ...params.spec.perEmail },
  ];
  if (params.ip) {
    scopes.push({ label: scopeFor(params.kind, `ip:${params.ip}`), ...params.spec.perIp });
  }

  return applyScopes(scopes, params.now);
}

export async function checkDemoEmailRequestLimits(params: {
  email: string;
  ip: string | null;
  now: Date;
}): Promise<RateLimitDecision | null> {
  return applySpec({
    kind: "email_request",
    spec: DEMO_EMAIL_REQUEST_LIMITS,
    email: params.email,
    ip: params.ip,
    now: params.now,
  });
}

export async function checkDemoRunLimits(params: {
  email: string;
  ip: string | null;
  now: Date;
}): Promise<RateLimitDecision | null> {
  return applySpec({
    kind: "run",
    spec: DEMO_RUN_LIMITS,
    email: params.email,
    ip: params.ip,
    now: params.now,
  });
}

/**
 * Applies demo consume limits (per IP + global).
 */
export async function checkDemoConsumeLimits(params: {
  ip: string | null;
  now: Date;
}): Promise<RateLimitDecision | null> {
  const scopes: RateLimitScopeSpec[] = [
    { label: scopeFor("consume", "global"), ...DEMO_CONSUME_LIMITS.global },
  ];
  if (params.ip) {
    scopes.push({ label: scopeFor("consume", `ip:${params.ip}`), ...DEMO_CONSUME_LIMITS.perIp });
  }
  return applyScopes(scopes, params.now);
}
