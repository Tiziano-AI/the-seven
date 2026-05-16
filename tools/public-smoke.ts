import {
  errorEnvelopeSchema,
  requireJsonApiNoStore,
  requireTraceHeaderMatchesEnvelope,
} from "@the-seven/contracts";

type FetchLike = (input: string | URL, init?: RequestInit) => Promise<Response>;

export type PublicSmokeReceipt = Readonly<{
  origin: string;
  home: Readonly<{
    status: number;
    contentType: string;
    rendered: boolean;
  }>;
  demoSession: Readonly<{
    status: number;
    cacheControl: string;
    traceId: string;
    kind: string;
    reason: string;
  }>;
}>;

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

export function publicSmokeOrigin(rawOrigin: string | undefined): URL {
  const candidate = rawOrigin?.trim() || "https://theseven.ai";
  const url = new URL(candidate);
  url.pathname = "/";
  url.search = "";
  url.hash = "";
  return url;
}

function routeUrl(origin: URL, path: string): URL {
  return new URL(path, origin);
}

/**
 * Proves the deployed public surface without provider, email, or authenticated
 * side effects. The unauthenticated API denial still exercises normal ingress
 * admission, including its rate-limit bucket.
 */
export async function runPublicSmoke(
  input: { origin?: string; fetchImpl?: FetchLike } = {},
): Promise<PublicSmokeReceipt> {
  const origin = publicSmokeOrigin(input.origin);
  const fetchImpl = input.fetchImpl ?? fetch;

  const homeResponse = await fetchImpl(routeUrl(origin, "/"), { redirect: "follow" });
  const contentType = homeResponse.headers.get("content-type") ?? "";
  assert(homeResponse.ok, `Public home smoke failed with HTTP ${homeResponse.status}.`);
  assert(
    contentType.toLowerCase().includes("text/html"),
    `Public home smoke expected text/html, received ${contentType || "missing content-type"}.`,
  );
  const homeBody = await homeResponse.text();
  const rendered = homeBody.toLowerCase().includes("the seven");
  assert(rendered, "Public home smoke did not render The Seven app shell.");

  const demoResponse = await fetchImpl(routeUrl(origin, "/api/v1/demo/session"), {
    redirect: "manual",
  });
  const demoCacheControl = demoResponse.headers.get("cache-control") ?? "";
  requireJsonApiNoStore({
    cacheControl: demoCacheControl,
    context: "Unauthenticated demo-session smoke",
  });
  const demoTraceHeader = demoResponse.headers.get("x-trace-id");
  const demoEnvelope = errorEnvelopeSchema.parse(await demoResponse.json());
  assert(
    demoResponse.status === 401,
    `Unauthenticated demo-session smoke expected HTTP 401, received ${demoResponse.status}.`,
  );
  assert(
    demoEnvelope.kind === "unauthorized",
    `Unauthenticated demo-session smoke expected unauthorized, received ${demoEnvelope.kind}.`,
  );
  assert(
    demoEnvelope.details.reason === "missing_auth",
    `Unauthenticated demo-session smoke expected missing_auth, received ${demoEnvelope.details.reason}.`,
  );
  requireTraceHeaderMatchesEnvelope({
    traceHeader: demoTraceHeader,
    envelopeTraceId: demoEnvelope.trace_id,
    context: "Unauthenticated demo-session smoke",
  });

  return {
    origin: origin.origin,
    home: {
      status: homeResponse.status,
      contentType,
      rendered,
    },
    demoSession: {
      status: demoResponse.status,
      cacheControl: demoCacheControl,
      traceId: demoEnvelope.trace_id,
      kind: demoEnvelope.kind,
      reason: demoEnvelope.details.reason,
    },
  };
}

async function main(): Promise<void> {
  const receipt = await runPublicSmoke({ origin: process.argv[2] });
  process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main().catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  });
}
