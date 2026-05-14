import { describe, expect, test } from "vitest";
import { decodeCouncilRef } from "./councilRef";

describe("council refs", () => {
  test("decodes only exact canonical built-in and user locators", () => {
    expect(decodeCouncilRef("built_in:commons")).toEqual({ kind: "built_in", slug: "commons" });
    expect(decodeCouncilRef("user:7")).toEqual({ kind: "user", councilId: 7 });
    expect(decodeCouncilRef("user:7junk")).toBeNull();
    expect(decodeCouncilRef("user:07")).toBeNull();
    expect(decodeCouncilRef("user:-7")).toBeNull();
  });
});
