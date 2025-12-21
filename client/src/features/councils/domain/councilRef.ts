import type { RouterOutputs } from "@/lib/trpcTypes";
import { isBuiltInCouncilSlug } from "@shared/domain/builtInCouncils";

export type CouncilRef = RouterOutputs["councils"]["list"]["councils"][number]["ref"];

export function encodeCouncilRef(ref: CouncilRef): string {
  if (ref.kind === "built_in") {
    return `built_in:${ref.slug}`;
  }
  return `user:${ref.councilId}`;
}

export function decodeCouncilRef(value: string): CouncilRef | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith("built_in:")) {
    const slug = trimmed.slice("built_in:".length);
    if (isBuiltInCouncilSlug(slug)) {
      return { kind: "built_in", slug };
    }
    return null;
  }

  if (trimmed.startsWith("user:")) {
    const rest = trimmed.slice("user:".length);
    if (!/^\d+$/.test(rest)) return null;
    const councilId = Number.parseInt(rest, 10);
    if (!Number.isSafeInteger(councilId) || councilId <= 0) return null;
    return { kind: "user", councilId };
  }

  return null;
}
