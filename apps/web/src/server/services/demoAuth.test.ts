import { beforeEach, describe, expect, test, vi } from "vitest";

const dbMocks = vi.hoisted(() => ({
  createDemoMagicLink: vi.fn(),
  createDemoSession: vi.fn(),
  getDemoMagicLinkByTokenHash: vi.fn(),
  getDemoSessionByTokenHash: vi.fn(),
  getOrCreateUser: vi.fn(),
  getUserById: vi.fn(),
  markDemoMagicLinkUsed: vi.fn(),
  revokeDemoSession: vi.fn(),
  touchDemoSession: vi.fn(),
}));

const resendMocks = vi.hoisted(() => ({
  sendResendEmail: vi.fn(),
}));

const tokenMocks = vi.hoisted(() => ({
  createDemoToken: vi.fn(),
  hashDemoToken: vi.fn(),
}));

vi.mock("server-only", () => ({}));

vi.mock("@the-seven/config", () => ({
  DEMO_AUTH_LINK_TTL_HOURS: 24,
  DEMO_SESSION_TTL_HOURS: 24,
  serverRuntime: vi.fn(() => ({
    publicOrigin: "http://localhost:3000",
    demo: {
      enabled: true,
      openRouterApiKey: "demo-openrouter-key",
      resendApiKey: "resend-key",
      emailFrom: "hello@example.com",
    },
  })),
}));

vi.mock("@the-seven/db", () => dbMocks);
vi.mock("../adapters/resend", () => resendMocks);
vi.mock("../domain/demoTokens", () => tokenMocks);

async function loadDemoAuth() {
  return import("./demoAuth");
}

