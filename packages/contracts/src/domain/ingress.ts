export const INGRESS_SOURCE_WEB = "web";
export const INGRESS_SOURCE_CLI = "cli";
export const INGRESS_SOURCE_API = "api";

export const INGRESS_SOURCES = [
  INGRESS_SOURCE_WEB,
  INGRESS_SOURCE_CLI,
  INGRESS_SOURCE_API,
] as const;

export type IngressSource = (typeof INGRESS_SOURCES)[number];

export function parseIngressSource(value: string | null | undefined): IngressSource | null {
  const trimmed = value?.trim().toLowerCase();
  if (!trimmed) {
    return null;
  }
  return INGRESS_SOURCES.includes(trimmed as IngressSource) ? (trimmed as IngressSource) : null;
}
