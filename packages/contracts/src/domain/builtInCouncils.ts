export const BUILT_IN_COUNCIL_SLUGS = ["founding", "lantern", "commons"] as const;

export type BuiltInCouncilSlug = (typeof BUILT_IN_COUNCIL_SLUGS)[number];

export function isBuiltInCouncilSlug(value: string): value is BuiltInCouncilSlug {
  return value === "founding" || value === "lantern" || value === "commons";
}
