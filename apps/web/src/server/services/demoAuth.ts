import "server-only";

import { DEMO_AUTH_LINK_TTL_HOURS, DEMO_SESSION_TTL_HOURS, loadServerEnv } from "@the-seven/config";
import {
  createDemoMagicLink,
  createDemoSession,
  getDemoMagicLinkByTokenHash,
  getDemoSessionByTokenHash,
  getOrCreateUserByEmail,
  getUserById,
  markDemoMagicLinkUsed,
  touchDemoSession,
} from "@the-seven/db";
import { ResendRequestFailedError, sendResendEmail } from "../adapters/resend";
import { createDemoToken, hashDemoToken } from "../domain/demoTokens";

export class DemoAuthError extends Error {
  readonly kind:
    | "demo_disabled"
    | "link_not_found"
    | "link_used"
    | "link_expired"
    | "user_missing"
    | "email_send_failed";
  readonly status: number | null;

  constructor(input: {
    kind:
      | "demo_disabled"
      | "link_not_found"
      | "link_used"
      | "link_expired"
      | "user_missing"
      | "email_send_failed";
    message: string;
    status?: number | null;
  }) {
    super(input.message);
    this.kind = input.kind;
    this.status = input.status ?? null;
  }
}

function addHours(date: Date, hours: number): Date {
  return new Date(date.getTime() + hours * 60 * 60 * 1000);
}

function buildDemoEmail(input: { email: string; link: string }) {
  const subject = "Your demo link for The Seven";
  const html = `<p>Open the demo: <a href="${input.link}">${input.link}</a></p>`;
  const text = `Open the demo: ${input.link}\nRequested for: ${input.email}`;
  return { subject, html, text };
}

export async function requestDemoAuthLink(input: {
  email: string;
  requestIp: string | null;
  now: Date;
}) {
  const env = loadServerEnv();
  if (!env.demo.enabled || !env.demo.resendApiKey || !env.demo.emailFrom) {
    throw new DemoAuthError({ kind: "demo_disabled", message: "Demo mode is disabled" });
  }

  const normalizedEmail = input.email.trim().toLowerCase();
  const user = await getOrCreateUserByEmail(normalizedEmail);
  const linkToken = createDemoToken();
  const expiresAt = addHours(input.now, DEMO_AUTH_LINK_TTL_HOURS);

  await createDemoMagicLink({
    userId: user.id,
    tokenHash: linkToken.tokenHash,
    requestedIp: input.requestIp ?? "unknown",
    expiresAt,
    createdAt: input.now,
  });

  const link = `${env.publicOrigin.replace(/\/+$/, "")}/?demo_token=${linkToken.token}`;
  const email = buildDemoEmail({ email: normalizedEmail, link });

  try {
    await sendResendEmail({
      apiKey: env.demo.resendApiKey,
      idempotencyKey: linkToken.tokenHash,
      payload: {
        from: env.demo.emailFrom,
        to: [normalizedEmail],
        subject: email.subject,
        html: email.html,
        text: email.text,
      },
    });
  } catch (error) {
    if (error instanceof ResendRequestFailedError) {
      throw new DemoAuthError({
        kind: "email_send_failed",
        message: error.message,
        status: error.status,
      });
    }
    throw error;
  }

  return { email: normalizedEmail };
}

export async function consumeDemoAuthLink(input: {
  token: string;
  consumedIp: string | null;
  now: Date;
}) {
  const env = loadServerEnv();
  if (!env.demo.enabled) {
    throw new DemoAuthError({ kind: "demo_disabled", message: "Demo mode is disabled" });
  }

  const tokenHash = hashDemoToken(input.token);
  const link = await getDemoMagicLinkByTokenHash(tokenHash);
  if (!link) {
    throw new DemoAuthError({ kind: "link_not_found", message: "Demo link not found" });
  }
  if (link.usedAt) {
    throw new DemoAuthError({ kind: "link_used", message: "Demo link already used" });
  }
  if (link.expiresAt.getTime() <= input.now.getTime()) {
    throw new DemoAuthError({ kind: "link_expired", message: "Demo link expired" });
  }

  await markDemoMagicLinkUsed({
    id: link.id,
    usedAt: input.now,
    consumedIp: input.consumedIp,
  });

  const sessionToken = createDemoToken();
  const sessionExpiresAt = addHours(input.now, DEMO_SESSION_TTL_HOURS);
  await createDemoSession({
    userId: link.userId,
    tokenHash: sessionToken.tokenHash,
    expiresAt: sessionExpiresAt,
    lastUsedAt: input.now,
    createdAt: input.now,
  });

  const user = await getUserById(link.userId);
  if (!user?.email) {
    throw new DemoAuthError({ kind: "user_missing", message: "Demo user not found" });
  }

  return {
    email: user.email,
    token: sessionToken.token,
    expiresAt: sessionExpiresAt.getTime(),
  };
}

export async function getDemoSessionContext(input: { token: string; now: Date }) {
  const session = await getDemoSessionByTokenHash(hashDemoToken(input.token));
  if (!session) {
    return { kind: "missing" } as const;
  }
  if (session.expiresAt.getTime() <= input.now.getTime()) {
    return { kind: "expired" } as const;
  }
  const user = await getUserById(session.userId);
  if (!user?.email) {
    return { kind: "missing" } as const;
  }

  await touchDemoSession({ id: session.id, lastUsedAt: input.now });
  return {
    kind: "active",
    userId: user.id,
    email: user.email,
  } as const;
}
