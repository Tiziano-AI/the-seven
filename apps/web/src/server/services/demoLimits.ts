import "server-only";

import {
  DEMO_CONSUME_LIMITS,
  DEMO_EMAIL_REQUEST_LIMITS,
  DEMO_RUN_LIMITS,
  type RateLimitSpec,
} from "@the-seven/config";
import { admitFixedWindowLimit } from "./rateLimits";

type ScopedLimit = Readonly<{
  scope: string;
  spec: RateLimitSpec;
}>;

function scopeFor(kind: "email_request" | "run" | "consume", suffix: string) {
  return `demo:${kind}:${suffix}`;
}

function buildEmailScopes(input: {
  kind: "email_request" | "run";
  limits: Readonly<{
    perEmail: RateLimitSpec;
    perIp: RateLimitSpec;
    global: RateLimitSpec;
  }>;
  email: string;
  ip: string | null;
}) {
  const scopes: ScopedLimit[] = [
    { scope: scopeFor(input.kind, "global"), spec: input.limits.global },
    { scope: scopeFor(input.kind, `email:${input.email}`), spec: input.limits.perEmail },
  ];
  if (input.ip) {
    scopes.push({ scope: scopeFor(input.kind, `ip:${input.ip}`), spec: input.limits.perIp });
  }
  return scopes;
}

async function admitScopes(scopes: ReadonlyArray<ScopedLimit>, now: Date) {
  for (const scope of scopes) {
    const limited = await admitFixedWindowLimit({
      scope: scope.scope,
      spec: scope.spec,
      now,
    });
    if (limited) {
      return limited;
    }
  }
  return null;
}

export async function admitDemoEmailRequest(input: {
  email: string;
  ip: string | null;
  now: Date;
}) {
  return admitScopes(
    buildEmailScopes({
      kind: "email_request",
      limits: DEMO_EMAIL_REQUEST_LIMITS,
      email: input.email,
      ip: input.ip,
    }),
    input.now,
  );
}

export async function admitDemoRun(input: { email: string; ip: string | null; now: Date }) {
  return admitScopes(
    buildEmailScopes({
      kind: "run",
      limits: DEMO_RUN_LIMITS,
      email: input.email,
      ip: input.ip,
    }),
    input.now,
  );
}

export async function admitDemoConsume(input: { ip: string | null; now: Date }) {
  const scopes: ScopedLimit[] = [
    { scope: scopeFor("consume", "global"), spec: DEMO_CONSUME_LIMITS.global },
  ];
  if (input.ip) {
    scopes.push({ scope: scopeFor("consume", `ip:${input.ip}`), spec: DEMO_CONSUME_LIMITS.perIp });
  }
  return admitScopes(scopes, input.now);
}