describe("demoAuth service", () => {
  beforeEach(() => {
    vi.resetModules();
    for (const mock of [
      dbMocks.createDemoMagicLink,
      dbMocks.createDemoSession,
      dbMocks.getDemoMagicLinkByTokenHash,
      dbMocks.getDemoSessionByTokenHash,
      dbMocks.getOrCreateUser,
      dbMocks.getUserById,
      dbMocks.markDemoMagicLinkUsed,
      dbMocks.revokeDemoSession,
      dbMocks.touchDemoSession,
      resendMocks.sendResendEmail,
      tokenMocks.createDemoToken,
      tokenMocks.hashDemoToken,
    ]) {
      mock.mockReset();
    }
  });

  test("requests demo links with normalized email and resend idempotency", async () => {
    dbMocks.getOrCreateUser.mockResolvedValue({ id: 7 });
    tokenMocks.createDemoToken.mockReturnValue({
      token: "demo-token",
      tokenHash: "demo-token-hash",
    });

    const { requestDemoAuthLink } = await loadDemoAuth();
    const result = await requestDemoAuthLink({
      email: "User@Example.com",
      requestIp: "127.0.0.1",
      now: new Date("2026-04-02T12:00:00.000Z"),
    });

    expect(result).toEqual({ email: "user@example.com" });
    expect(dbMocks.getOrCreateUser).toHaveBeenCalledWith({
      kind: "demo",
      principal: "user@example.com",
    });
    expect(dbMocks.createDemoMagicLink).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 7,
        tokenHash: "demo-token-hash",
        requestedIp: "127.0.0.1",
      }),
    );
    expect(resendMocks.sendResendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        apiKey: "resend-key",
        idempotencyKey: "demo-token-hash",
        payload: expect.objectContaining({
          from: "hello@example.com",
          to: ["user@example.com"],
          subject: "Your The Seven demo seal",
          html: expect.stringMatching(
            /one-time demo seal[\s\S]*24-hour Commons Council demo seal/u,
          ),
          text: expect.stringMatching(
            /Open the Commons Council demo: http:\/\/localhost:3000\/api\/v1\/demo\/consume\?token=demo-token[\s\S]*24-hour Commons Council demo seal/u,
          ),
        }),
      }),
    );
  });

  test("consuming an expired demo link raises the canonical error", async () => {
    tokenMocks.hashDemoToken.mockReturnValue("hash-1");
    dbMocks.getDemoMagicLinkByTokenHash.mockResolvedValue({
      id: 3,
      userId: 7,
      usedAt: null,
      expiresAt: new Date("2026-04-01T12:00:00.000Z"),
    });

    const { consumeDemoAuthLink } = await loadDemoAuth();

    await expect(
      consumeDemoAuthLink({
        token: "expired-token",
        consumedIp: "127.0.0.1",
        now: new Date("2026-04-02T12:00:00.000Z"),
      }),
    ).rejects.toMatchObject({
      kind: "link_expired",
    });
  });

  test("consumes active links and issues a demo session", async () => {
    tokenMocks.hashDemoToken.mockReturnValue("hash-1");
    tokenMocks.createDemoToken.mockReturnValue({
      token: "session-token",
      tokenHash: "session-hash",
    });
    dbMocks.getDemoMagicLinkByTokenHash.mockResolvedValue({
      id: 3,
      userId: 7,
      usedAt: null,
      expiresAt: new Date("2026-04-03T12:00:00.000Z"),
    });
    dbMocks.markDemoMagicLinkUsed.mockResolvedValue(true);
    dbMocks.getUserById.mockResolvedValue({
      id: 7,
      kind: "demo",
      principal: "user@example.com",
    });

    const { consumeDemoAuthLink } = await loadDemoAuth();
    const result = await consumeDemoAuthLink({
      token: "active-token",
      consumedIp: "127.0.0.1",
      now: new Date("2026-04-02T12:00:00.000Z"),
    });

    expect(dbMocks.markDemoMagicLinkUsed).toHaveBeenCalledWith({
      id: 3,
      usedAt: new Date("2026-04-02T12:00:00.000Z"),
      consumedIp: "127.0.0.1",
    });
    expect(dbMocks.createDemoSession).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 7,
        tokenHash: "session-hash",
      }),
    );
    expect(result).toMatchObject({
      email: "user@example.com",
      token: "session-token",
    });
  });

  test("resolves active demo session context with the session row id", async () => {
    tokenMocks.hashDemoToken.mockReturnValue("session-hash");
    dbMocks.getDemoSessionByTokenHash.mockResolvedValue({
      id: 11,
      userId: 7,
      expiresAt: new Date("2026-04-03T12:00:00.000Z"),
    });
    dbMocks.getUserById.mockResolvedValue({
      id: 7,
      kind: "demo",
      principal: "user@example.com",
    });

    const { getDemoSessionContext } = await loadDemoAuth();
    const result = await getDemoSessionContext({
      token: "session-token",
      now: new Date("2026-04-02T12:00:00.000Z"),
    });

    expect(result).toEqual({
      kind: "active",
      sessionId: 11,
      userId: 7,
      principal: "user@example.com",
      expiresAt: new Date("2026-04-03T12:00:00.000Z").getTime(),
    });
  });

  test("missing or revoked demo session context is invalid", async () => {
    tokenMocks.hashDemoToken.mockReturnValue("session-hash");
    dbMocks.getDemoSessionByTokenHash.mockResolvedValue(null);

    const { getDemoSessionContext } = await loadDemoAuth();
    const result = await getDemoSessionContext({
      token: "revoked-token",
      now: new Date("2026-04-02T12:00:00.000Z"),
    });

    expect(result).toEqual({ kind: "missing" });
  });

  test("revokes the active demo session row", async () => {
    dbMocks.revokeDemoSession.mockResolvedValue(true);

    const { endDemoSession } = await loadDemoAuth();
    const revoked = await endDemoSession({
      sessionId: 11,
      now: new Date("2026-04-02T12:00:00.000Z"),
    });

    expect(revoked).toBe(true);
    expect(dbMocks.revokeDemoSession).toHaveBeenCalledWith({
      id: 11,
      revokedAt: new Date("2026-04-02T12:00:00.000Z"),
    });
  });
});
