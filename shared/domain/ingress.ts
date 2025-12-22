export const INGRESS_SOURCE_WEB = "web";
export const INGRESS_SOURCE_CLI = "cli";
export const INGRESS_SOURCE_API = "api";

export const INGRESS_SOURCES = [INGRESS_SOURCE_WEB, INGRESS_SOURCE_CLI, INGRESS_SOURCE_API] as const;

export type IngressSource = (typeof INGRESS_SOURCES)[number];

export function isIngressSource(value: string): value is IngressSource {
  return (INGRESS_SOURCES as readonly string[]).includes(value);
}

export function parseIngressSource(value: string | null | undefined): IngressSource | null {
  if (!value) return null;
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return null;
  return isIngressSource(trimmed) ? trimmed : null;
}
