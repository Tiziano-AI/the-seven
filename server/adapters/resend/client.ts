import axios from "axios";
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

export type ResendEmailResponse = z.infer<typeof resendEmailResponseSchema>;

export class ResendRequestFailedError extends Error {
  readonly status: number | null;

  constructor(params: { status: number | null; message: string }) {
    super(params.message);
    this.name = "ResendRequestFailedError";
    this.status = params.status;
  }
}

const resendErrorBodySchema = z
  .object({
    message: z.string().optional(),
  })
  .passthrough();

export async function sendResendEmail(params: {
  apiKey: string;
  idempotencyKey: string;
  payload: ResendEmailRequest;
}): Promise<ResendEmailResponse> {
  try {
    const response = await axios.post<unknown>(`${RESEND_BASE_URL}/emails`, params.payload, {
      headers: {
        Authorization: `Bearer ${params.apiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": params.idempotencyKey,
      },
    });
    return resendEmailResponseSchema.parse(response.data);
  } catch (error) {
    const details = extractResendAxiosErrorDetails(error);
    throw new ResendRequestFailedError(details);
  }
}

function extractResendAxiosErrorDetails(
  error: unknown
): Readonly<{ status: number | null; message: string }> {
  if (!axios.isAxiosError(error)) {
    const message = error instanceof Error ? error.message : "Resend request failed";
    return { status: null, message };
  }

  const status = error.response?.status;
  const parsedBody = resendErrorBodySchema.safeParse(error.response?.data);
  const providerMessage = parsedBody.success ? parsedBody.data.message : undefined;
  const message = providerMessage ?? error.message;
  const statusLabel = typeof status === "number" ? ` (status ${status})` : "";
  return {
    status: typeof status === "number" ? status : null,
    message: `Resend request failed${statusLabel}: ${message}`,
  };
}
