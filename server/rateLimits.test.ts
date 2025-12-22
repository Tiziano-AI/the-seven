import { beforeEach, describe, expect, it } from "vitest";
import { setupTestDatabase } from "./stores/testDb";
import { checkAuthValidateLimits } from "./services/authRateLimits";
import { AUTH_VALIDATE_LIMITS } from "./domain/authLimits";
import { checkDemoConsumeLimits } from "./services/demoRateLimits";
import { DEMO_CONSUME_LIMITS } from "./domain/demoLimits";
import { deriveByokIdFromApiKey } from "./_core/byok";

beforeEach(() => {
  setupTestDatabase();
});

describe("rate limits", () => {
  it("enforces auth validation limits per BYOK id", async () => {
    const now = new Date("2024-01-01T00:00:00.000Z");
    const byokId = deriveByokIdFromApiKey("rate-limit-test-key");
    const params = { byokId, ip: "127.0.0.1", now };

    for (let i = 0; i < AUTH_VALIDATE_LIMITS.perByokId.limit; i += 1) {
      const decision = await checkAuthValidateLimits(params);
      expect(decision).toBeNull();
    }

    const decision = await checkAuthValidateLimits(params);
    if (!decision) {
      throw new Error("Expected auth validation rate limit to trigger");
    }
    expect(decision.allowed).toBe(false);
    expect(decision.scope).toBe(`auth:validate:byok:${byokId}`);
    expect(decision.limit).toBe(AUTH_VALIDATE_LIMITS.perByokId.limit);
  });

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
});
