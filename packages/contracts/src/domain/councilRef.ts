import { z } from "zod";
import {
  BUILT_IN_COUNCIL_SLUGS,
  type BuiltInCouncilSlug,
  isBuiltInCouncilSlug,
} from "./builtInCouncils";

export type CouncilRef =
  | Readonly<{ kind: "built_in"; slug: BuiltInCouncilSlug }>
  | Readonly<{ kind: "user"; councilId: number }>;

export const councilRefSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("built_in"),
    slug: z.enum(BUILT_IN_COUNCIL_SLUGS),
  }),
  z.object({
    kind: z.literal("user"),
    councilId: z.number().int().positive(),
  }),
]);

export function encodeCouncilRef(ref: CouncilRef): string {
  if (ref.kind === "built_in") {
    return `built_in:${ref.slug}`;
  }
  return `user:${ref.councilId}`;
}

export function decodeCouncilRef(value: string): CouncilRef | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  if (trimmed.startsWith("built_in:")) {
    const slug = trimmed.slice("built_in:".length);
    return isBuiltInCouncilSlug(slug) ? { kind: "built_in", slug } : null;
  }
  if (!trimmed.startsWith("user:")) {
    return null;
  }
  const maybeId = Number.parseInt(trimmed.slice("user:".length), 10);
  if (!Number.isSafeInteger(maybeId) || maybeId <= 0) {
    return null;
  }
  return { kind: "user", councilId: maybeId };
}
