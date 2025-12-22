import { beforeEach, describe, expect, it } from "vitest";
import { deriveByokIdFromApiKey, isByokId } from "./_core/byok";
import { setupTestDatabase } from "./stores/testDb";
import { handleValidateKey } from "./edges/http/authHandlers";
import { EdgeError } from "./edges/http/errors";
import type { RequestContext } from "./edges/http/context";
import { handleCouncilsList } from "./edges/http/councilHandlers";
import { getOrCreateByokUserContext } from "./workflows/byokUser";

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

describe("BYOK HTTP auth", () => {
  it("rejects validate when the key is missing", async () => {
    const ctx: RequestContext = {
      traceId: "test",
      now: new Date(),
      ip: null,
      ingress: { source: "web", version: null },
      auth: { kind: "none" },
    };

    await expect(handleValidateKey(ctx)).rejects.toBeInstanceOf(EdgeError);
    await expect(handleValidateKey(ctx)).rejects.toMatchObject({
      kind: "unauthorized",
      message: "Missing OpenRouter API key",
    });
  });

  it("supports SQLite-backed storage for built-in councils", async () => {
    const context = await getOrCreateByokUserContext("test");
    const ctx: RequestContext = {
      traceId: "test",
      now: new Date(),
      ip: null,
      ingress: { source: "web", version: null },
      auth: {
        kind: "byok",
        userId: context.user.id,
        byokId: context.byokId,
        openRouterKey: "test",
      },
    };

    const result = await handleCouncilsList(ctx);
    expect(result.councils).toHaveLength(3);
    expect(result.councils.map((council) => council.ref.kind)).toEqual([
      "built_in",
      "built_in",
      "built_in",
    ]);
  });
});
