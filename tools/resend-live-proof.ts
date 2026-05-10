import type { ServerRuntime } from "@the-seven/config";

type ReceivedEmailListItem = Readonly<{
  id: string;
  to: string[];
  createdAt: Date;
}>;

type ReceivedEmailBody = Readonly<{
  id: string;
  html: string | null;
  text: string | null;
}>;

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

async function resendRequest(
  env: ServerRuntime,
  method: "GET" | "POST" | "DELETE",
  path: string,
  body?: unknown,
) {
  const apiKey = env.demo.resendApiKey;
  assert(apiKey !== null, "SEVEN_DEMO_RESEND_API_KEY is required for live demo verification.");

  const response = await fetch(`https://api.resend.com${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await response.text();
  const data = text ? (JSON.parse(text) as unknown) : null;
  if (!response.ok) {
    const message =
      data && typeof data === "object" && "message" in data && typeof data.message === "string"
        ? data.message
        : response.statusText;
    throw new Error(`Resend API ${method} ${path} failed (${response.status}): ${message}`);
  }
  return data;
}

function normalizeRecipient(value: string) {
  return value.trim().toLowerCase();
}

function parseResendDate(value: string) {
  const normalized = value.includes("T") ? value : value.replace(" ", "T");
  const withOffset = normalized.match(/[+-]\d{2}$/) ? `${normalized}:00` : normalized;
  const date = new Date(withOffset);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Resend returned an invalid received-email timestamp: ${value}`);
  }
  return date;
}

function parseReceivedEmailList(data: unknown) {
  if (!data || typeof data !== "object" || !("data" in data) || !Array.isArray(data.data)) {
    throw new Error("Resend received-email list payload is malformed.");
  }

  return data.data.map((item): ReceivedEmailListItem => {
    if (
      !item ||
      typeof item !== "object" ||
      !("id" in item) ||
      typeof item.id !== "string" ||
      !("to" in item) ||
      !Array.isArray(item.to) ||
      !("created_at" in item) ||
      typeof item.created_at !== "string"
    ) {
      throw new Error("Resend received-email list item is malformed.");
    }

    const rawRecipients: unknown[] = item.to;
    const recipients = rawRecipients.map((recipient) => {
      if (typeof recipient !== "string") {
        throw new Error("Resend received-email recipient is malformed.");
      }
      return normalizeRecipient(recipient);
    });

    return {
      id: item.id,
      to: recipients,
      createdAt: parseResendDate(item.created_at),
    };
  });
}

function parseReceivedEmailBody(data: unknown): ReceivedEmailBody {
  if (!data || typeof data !== "object" || !("id" in data) || typeof data.id !== "string") {
    throw new Error("Received email payload is malformed.");
  }

  return {
    id: data.id,
    html: "html" in data && typeof data.html === "string" ? data.html : null,
    text: "text" in data && typeof data.text === "string" ? data.text : null,
  };
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function listReceivedEmails(env: ServerRuntime) {
  return parseReceivedEmailList(await resendRequest(env, "GET", "/emails/receiving?limit=10"));
}

/**
 * Verifies that the configured Resend key can read inbound email references.
 * Send-only keys are rejected before live proof starts.
 */
export async function assertResendInboundAccess(env: ServerRuntime) {
  try {
    await listReceivedEmails(env);
  } catch (error) {
    if (
      error instanceof Error &&
      /restricted to only send emails|restricted_api_key/i.test(error.message)
    ) {
      throw new Error(
        "SEVEN_DEMO_RESEND_API_KEY is send-only. Full local live verification requires a Resend API key that can list and retrieve received emails.",
      );
    }
    throw error;
  }
}

/**
 * Retrieves a single inbound email body through Resend's Receiving API.
 * Webhook metadata is not used as an authority for demo-token extraction.
 */
export async function retrieveReceivedEmail(env: ServerRuntime, emailId: string) {
  return parseReceivedEmailBody(await resendRequest(env, "GET", `/emails/receiving/${emailId}`));
}

/**
 * Waits for Resend to store the demo magic-link email, then retrieves its body.
 * The match is bounded by recipient and request time so stale inbox rows do not
 * satisfy live proof.
 */
export async function waitForReceivedDemoEmail(input: {
  env: ServerRuntime;
  recipient: string;
  requestedAt: Date;
}) {
  const recipient = normalizeRecipient(input.recipient);
  const deadline = Date.now() + 180_000;

  while (Date.now() < deadline) {
    const candidates = (await listReceivedEmails(input.env))
      .filter(
        (item) =>
          item.createdAt.getTime() >= input.requestedAt.getTime() && item.to.includes(recipient),
      )
      .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime());
    const latest = candidates[0];
    if (latest) {
      return await retrieveReceivedEmail(input.env, latest.id);
    }
    await sleep(5_000);
  }

  throw new Error("Timed out waiting for Resend to store the demo email.");
}
