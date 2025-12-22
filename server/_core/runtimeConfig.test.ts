import { describe, expect, it } from "vitest";
import {
  loadDevDisableOpenRouterKeyValidation,
  loadNodeEnv,
  loadOpenRouterAppHeaders,
  loadPreferredPort,
  loadSqlitePath,
  loadServerRuntimeConfig,
} from "./runtimeConfig";

describe("runtimeConfig", () => {
  describe("loadNodeEnv", () => {
    it("defaults to development", () => {
      expect(loadNodeEnv({})).toBe("development");
    });

    it("accepts production", () => {
      expect(loadNodeEnv({ NODE_ENV: "production" })).toBe("production");
    });

    it("rejects unknown NODE_ENV values", () => {
      expect(() => loadNodeEnv({ NODE_ENV: "staging" })).toThrow(/NODE_ENV/);
    });
  });

  describe("loadPreferredPort", () => {
    it("defaults to 3000", () => {
      expect(loadPreferredPort({})).toBe(3000);
    });

    it("accepts a valid integer port", () => {
      expect(loadPreferredPort({ PORT: "8080" })).toBe(8080);
    });

    it("rejects non-integer ports", () => {
      expect(() => loadPreferredPort({ PORT: "3O00" })).toThrow(/PORT/);
    });

    it("rejects out-of-range ports", () => {
      expect(() => loadPreferredPort({ PORT: "70000" })).toThrow(/PORT/);
    });
  });

  describe("loadSqlitePath", () => {
    it("defaults to data/the-seven.db", () => {
      expect(loadSqlitePath({})).toBe("data/the-seven.db");
    });

    it("accepts overrides", () => {
      expect(loadSqlitePath({ SEVEN_DB_PATH: "tmp/dev.db" })).toBe("tmp/dev.db");
    });
  });

  describe("loadServerRuntimeConfig", () => {
    it("defaults sqlite.path when unset", () => {
      expect(loadServerRuntimeConfig({}).sqlite.path).toBe("data/the-seven.db");
    });

    it("uses sqlite.path override when set", () => {
      expect(loadServerRuntimeConfig({ SEVEN_DB_PATH: "tmp/app.db" }).sqlite.path).toBe("tmp/app.db");
    });

    it("defaults dev.disableOpenRouterKeyValidation to false", () => {
      expect(loadServerRuntimeConfig({}).dev.disableOpenRouterKeyValidation).toBe(false);
    });

    it("allows disabling OpenRouter key validation in development only", () => {
      expect(
        loadServerRuntimeConfig({
          NODE_ENV: "development",
          SEVEN_DEV_DISABLE_OPENROUTER_KEY_VALIDATION: "1",
        }).dev.disableOpenRouterKeyValidation
      ).toBe(true);

      expect(() =>
        loadServerRuntimeConfig({
          NODE_ENV: "production",
          SEVEN_DEV_DISABLE_OPENROUTER_KEY_VALIDATION: "1",
        })
      ).toThrow(/SEVEN_DEV_DISABLE_OPENROUTER_KEY_VALIDATION/);
    });
  });

  describe("loadDevDisableOpenRouterKeyValidation", () => {
    it("defaults to false", () => {
      expect(loadDevDisableOpenRouterKeyValidation({})).toBe(false);
    });

    it("accepts 0 and 1", () => {
      expect(loadDevDisableOpenRouterKeyValidation({ SEVEN_DEV_DISABLE_OPENROUTER_KEY_VALIDATION: "0" })).toBe(false);
      expect(loadDevDisableOpenRouterKeyValidation({ SEVEN_DEV_DISABLE_OPENROUTER_KEY_VALIDATION: "1" })).toBe(true);
    });

    it("rejects unknown values", () => {
      expect(() =>
        loadDevDisableOpenRouterKeyValidation({
          SEVEN_DEV_DISABLE_OPENROUTER_KEY_VALIDATION: "yes",
        })
      ).toThrow(/SEVEN_DEV_DISABLE_OPENROUTER_KEY_VALIDATION/);
    });
  });

  describe("loadOpenRouterAppHeaders", () => {
    it("uses defaults when unset", () => {
      expect(loadOpenRouterAppHeaders({})).toEqual({
        "HTTP-Referer": "http://localhost:3000",
        "X-Title": "The Seven",
      });
    });

    it("uses env overrides", () => {
      expect(
        loadOpenRouterAppHeaders({
          SEVEN_PUBLIC_ORIGIN: "https://example.com",
          SEVEN_APP_NAME: "Example",
        })
      ).toEqual({
        "HTTP-Referer": "https://example.com",
        "X-Title": "Example",
      });
    });
  });
});
