import { beforeEach, describe, expect, it } from "vitest";
import { setupTestDatabase } from "./stores/testDb";
import { checkDemoConsumeLimits } from "./services/demoRateLimits";
import { DEMO_CONSUME_LIMITS } from "./domain/demoLimits";
import { checkIngressFloodLimits } from "./services/ingressRateLimits";
import { INGRESS_FLOOD_LIMITS } from "./domain/ingressLimits";

beforeEach(() => {
  setupTestDatabase();
});

describe("rate limits", () => {
  it("enforces demo consume limits per IP", async () => {
    const now = new Date("2024-01-01T00:00:00.000Z");
    const params = { ip: "203.0.113.42", now };

    for (let i = 0; i < DEMO_CONSUME_LIMITS.perIp.limit; i += 1) {
      const decision = await checkDemoConsumeLimits(params);
      expect(decision).toBeNull();
    }

    const decision = await checkDemoConsumeLimits(params);
    if (!decision) {
      throw new Error("Expected demo consume rate limit to trigger");
    }
    expect(decision.allowed).toBe(false);
    expect(decision.scope).toBe(`demo:consume:ip:${params.ip}`);
    expect(decision.limit).toBe(DEMO_CONSUME_LIMITS.perIp.limit);
  });

  it("enforces ingress flood limits per IP", async () => {
    const now = new Date("2024-01-01T00:00:00.000Z");
    const params = { ip: "203.0.113.99", now };

    for (let i = 0; i < INGRESS_FLOOD_LIMITS.perIp.limit; i += 1) {
      const decision = await checkIngressFloodLimits(params);
      expect(decision).toBeNull();
    }

    const decision = await checkIngressFloodLimits(params);
    if (!decision) {
      throw new Error("Expected ingress flood limit to trigger");
    }
    expect(decision.allowed).toBe(false);
    expect(decision.scope).toBe(`ingress:flood:ip:${params.ip}`);
    expect(decision.limit).toBe(INGRESS_FLOOD_LIMITS.perIp.limit);
  });
});
