import { requireServerRuntimeConfig } from "../_core/runtimeConfig";
import { sendResendEmail, ResendRequestFailedError } from "../adapters/resend/client";
import { DEMO_AUTH_LINK_TTL_HOURS, DEMO_SESSION_TTL_HOURS } from "../domain/demoLimits";
import { createDemoToken, hashDemoToken } from "../domain/demoTokens";
import { getOrCreateUserByEmail, getUserById } from "../stores/userStore";
import {
  createDemoAuthLink,
  createDemoSession,
  getDemoAuthLinkByTokenHash,
  getDemoSessionByTokenHash,
  markDemoAuthLinkUsed,
  touchDemoSession,
} from "../stores/demoAuthStore";

export type DemoAuthLinkResult = Readonly<{
  email: string;
}>;

export type DemoSessionResult = Readonly<{
  email: string;
  token: string;
  expiresAt: number;
}>;

export type DemoAuthErrorKind =
  | "demo_disabled"
  | "link_not_found"
  | "link_used"
  | "link_expired"
  | "user_missing"
  | "email_send_failed";

export class DemoAuthError extends Error {
  readonly kind: DemoAuthErrorKind;
  readonly status: number | null;

  constructor(params: { kind: DemoAuthErrorKind; message: string; status?: number | null }) {
    super(params.message);
    this.kind = params.kind;
    this.status = params.status ?? null;
  }
}

function addHours(date: Date, hours: number): Date {
  return new Date(date.getTime() + hours * 60 * 60 * 1000);
}

function buildDemoEmail(params: { email: string; link: string }): Readonly<{ subject: string; html: string; text: string }> {
  const subject = "Your Seven demo link";
  const html = [
    `<p>Here’s your demo link:</p>`,
    `<p><a href="${params.link}">${params.link}</a></p>`,
    `<p>This link expires in ${DEMO_AUTH_LINK_TTL_HOURS} hours.</p>`,
    `<p>If you didn’t request this, you can ignore this email.</p>`,
  ].join("");
  const text = [
    `Here’s your demo link:`,
    params.link,
    ``,
    `This link expires in ${DEMO_AUTH_LINK_TTL_HOURS} hours.`,
    `If you didn’t request this, you can ignore this email.`,
  ].join("\n");

  return { subject, html, text };
}

export async function requestDemoAuthLink(params: {
  email: string;
  requestIp: string | null;
  now: Date;
}): Promise<DemoAuthLinkResult> {
  const runtime = requireServerRuntimeConfig();
  if (!runtime.demo.enabled) {
    throw new DemoAuthError({ kind: "demo_disabled", message: "Demo mode is disabled" });
  }

  const normalizedEmail = params.email.trim().toLowerCase();
  const user = await getOrCreateUserByEmail(normalizedEmail);

  const linkToken = createDemoToken();
  const expiresAt = addHours(params.now, DEMO_AUTH_LINK_TTL_HOURS);

  await createDemoAuthLink({
    userId: user.id,
    tokenHash: linkToken.tokenHash,
    requestedIp: params.requestIp ?? "unknown",
    consumedIp: null,
    expiresAt,
    usedAt: null,
    createdAt: params.now,
  });

  const link = `${runtime.openRouter.publicOrigin.replace(/\/+$/, "")}/?demo_token=${linkToken.token}`;
  const emailBody = buildDemoEmail({ email: normalizedEmail, link });

  if (!runtime.demo.resendApiKey || !runtime.demo.emailFrom) {
    throw new DemoAuthError({ kind: "demo_disabled", message: "Demo email is not configured" });
  }

  try {
    await sendResendEmail({
      apiKey: runtime.demo.resendApiKey,
      idempotencyKey: linkToken.tokenHash,
      payload: {
        from: runtime.demo.emailFrom,
        to: [normalizedEmail],
        subject: emailBody.subject,
        html: emailBody.html,
        text: emailBody.text,
      },
    });
  } catch (error: unknown) {
    if (error instanceof ResendRequestFailedError) {
      throw new DemoAuthError({
        kind: "email_send_failed",
        message: error.message,
        status: error.status,
      });
    }
    throw new DemoAuthError({
      kind: "email_send_failed",
      message: error instanceof Error ? error.message : "Resend request failed",
    });
  }

  return { email: normalizedEmail };
}

export async function consumeDemoAuthLink(params: {
  token: string;
  consumedIp: string | null;
  now: Date;
}): Promise<DemoSessionResult> {
  const runtime = requireServerRuntimeConfig();
  if (!runtime.demo.enabled) {
    throw new DemoAuthError({ kind: "demo_disabled", message: "Demo mode is disabled" });
  }

  const tokenHash = hashDemoToken(params.token);
  const link = await getDemoAuthLinkByTokenHash(tokenHash);
  if (!link) {
    throw new DemoAuthError({ kind: "link_not_found", message: "Demo link not found" });
  }

  if (link.usedAt) {
    throw new DemoAuthError({ kind: "link_used", message: "Demo link already used" });
  }

  if (link.expiresAt.getTime() <= params.now.getTime()) {
    throw new DemoAuthError({ kind: "link_expired", message: "Demo link expired" });
  }

  await markDemoAuthLinkUsed({
    id: link.id,
    usedAt: params.now,
    consumedIp: params.consumedIp,
  });

  const sessionToken = createDemoToken();
  const sessionExpiresAt = addHours(params.now, DEMO_SESSION_TTL_HOURS);

  await createDemoSession({
    userId: link.userId,
    tokenHash: sessionToken.tokenHash,
    expiresAt: sessionExpiresAt,
    lastUsedAt: params.now,
    createdAt: params.now,
  });

  const user = await getUserById(link.userId);
  if (!user || user.email === null) {
    throw new DemoAuthError({ kind: "user_missing", message: "Demo user not found" });
  }

  return {
    email: user.email,
    token: sessionToken.token,
    expiresAt: sessionExpiresAt.getTime(),
  };
}

export type DemoSessionLookup =
  | Readonly<{ kind: "active"; userId: number; email: string }>
  | Readonly<{ kind: "expired" }>
  | Readonly<{ kind: "missing" }>;

export async function getDemoSessionContext(params: {
  token: string;
  now: Date;
}): Promise<DemoSessionLookup> {
  const tokenHash = hashDemoToken(params.token);
  const session = await getDemoSessionByTokenHash(tokenHash);
  if (!session) return { kind: "missing" };
  if (session.expiresAt.getTime() <= params.now.getTime()) {
    return { kind: "expired" };
  }

  const user = await getUserById(session.userId);
  if (!user || user.email === null) {
    return { kind: "missing" };
  }

  await touchDemoSession({ id: session.id, lastUsedAt: params.now });

  return {
    kind: "active",
    userId: user.id,
    email: user.email,
  };
}
