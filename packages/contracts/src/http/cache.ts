export const jsonApiCacheControl = "no-store";

/** Returns whether a response Cache-Control header equals the JSON API no-store contract. */
export function hasJsonApiNoStore(cacheControl: string | null): boolean {
  return cacheControl === jsonApiCacheControl;
}

/** Throws when a proof or client response violates the JSON API no-store contract. */
export function requireJsonApiNoStore(input: {
  cacheControl: string | null;
  context: string;
}): void {
  if (!hasJsonApiNoStore(input.cacheControl)) {
    throw new Error(`${input.context} did not return Cache-Control: no-store.`);
  }
}
