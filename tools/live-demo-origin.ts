function isLoopbackHost(hostname: string) {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

/** Resolves the live-demo public proof origin while keeping transport and authority separate. */
export function resolveProofOrigin(input: { baseUrl: string; publicOrigin: string }) {
  const base = new URL(input.baseUrl);
  const publicOrigin = new URL(input.publicOrigin).origin;
  if (!isLoopbackHost(base.hostname) && base.origin !== publicOrigin) {
    throw new Error("Live demo proof transport origin must match SEVEN_PUBLIC_ORIGIN.");
  }
  return publicOrigin;
}
