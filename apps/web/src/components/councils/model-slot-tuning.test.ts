import { describe, expect, test } from "vitest";
import { parseUnitIntervalInput } from "./model-slot-tuning-helpers";

describe("parseUnitIntervalInput", () => {
  test("normalizes top-p values to the council tuning contract interval", () => {
    expect(parseUnitIntervalInput("")).toBeNull();
    expect(parseUnitIntervalInput("0.42")).toBe(0.42);
    expect(parseUnitIntervalInput("-0.5")).toBe(0);
    expect(parseUnitIntervalInput("1.5")).toBe(1);
    expect(parseUnitIntervalInput("not-a-number")).toBeNull();
  });
});
