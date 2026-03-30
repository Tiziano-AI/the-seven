import "server-only";

import { INGRESS_FLOOD_LIMITS } from "@the-seven/config";
import { admitFixedWindowLimit } from "./rateLimits";

export async function admitIngressFloodLimit(input: { ip: string | null; now: Date }) {
  const scopes = [
    { scope: "ingress:flood:global", spec: INGRESS_FLOOD_LIMITS.global },
    ...(input.ip
      ? [{ scope: `ingress:flood:ip:${input.ip}`, spec: INGRESS_FLOOD_LIMITS.perIp }]
      : []),
  ];

  for (const scope of scopes) {
    const limited = await admitFixedWindowLimit({
      scope: scope.scope,
      spec: scope.spec,
      now: input.now,
    });
    if (limited) {
      return limited;
    }
  }

  return null;
}
