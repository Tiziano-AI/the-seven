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
  const subject = "Your demo link for The Seven";
  const preheader = "Your secure demo link for The Seven.";
  const html = [
    `<!doctype html>`,
    `<html lang="en">`,
    `<head>`,
    `<meta http-equiv="Content-Type" content="text/html; charset=utf-8" />`,
    `<meta name="viewport" content="width=device-width, initial-scale=1" />`,
    `<title>${subject}</title>`,
    `</head>`,
    `<body style="margin:0;padding:0;background-color:#f4f5f7;color:#111827;">`,
    `<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${preheader}</div>`,
    `<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background-color:#f4f5f7;border-collapse:collapse;">`,
    `<tr>`,
    `<td align="center" style="padding:32px 16px;">`,
    `<table role="presentation" cellpadding="0" cellspacing="0" width="600" style="max-width:600px;width:100%;border-collapse:collapse;">`,
    `<tr>`,
    `<td style="background:#ffffff;border:1px solid #e5e7eb;border-radius:16px;padding:32px 32px 24px 32px;">`,
    `<div style="font-family:Georgia,'Times New Roman',serif;font-size:20px;letter-spacing:0.08em;text-transform:uppercase;color:#111827;">The Seven</div>`,
    `<div style="height:12px;line-height:12px;font-size:12px;">&nbsp;</div>`,
    `<h1 style="margin:0 0 12px 0;font-family:Arial,Helvetica,sans-serif;font-size:24px;line-height:1.3;color:#111827;">Your demo link</h1>`,
    `<p style="margin:0 0 16px 0;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:#374151;">Use this link to access the demo. It expires in ${DEMO_AUTH_LINK_TTL_HOURS} hours.</p>`,
    `<table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">`,
    `<tr>`,
    `<td style="background:#111827;border-radius:10px;">`,
    `<a href="${params.link}" target="_blank" rel="noopener noreferrer" style="display:inline-block;padding:12px 20px;font-family:Arial,Helvetica,sans-serif;font-size:15px;color:#ffffff;text-decoration:none;font-weight:600;">Open The Seven demo</a>`,
    `</td>`,
    `</tr>`,
    `</table>`,
    `<div style="height:16px;line-height:16px;font-size:16px;">&nbsp;</div>`,
    `<p style="margin:0 0 8px 0;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.6;color:#6b7280;">Requested for <strong style="color:#111827;">${params.email}</strong></p>`,
    `<p style="margin:0 0 12px 0;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.6;color:#6b7280;">If the button does not work, copy and paste this link:</p>`,
    `<p style="margin:0 0 16px 0;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.6;word-break:break-all;color:#111827;">${params.link}</p>`,
    `<hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0 16px 0;" />`,
    `<p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.6;color:#6b7280;">If you did not request this email, you can ignore it.</p>`,
    `</td>`,
    `</tr>`,
    `<tr>`,
    `<td style="text-align:center;padding:16px 8px 0 8px;font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#9ca3af;">The Seven &bull; Demo access</td>`,
    `</tr>`,
    `</table>`,
    `</td>`,
    `</tr>`,
    `</table>`,
    `</body>`,
    `</html>`,
  ].join("");
  const text = [
    `Your demo link for The Seven`,
    ``,
    `Open the demo: ${params.link}`,
    `Requested for: ${params.email}`,
    ``,
    `This link expires in ${DEMO_AUTH_LINK_TTL_HOURS} hours.`,
    `If you did not request this email, you can ignore it.`,
    ``,
    `The Seven`,
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
