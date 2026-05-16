import { describe, expect, test } from "vitest";
import { hasJsonApiNoStore, jsonApiCacheControl, requireJsonApiNoStore } from "./cache";

describe("JSON API cache contract", () => {
  test("accepts only the exact no-store contract", () => {
    expect(hasJsonApiNoStore(jsonApiCacheControl)).toBe(true);
  });

  test("rejects missing or broadened no-store directives", () => {
    expect(hasJsonApiNoStore(null)).toBe(false);
    expect(hasJsonApiNoStore("private, no-store")).toBe(false);
    expect(hasJsonApiNoStore("NO-STORE")).toBe(false);
    expect(hasJsonApiNoStore("private, max-age=0")).toBe(false);
    expect(() =>
      requireJsonApiNoStore({
        cacheControl: "private, max-age=0",
        context: "public smoke",
      }),
    ).toThrow("public smoke did not return Cache-Control: no-store.");
  });
});
