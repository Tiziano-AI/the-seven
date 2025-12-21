import { beforeEach, describe, expect, it } from "vitest";
import { TRPCError } from "@trpc/server";
import { appRouter } from "./routers";
import { deriveByokIdFromApiKey, isByokId } from "./_core/byok";
import { setupTestDatabase } from "./stores/testDb";

beforeEach(() => {
  setupTestDatabase();
});

describe("BYOK identity", () => {
  it("derives a stable sha256 hex byok id from an API key", () => {
    const byokId = deriveByokIdFromApiKey("hello");
    expect(byokId).toBe(
      "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824"
    );
  });

  it("validates byok id format (64 lowercase hex chars)", () => {
    expect(
      isByokId("2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824")
    ).toBe(true);
    expect(isByokId("2CF24DBA5FB0A30E26E83B2AC5B9E29E1B161E5C1FA7425E73043362938B9824")).toBe(
      false
    );
    expect(isByokId("not-a-hash")).toBe(false);
    expect(isByokId("")).toBe(false);
  });
});

describe("BYOK tRPC auth", () => {
  it("rejects authenticated procedures when the key is missing", async () => {
    const caller = appRouter.createCaller({ apiKey: null, traceId: "test" });

    await expect(caller.councils.list()).rejects.toBeInstanceOf(TRPCError);
    await expect(caller.councils.list()).rejects.toMatchObject({
      code: "UNAUTHORIZED",
      message: "Missing OpenRouter API key",
    });
  });

  it("supports SQLite-backed storage for built-in councils", async () => {
    const caller = appRouter.createCaller({ apiKey: "test", traceId: "test" });
    const result = await caller.councils.list();
    expect(result.councils).toHaveLength(2);
    expect(result.councils.map((c) => c.ref.kind)).toEqual(["built_in", "built_in"]);
  });
});
