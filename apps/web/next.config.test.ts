import { PHASE_DEVELOPMENT_SERVER, PHASE_PRODUCTION_BUILD } from "next/constants";
import { describe, expect, test } from "vitest";
import { buildNextConfig } from "./next.config";

describe("Next config", () => {
  test("applies launch-owned distDir only to the development server phase", () => {
    expect(
      buildNextConfig(PHASE_DEVELOPMENT_SERVER, {
        SEVEN_NEXT_DIST_DIR: ".next-local/43217",
      }).distDir,
    ).toBe(".next-local/43217");

    expect(() =>
      buildNextConfig(PHASE_PRODUCTION_BUILD, {
        SEVEN_NEXT_DIST_DIR: ".next-local/43217",
      }),
    ).toThrow("SEVEN_NEXT_DIST_DIR is only valid for launch-owned next dev.");
  });
});
