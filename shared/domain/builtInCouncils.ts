/**
 * Canonical slugs for built-in councils.
 */
export const BUILT_IN_COUNCIL_SLUGS = ["founding", "lantern"] as const;

/**
 * Union of built-in council slugs.
 */
export type BuiltInCouncilSlug = (typeof BUILT_IN_COUNCIL_SLUGS)[number];

/**
 * Returns true when the provided value is a built-in council slug.
 */
export function isBuiltInCouncilSlug(value: string): value is BuiltInCouncilSlug {
  return value === "founding" || value === "lantern";
}
