import "server-only";

import { z } from "zod";

const RESEND_BASE_URL = "https://api.resend.com";

export type ResendEmailRequest = Readonly<{
  from: string;
  to: string[];
  subject: string;
  html?: string;
  text?: string;
  reply_to?: string;
}>;

const resendEmailResponseSchema = z.object({
  id: z.string(),
});

const resendErrorBodySchema = z
  .object({
    message: z.string().optional(),
  })
  .passthrough();

export class ResendRequestFailedError extends Error {
  readonly status: number | null;

  constructor(input: { status: number | null; message: string }) {
    super(input.message);
    this.name = "ResendRequestFailedError";
    this.status = input.status;
  }
}

async function parseJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ResendRequestFailedError({
      status: response.status,
      message: `Resend returned non-JSON response (status ${response.status})`,
    });
  }
}

export async function sendResendEmail(input: {
  apiKey: string;
  idempotencyKey: string;
  payload: ResendEmailRequest;
}) {
  const response = await fetch(`${RESEND_BASE_URL}/emails`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.apiKey}`,
      "Content-Type": "application/json",
      "Idempotency-Key": input.idempotencyKey,
    },
    body: JSON.stringify(input.payload),
  });

  const data = await parseJson(response);
  if (!response.ok) {
    const parsed = resendErrorBodySchema.safeParse(data);
    const message = parsed.success
      ? (parsed.data.message ?? response.statusText)
      : response.statusText;
    throw new ResendRequestFailedError({
      status: response.status,
      message: `Resend request failed (status ${response.status}): ${message}`,
    });
  }

  return resendEmailResponseSchema.parse(data);
}
